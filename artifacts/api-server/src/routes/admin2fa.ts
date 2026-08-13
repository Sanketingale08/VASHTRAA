/**
 * Super Admin Two-Factor Authentication (TOTP) routes.
 *
 * Login flow  (requires only x-admin-key, no session needed):
 *   GET  /api/admin/2fa/status          — check if 2FA is enabled
 *   POST /api/admin/2fa/login/verify    — verify TOTP code, issue verified session
 *   POST /api/admin/2fa/login/recovery  — use a recovery code, issue verified session
 *
 * Setup & management (require x-admin-key AND verified session when 2FA is on):
 *   POST /api/admin/2fa/setup/start     — generate TOTP secret + QR code
 *   POST /api/admin/2fa/setup/verify    — verify first TOTP, enable 2FA, return recovery codes
 *   POST /api/admin/2fa/disable         — disable 2FA (requires key + TOTP)
 *   POST /api/admin/2fa/regenerate-codes — generate new recovery codes (requires key + TOTP)
 */

import { Router } from "express";
import crypto from "crypto";
import { generateSecret, verifySync, generateURI } from "otplib";
import QRCode from "qrcode";
import rateLimit from "express-rate-limit";
import { db, siteSettingsTable, adminLoginSessionsTable, adminRecoveryCodesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminKey, sha256hex, clearAdmin2faCache } from "../middlewares/isAdmin";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, key));
  return row?.value ?? null;
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(siteSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: siteSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

async function deleteSetting(key: string): Promise<void> {
  await db.delete(siteSettingsTable).where(eq(siteSettingsTable.key, key));
}

function parseUA(ua: string = ""): { device: string; os: string; browser: string } {
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

/** Creates an admin_login_sessions row with two_factor_verified = true. Returns tokenHash + sessionId. */
async function createVerifiedSession(req: any): Promise<{ tokenHash: string; sessionId: string }> {
  const key = (req.headers["x-admin-key"] as string) ?? "";
  const ua = (req.headers["user-agent"] as string) ?? "";
  const ip = getIp(req);
  const { device, os, browser } = parseUA(ua);
  const tokenHash = sha256hex(key + ip + ua + crypto.randomBytes(16).toString("hex"));

  const [session] = await db
    .insert(adminLoginSessionsTable)
    .values({
      sessionTokenHash: tokenHash,
      ipAddress: ip,
      userAgent: ua,
      device,
      os,
      browser,
      location: "India",
      twoFactorVerified: true,
    })
    .returning({ id: adminLoginSessionsTable.id });

  return { tokenHash, sessionId: session.id };
}

/** Validates the provided TOTP code against the stored 2FA secret. */
async function validateTOTP(code: string): Promise<boolean> {
  const secret = await getSetting("admin_2fa_secret");
  if (!secret) return false;
  try {
    return verifySync({ token: code.replace(/\s/g, ""), secret, strategy: "totp", epochTolerance: 1 }).valid;
  } catch {
    return false;
  }
}

/** Generates a display-friendly recovery code (format: XXXXX-XXXXX). */
function generateRecoveryCode(): string {
  return crypto.randomBytes(5).toString("hex").toUpperCase() +
    "-" +
    crypto.randomBytes(5).toString("hex").toUpperCase();
}

/** Generates 10 recovery codes, stores hashes in DB, returns plain codes. */
async function generateAndStoreRecoveryCodes(): Promise<string[]> {
  const codes: string[] = [];
  const rows: { codeHash: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const plain = generateRecoveryCode();
    codes.push(plain);
    rows.push({ codeHash: sha256hex(plain) });
  }
  await db.insert(adminRecoveryCodesTable).values(rows);
  return codes;
}

// ── Rate limiters ─────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many verification attempts. Please try again in 15 minutes.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  keyGenerator: (req) => getIp(req),
});

// ── GET /api/admin/2fa/status ─────────────────────────────────────────────────
// Accessible with only the admin key (needed during login flow, before session exists).

router.get("/admin/2fa/status", requireAdminKey, async (_req: any, res: any) => {
  try {
    const enabled = (await getSetting("admin_2fa_enabled")) === "true";
    const enabledAt = enabled ? await getSetting("admin_2fa_enabled_at") : null;
    res.json({ enabled, enabledAt });
  } catch {
    res.status(500).json({ error: "Failed to fetch 2FA status" });
  }
});

