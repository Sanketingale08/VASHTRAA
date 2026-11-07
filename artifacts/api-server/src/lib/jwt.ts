import crypto from "crypto";
import { logger } from "./logger";

export type UserRole = "customer" | "seller" | "admin";

export interface JwtPayload {
  sub: string;
  role: UserRole;
  email: string;
  sid: string;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

const runtimeRandomSecret = crypto.randomBytes(64).toString("hex");

export function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (envSecret && envSecret.trim().length >= 32) {
    return envSecret.trim();
  }
  if (process.env.NODE_ENV === "production") {
    logger.error("[JWT] CRITICAL SECURITY ALERT: JWT_SECRET or SESSION_SECRET must be configured with >=32 characters in production. Utilizing cryptographically randomized ephemeral key for process lifetime to prevent static key forgery.");
    return runtimeRandomSecret;
  }
  return envSecret?.trim() || "dev-vastraa-insecure-jwt-secret-do-not-use-in-prod";
}

const JWT_ISSUER = "vastraa-auth";
const JWT_AUDIENCE = "vastraa-portal";
const ACCESS_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

function base64UrlEncode(str: string | Buffer): string {
  const buf = typeof str === "string" ? Buffer.from(str) : str;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Signs a short-lived JWT access token for a given user & role.
 */
export function signAccessToken(payload: {
  sub: string;
  role: UserRole;
  email: string;
  sid?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };

  const fullPayload: JwtPayload = {
    sub: payload.sub,
    role: payload.role,
    email: payload.email,
    sid: payload.sid || crypto.randomUUID(),
    jti: crypto.randomUUID(),
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY_SECONDS,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(signatureInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Verifies a JWT access token signature, expiration, issuer, and audience.
 * Returns decoded payload on success, null on failure.
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = base64UrlEncode(
      crypto.createHmac("sha256", getJwtSecret()).update(signatureInput).digest()
    );

    // Constant-time signature comparison to prevent timing attacks
    const sigBuf = Buffer.from(encodedSignature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn("[JWT] Signature verification failed");
      return null;
    }

    const payloadJson = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadJson) as JwtPayload;

    const now = Math.floor(Date.now() / 1000);

    // Expiration check
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    // Issuer & Audience checks
    if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE) {
      logger.warn({ iss: payload.iss, aud: payload.aud }, "[JWT] Invalid issuer/audience");
      return null;
    }

    if (!payload.sub || !payload.role || !payload.sid) {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Extracts payload without verifying signature (used for logging or expired token inspection).
 */
export function decodeTokenUnverified(token: string): Partial<JwtPayload> | null {
  try {
    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}
