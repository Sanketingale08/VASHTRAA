import crypto from "crypto";
import type { Request, Response } from "express";
import { getCollection, isMongoDbConnected, setMongoConnected } from "@workspace/db";
import { signAccessToken, UserRole } from "./jwt";
import { writeAuditLog, getIp } from "./auditLog";
import { logger } from "./logger";

export interface AuthSessionRecord {
  id: string; // Session ID (sid)
  userId: string;
  role: UserRole;
  refreshTokenHash: string;
  previousRefreshTokenHash?: string | null;
  rotatedAt?: number;
  familyId: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  device: string;
  os: string;
  browser: string;
  ipAddress: string;
  isRevoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;
}

const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ROTATION_GRACE_PERIOD_MS = 10 * 1000; // 10 seconds grace period for concurrent refresh calls

// In-memory sessions fallback store
const inMemoryAuthSessions = new Map<string, AuthSessionRecord>();

export function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function parseUserAgent(ua: string = ""): { device: string; os: string; browser: string } {
  let device = "Desktop";
  let os = "Unknown OS";
  let browser = "Unknown Browser";

  if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  if (/mobile|android|iphone|ipod/i.test(ua)) device = "Mobile Phone";
  else if (/tablet|ipad/i.test(ua)) device = "Tablet";

  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua)) browser = "Opera";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";

  return { device, os, browser };
}

async function saveSessionToStore(session: AuthSessionRecord): Promise<void> {
  inMemoryAuthSessions.set(session.id, session);
  if (isMongoDbConnected()) {
    try {
      const col = getCollection<AuthSessionRecord>("auth_sessions");
      await col.updateOne({ id: session.id }, { $set: session }, { upsert: true });
    } catch {
      setMongoConnected(false);
    }
  }
}

export async function findSessionInStore(sessionId: string): Promise<AuthSessionRecord | null> {
  if (!sessionId) return null;
  if (isMongoDbConnected()) {
    try {
      const col = getCollection<AuthSessionRecord>("auth_sessions");
      const found = await col.findOne({ id: sessionId });
      if (found) return found;
    } catch {
      setMongoConnected(false);
    }
  }
  return inMemoryAuthSessions.get(sessionId) || null;
}

/**
 * Creates a brand new authentication session with refresh token & JWT access token.
 */
export async function createAuthSession(
  userId: string,
  email: string,
  role: UserRole,
  req: Request
): Promise<{ accessToken: string; refreshToken: string; session: AuthSessionRecord }> {
  const sessionId = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const rawRefreshToken = crypto.randomBytes(32).toString("hex");
  const refreshTokenHash = sha256hex(rawRefreshToken);

  const ua = req.headers["user-agent"] || "";
  const ipAddress = getIp(req);
  const { device, os, browser } = parseUserAgent(ua);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_EXPIRY_MS);

  const session: AuthSessionRecord = {
    id: sessionId,
    userId,
    role,
    refreshTokenHash,
    familyId,
    createdAt: now,
    lastActivityAt: now,
    expiresAt,
    device,
    os,
    browser,
    ipAddress,
    isRevoked: false,
  };

  await saveSessionToStore(session);

  const accessToken = signAccessToken({
    sub: userId,
    role,
    email: email.trim().toLowerCase(),
    sid: sessionId,
  });

  writeAuditLog({
    eventType: "login_success",
    role,
    userId,
    email,
    ipAddress,
    userAgent: ua,
    metadata: { sessionId, device, browser },
  });

  return { accessToken, refreshToken: rawRefreshToken, session };
}

/**
 * Rotates refresh token securely. Detects refresh token reuse and revokes token family on reuse.
 */
export async function rotateRefreshToken(
  sessionId: string,
  rawRefreshToken: string,
  req: Request
): Promise<{ accessToken: string; refreshToken: string; session: AuthSessionRecord } | null> {
  if (!sessionId || !rawRefreshToken) return null;

  const session = await findSessionInStore(sessionId);
  if (!session || session.isRevoked) {
    logger.warn({ sessionId }, "[Auth Session] Session not found or already revoked");
    return null;
  }

  // Check expiration
  if (new Date() > new Date(session.expiresAt)) {
    await revokeSession(session.id, "session_expired");
    return null;
  }

  const presentedHash = sha256hex(rawRefreshToken.trim());
  const now = Date.now();

  // 1. Expected match: presented token matches active refresh token
  if (presentedHash === session.refreshTokenHash) {
    const newRefreshToken = crypto.randomBytes(32).toString("hex");
    const newHash = sha256hex(newRefreshToken);

    session.previousRefreshTokenHash = session.refreshTokenHash;
    session.refreshTokenHash = newHash;
    session.rotatedAt = now;
    session.lastActivityAt = new Date();
    session.expiresAt = new Date(now + REFRESH_TOKEN_EXPIRY_MS);

    await saveSessionToStore(session);

    const accessToken = signAccessToken({
      sub: session.userId,
      role: session.role,
      email: "",
      sid: session.id,
    });

    writeAuditLog({
      eventType: "token_refresh",
      role: session.role,
      userId: session.userId,
      ipAddress: getIp(req),
      userAgent: req.headers["user-agent"] || "",
      metadata: { sessionId: session.id },
    });

    return { accessToken, refreshToken: newRefreshToken, session };
  }

  // 2. Concurrency grace period match: presented token was rotated < 10s ago
  if (
    session.previousRefreshTokenHash &&
    presentedHash === session.previousRefreshTokenHash &&
    session.rotatedAt &&
    now - session.rotatedAt < ROTATION_GRACE_PERIOD_MS
  ) {
    logger.info({ sessionId }, "[Auth Session] Concurrent refresh request within grace window");
    // Generate valid access token without error
    const accessToken = signAccessToken({
      sub: session.userId,
      role: session.role,
      email: "",
      sid: session.id,
    });
    return { accessToken, refreshToken: rawRefreshToken, session };
  }

  // 3. REUSE DETECTED! Old, invalidated refresh token presented outside grace period.
  logger.error(
    { sessionId, userId: session.userId, familyId: session.familyId },
    "[Auth Session REUSE DETECTED] Revoking all sessions in token family"
  );

  await revokeFamilySessions(session.familyId, "refresh_token_reuse_detected");

  writeAuditLog({
    eventType: "refresh_token_reuse_detected",
    role: session.role,
    userId: session.userId,
    ipAddress: getIp(req),
    userAgent: req.headers["user-agent"] || "",
    metadata: { sessionId: session.id, familyId: session.familyId },
  });

  return null;
}