// ── POST /api/admin/2fa/login/verify ─────────────────────────────────────────
// Verifies a TOTP code during login; only requires key, creates a verified session.

router.post("/admin/2fa/login/verify", loginLimiter, requireAdminKey, async (req: any, res: any) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Verification code is required" });
  }
  const ip = getIp(req);
  try {
    const valid = await validateTOTP(code);
    if (!valid) {
      writeAuditLog({ action: "2fa_login_failed", module: "Security", ipAddress: ip, status: "failure" }).catch(() => {});
      return res.status(403).json({ error: "Invalid verification code. Please try again.", code: "2FA_INVALID" });
    }
    const { tokenHash, sessionId } = await createVerifiedSession(req);
    writeAuditLog({ action: "2fa_login_success", module: "Security", ipAddress: ip }).catch(() => {});
    res.json({ sessionId, tokenHash });
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// ── POST /api/admin/2fa/login/recovery ───────────────────────────────────────
// Authenticates the admin using a one-time recovery code.  Each code can only
// be used once; it is marked used immediately after a successful lookup.

router.post("/admin/2fa/login/recovery", loginLimiter, requireAdminKey, async (req: any, res: any) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Recovery code is required" });
  }
  const ip = getIp(req);
  try {
    const codeHash = sha256hex(code.trim().toUpperCase());
    const [row] = await db
      .select({ id: adminRecoveryCodesTable.id, used: adminRecoveryCodesTable.used })
      .from(adminRecoveryCodesTable)
      .where(eq(adminRecoveryCodesTable.codeHash, codeHash));

    if (!row || row.used) {
      writeAuditLog({ action: "2fa_recovery_login_failed", module: "Security", ipAddress: ip, status: "failure" }).catch(() => {});
      return res.status(403).json({ error: "Invalid or already-used recovery code.", code: "2FA_INVALID" });
    }

    // Mark the code as used (one-time only).
    await db
      .update(adminRecoveryCodesTable)
      .set({ used: true, usedAt: new Date() })
      .where(eq(adminRecoveryCodesTable.id, row.id));

    const { tokenHash, sessionId } = await createVerifiedSession(req);
    writeAuditLog({ action: "2fa_recovery_login_success", module: "Security", ipAddress: ip }).catch(() => {});
    res.json({ sessionId, tokenHash });
  } catch (err) {
    logger.error({ err }, "[admin2fa] recovery login error");
    res.status(500).json({ error: "Recovery login failed" });
  }
});

// ── POST /api/admin/2fa/setup/start ──────────────────────────────────────────
// Generates a new TOTP secret and returns the QR code + manual key.

router.post("/admin/2fa/setup/start", requireAdminKey, async (req: any, res: any) => {
  try {
    // Confirm access key in body for extra assurance
    const { accessKey } = req.body ?? {};
    if (!accessKey) {
      return res.status(400).json({ error: "Access key confirmation is required" });
    }
    // Key is already validated by requireAdminKey middleware

    const secret = generateSecret({ length: 20 });
    const otpauth = generateURI({ issuer: "TwirlDrape", label: "Super Admin", secret, strategy: "totp" });
    const qrDataUrl = await QRCode.toDataURL(otpauth, { errorCorrectionLevel: "M", width: 240 });

    // Store as pending (not enabled yet — must be verified first)
    // Clear any leftover setup stage from a previous abandoned attempt.
    await Promise.all([
      upsertSetting("admin_2fa_secret_pending", secret),
      deleteSetting("admin_2fa_setup_stage"),
    ]);

    res.json({ qrDataUrl, manualKey: secret, otpauth });
  } catch (err) {
    res.status(500).json({ error: "Failed to start 2FA setup" });
  }
});

// ── POST /api/admin/2fa/setup/verify ─────────────────────────────────────────
// Verifies the first TOTP code. On success, sends an email OTP (next step).
// 2FA is NOT activated here — activation happens only after email + SMS OTP.