/**
 * Revokes a single session by session ID.
 */
export async function revokeSession(sessionId: string, reason: string = "user_logout"): Promise<void> {
  const session = await findSessionInStore(sessionId);
  if (!session) return;

  session.isRevoked = true;
  session.revokedAt = new Date();
  session.revokedReason = reason;

  await saveSessionToStore(session);
}

/**
 * Revokes all sessions belonging to a specific token family.
 */
export async function revokeFamilySessions(familyId: string, reason: string): Promise<void> {
  for (const session of inMemoryAuthSessions.values()) {
    if (session.familyId === familyId) {
      session.isRevoked = true;
      session.revokedAt = new Date();
      session.revokedReason = reason;
    }
  }

  if (isMongoDbConnected()) {
    try {
      const col = getCollection<AuthSessionRecord>("auth_sessions");
      await col.updateMany(
        { familyId },
        { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: reason } }
      );
    } catch {
      setMongoConnected(false);
    }
  }
}

/**
 * Revokes all active sessions for a user across all devices (Logout From All Devices).
 */
export async function revokeAllUserSessions(userId: string, role: UserRole, reason: string = "logout_all_devices"): Promise<void> {
  for (const session of inMemoryAuthSessions.values()) {
    if (session.userId === userId && session.role === role) {
      session.isRevoked = true;
      session.revokedAt = new Date();
      session.revokedReason = reason;
    }
  }

  if (isMongoDbConnected()) {
    try {
      const col = getCollection<AuthSessionRecord>("auth_sessions");
      await col.updateMany(
        { userId, role },
        { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: reason } }
      );
    } catch {
      setMongoConnected(false);
    }
  }
}

/**
 * Lists active sessions for a given user & role.
 */
export async function listActiveUserSessions(userId: string, role: UserRole): Promise<AuthSessionRecord[]> {
  const now = new Date();
  if (isMongoDbConnected()) {
    try {
      const col = getCollection<AuthSessionRecord>("auth_sessions");
      return await col
        .find({ userId, role, isRevoked: false, expiresAt: { $gt: now } })
        .sort({ lastActivityAt: -1 })
        .toArray();
    } catch {
      setMongoConnected(false);
    }
  }

  return Array.from(inMemoryAuthSessions.values())
    .filter((s) => s.userId === userId && s.role === role && !s.isRevoked && new Date(s.expiresAt) > now)
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
}

// ─── HTTP-Only Cookie Helpers ─────────────────────────────────────────────────

export function getCookieName(role: UserRole): string {
  switch (role) {
    case "admin":
      return "vastraa_admin_refresh";
    case "seller":
      return "vastraa_seller_refresh";
    case "customer":
    default:
      return "vastraa_customer_refresh";
  }
}

export function getCookiePath(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/api/admin";
    case "seller":
      return "/api/seller";
    case "customer":
    default:
      return "/api/auth";
  }
}

export function setRefreshTokenCookie(res: Response, role: UserRole, refreshToken: string, sessionId: string): void {
  const cookieName = getCookieName(role);
  const cookiePath = getCookiePath(role);
  const isProd = process.env.NODE_ENV === "production";
  const cookieVal = `${sessionId}:${refreshToken}`;

  res.cookie(cookieName, cookieVal, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: cookiePath,
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  });
}

export function clearRefreshTokenCookie(res: Response, role: UserRole): void {
  const cookieName = getCookieName(role);
  const cookiePath = getCookiePath(role);
  const isProd = process.env.NODE_ENV === "production";

  res.cookie(cookieName, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: cookiePath,
    maxAge: 0,
  });
}

export function getRefreshTokenFromReq(req: Request, role: UserRole): { sessionId: string; refreshToken: string } | null {
  const cookieName = getCookieName(role);
  const rawCookie = req.cookies?.[cookieName] || req.cookies?.refresh_token;

  if (rawCookie && typeof rawCookie === "string" && rawCookie.includes(":")) {
    const [sessionId, refreshToken] = rawCookie.split(":");
    if (sessionId && refreshToken) {
      return { sessionId, refreshToken };
    }
  }

  // Fallback to headers
  const headerSessionId = req.headers["x-session-id"] as string;
  const headerRefreshToken = req.headers["x-refresh-token"] as string;
  if (headerSessionId && headerRefreshToken) {
    return { sessionId: headerSessionId.trim(), refreshToken: headerRefreshToken.trim() };
  }

  return null;
}