router.post("/admin/2fa/setup/verify", requireAdminKey, async (req: any, res: any) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Verification code is required" });
  }
  try {
    const pendingSecret = await getSetting("admin_2fa_secret_pending");
    if (!pendingSecret) {
      return res.status(400).json({ error: "No 2FA setup in progress. Please start setup again." });
    }

    let valid = false;
    try {
      valid = verifySync({ token: code.replace(/\s/g, ""), secret: pendingSecret, strategy: "totp", epochTolerance: 1 }).valid;
    } catch { /* invalid format */ }

    if (!valid) {
      return res.status(400).json({ error: "Invalid verification code. Please try again." });
    }

    // TOTP is valid — activate 2FA immediately. No additional OTP step is required.
    await Promise.all([
      upsertSetting("admin_2fa_secret", pendingSecret),
      upsertSetting("admin_2fa_enabled", "true"),
      upsertSetting("admin_2fa_enabled_at", new Date().toISOString()),
      deleteSetting("admin_2fa_secret_pending"),
      deleteSetting("admin_2fa_setup_stage"),
    ]);
    clearAdmin2faCache();

    // Refresh recovery codes so the admin has backup access from the start.
    await db.delete(adminRecoveryCodesTable);
    await generateAndStoreRecoveryCodes();

    writeAuditLog({ action: "2fa_enabled", module: "Security", ipAddress: getIp(req) }).catch(() => {});

    // Issue a verified session so the admin isn't locked out immediately.
    const { tokenHash, sessionId } = await createVerifiedSession(req);
    res.json({ ok: true, sessionId, tokenHash });
  } catch (err) {
    logger.error({ err }, "[admin2fa] setup/verify error");
    res.status(500).json({ error: "Failed to enable 2FA. Please try again." });
  }
});


// ── POST /api/admin/2fa/disable ───────────────────────────────────────────────
// Disables 2FA. Requires access key (middleware) + current TOTP in body.

router.post("/admin/2fa/disable", requireAdminKey, async (req: any, res: any) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Authenticator code is required" });
  }
  try {
    const valid = await validateTOTP(code);
    if (!valid) {
      return res.status(403).json({ error: "Invalid authenticator code." });
    }

    await Promise.all([
      upsertSetting("admin_2fa_enabled", "false"),
      deleteSetting("admin_2fa_secret"),
      deleteSetting("admin_2fa_enabled_at"),
      deleteSetting("admin_2fa_secret_pending"),
    ]);
    await db.delete(adminRecoveryCodesTable);

    clearAdmin2faCache();
    writeAuditLog({ action: "2fa_disabled", module: "Security", ipAddress: getIp(req) }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

// ── POST /api/admin/2fa/regenerate-codes ─────────────────────────────────────
// Generates a fresh set of recovery codes, invalidating the old ones.
// Requires: x-admin-key (middleware) + current TOTP code in body.

router.post("/admin/2fa/regenerate-codes", requireAdminKey, async (req: any, res: any) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Authenticator code is required" });
  }
  try {
    const enabled = (await getSetting("admin_2fa_enabled")) === "true";
    if (!enabled) {
      return res.status(400).json({ error: "2FA is not enabled." });
    }
    const valid = await validateTOTP(code);
    if (!valid) {
      return res.status(403).json({ error: "Invalid authenticator code. Please try again." });
    }

    // Atomically replace all recovery codes so the old set is preserved if the insert fails.
    const plainCodes: string[] = [];
    await db.transaction(async (tx: any) => {
      await tx.delete(adminRecoveryCodesTable);
      const rows: { codeHash: string }[] = [];
      for (let i = 0; i < 10; i++) {
        const plain = generateRecoveryCode();
        plainCodes.push(plain);
        rows.push({ codeHash: sha256hex(plain) });
      }
      await tx.insert(adminRecoveryCodesTable).values(rows);
    });
    const codes = plainCodes;

    writeAuditLog({ action: "2fa_recovery_codes_regenerated", module: "Security", ipAddress: getIp(req) }).catch(() => {});
    res.json({ ok: true, codes });
  } catch (err) {
    logger.error({ err }, "[admin2fa] regenerate-codes error");
    res.status(500).json({ error: "Failed to regenerate recovery codes. Please try again." });
  }
});

export default router;
