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
import { Resend } from "resend";
import { db, siteSettingsTable, adminLoginSessionsTable, adminRecoveryCodesTable, adminOtpChallengesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAdminKey, sha256hex, clearAdmin2faCache } from "../middlewares/isAdmin";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { logger } from "../lib/logger";
import { sendSms } from "../lib/sms";

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

// ── OTP helpers ──────────────────────────────────────────────────────────────

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

/** Generates a cryptographically random 6-digit OTP string. */
function generateOtp(): string {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

/** Masks an email: first char + *** + last char (if >2) of local part + @ + domain. */
function maskEmail(email: string): string {
  const atIdx = email.lastIndexOf("@");
  if (atIdx < 1) return "***";
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  const first = local[0] ?? "*";
  const last = local.length > 2 ? local[local.length - 1] : "";
  return `${first}***${last}@${domain}`;
}

/** Masks a mobile: keeps first 3 and last 3 chars, masks the middle. */
function maskMobile(mobile: string): string {
  const stripped = mobile.replace(/\s/g, "");
  if (stripped.length <= 6) return "***";
  const stars = "*".repeat(Math.max(4, stripped.length - 6));
  return `${stripped.slice(0, 3)}${stars}${stripped.slice(-3)}`;
}

/**
 * Sends the 2FA setup OTP via email.
 * Requires RESEND_API_KEY to be configured in all environments.
 * The OTP is a security credential and must never be written to logs or errors.
 */
async function sendAdminEmailOtp(email: string, otp: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    // RESEND_API_KEY is required in every environment — admin 2FA OTP delivery
    // cannot fall back to logs because logs are broadly accessible and durable.
    // Configure RESEND_API_KEY in the environment secrets to enable this flow.
    throw new Error("RESEND_API_KEY is not configured; cannot deliver admin 2FA email OTP");
  }
  const { error } = await resend.emails.send({
    from: "TwirlDrape <orders@twirldrape.com>",
    to: [email],
    subject: "TwirlDrape Admin — Your 2FA Verification Code",
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;">
      <h2 style="color:#0D1B36;margin-bottom:8px;">2FA Setup Verification</h2>
      <p style="color:#555;font-size:14px;">Use the code below to complete your Two-Factor Authentication setup.</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:0.3em;color:#0D1B36;background:#f5f5f0;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">${otp}</div>
      <p style="color:#888;font-size:12px;">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
    </div>`,
  });
  if (error) {
    logger.error({ error, email }, "[admin2fa] Resend failed to deliver email OTP");
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

/**
 * Atomically creates or replaces an OTP challenge for the given type.
 * Uses INSERT ON CONFLICT DO UPDATE so there is never more than one row per type
 * and the operation is a single atomic statement (no delete/insert race).
 */
async function upsertOtpChallenge(type: "email" | "sms"): Promise<string> {
  const otp = generateOtp();
  const codeHash = sha256hex(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const now = new Date();
  await db
    .insert(adminOtpChallengesTable)
    .values({ type, codeHash, expiresAt, attempts: 0, createdAt: now })
    .onConflictDoUpdate({
      target: adminOtpChallengesTable.type,
      set: { codeHash, expiresAt, attempts: 0, createdAt: now },
    });
  return otp;
}

// ── Setup stage helpers ───────────────────────────────────────────────────────
// "admin_2fa_setup_stage" in site_settings tracks which factor has been verified
// so that each OTP endpoint can gate on the preceding factor being complete.
// Possible values: "totp_verified" | "email_otp_verified"
// The key is deleted when setup completes or is abandoned.

async function getSetupStage(): Promise<string | null> {
  return getSetting("admin_2fa_setup_stage");
}
async function setSetupStage(stage: "totp_verified" | "email_otp_verified"): Promise<void> {
  return upsertSetting("admin_2fa_setup_stage", stage);
}
async function clearSetupStage(): Promise<void> {
  return deleteSetting("admin_2fa_setup_stage");
}

/**
 * Returns seconds remaining in the resend cooldown for the given type.
 * Returns 0 if the cooldown has elapsed or no challenge exists.
 */
async function checkResendCooldown(type: "email" | "sms"): Promise<number> {
  const [row] = await db
    .select({ createdAt: adminOtpChallengesTable.createdAt })
    .from(adminOtpChallengesTable)
    .where(eq(adminOtpChallengesTable.type, type));
  if (!row) return 0;
  const elapsedSeconds = (Date.now() - new Date(row.createdAt).getTime()) / 1000;
  return elapsedSeconds < 60 ? Math.ceil(60 - elapsedSeconds) : 0;
}

type OtpVerifyResult =
  | { ok: true }
  | { ok: false; code: "NO_CHALLENGE" | "OTP_EXPIRED" | "TOO_MANY_ATTEMPTS" | "OTP_INVALID"; attemptsRemaining?: number };

/**
 * Atomically verifies an OTP challenge inside a serialised transaction.
 * Uses SELECT FOR UPDATE so concurrent requests cannot race the attempt counter.
 */
async function verifyOtpChallenge(type: "email" | "sms", plainCode: string): Promise<OtpVerifyResult> {
  return db.transaction(async (tx) => {
    // Lock the row for this type — blocks any concurrent verification.
    const [challenge] = await (tx as any)
      .select()
      .from(adminOtpChallengesTable)
      .where(eq(adminOtpChallengesTable.type, type))
      .for("update");

    if (!challenge) return { ok: false, code: "NO_CHALLENGE" as const };

    if (new Date() > new Date(challenge.expiresAt)) {
      await tx.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.id, challenge.id));
      return { ok: false, code: "OTP_EXPIRED" as const };
    }

    if (challenge.attempts >= 5) {
      await tx.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.id, challenge.id));
      return { ok: false, code: "TOO_MANY_ATTEMPTS" as const };
    }

    const submittedHash = sha256hex(plainCode.replace(/\s/g, ""));
    if (submittedHash !== challenge.codeHash) {
      const newAttempts = challenge.attempts + 1;
      if (newAttempts >= 5) {
        // Used last allowed attempt — invalidate immediately.
        await tx.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.id, challenge.id));
        return { ok: false, code: "TOO_MANY_ATTEMPTS" as const };
      }
      await tx
        .update(adminOtpChallengesTable)
        .set({ attempts: newAttempts })
        .where(eq(adminOtpChallengesTable.id, challenge.id));
      return { ok: false, code: "OTP_INVALID" as const, attemptsRemaining: 5 - newAttempts };
    }

    // Correct code — consume the challenge.
    await tx.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.id, challenge.id));
    return { ok: true };
  });
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

/** Stricter limit for OTP verification endpoints — 10 requests per 15 minutes per IP. */
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many verification attempts. Please try again in 15 minutes.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  keyGenerator: (req: any) => getIp(req),
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
// Recovery-code login has been retired. Recovery codes are no longer issued or
// accepted. Use your authenticator app to sign in.

router.post("/admin/2fa/login/recovery", loginLimiter, requireAdminKey, (_req: any, res: any) => {
  res.status(410).json({
    error: "Recovery codes have been retired. Please use your authenticator app to sign in.",
    code: "RECOVERY_CODES_RETIRED",
  });
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
    // Clear any previous setup stage and stale OTP challenges.
    await Promise.all([
      upsertSetting("admin_2fa_secret_pending", secret),
      clearSetupStage(),
      db.delete(adminOtpChallengesTable),
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

    // TOTP verified — check email is configured before proceeding
    const email = await getSetting("admin_email");
    if (!email) {
      return res.status(400).json({
        error: "No admin email configured. Please set your email in Profile Settings before enabling 2FA.",
        code: "EMAIL_NOT_CONFIGURED",
      });
    }

    const otp = await upsertOtpChallenge("email");
    await sendAdminEmailOtp(email, otp);
    // Record that TOTP was verified — gates subsequent email OTP operations.
    await setSetupStage("totp_verified");
    writeAuditLog({ action: "2fa_setup_totp_verified", module: "Security", ipAddress: getIp(req) }).catch(() => {});

    res.json({ step: "email_otp", maskedEmail: maskEmail(email) });
  } catch (err) {
    logger.error({ err }, "[admin2fa] setup/verify error");
    res.status(500).json({ error: "Failed to proceed with 2FA setup" });
  }
});

// ── POST /api/admin/2fa/setup/verify-email-otp ────────────────────────────────
// Verifies the email OTP atomically. On success, sends an SMS OTP (next step).

router.post("/admin/2fa/setup/verify-email-otp", requireAdminKey, otpVerifyLimiter, async (req: any, res: any) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Verification code is required" });
  }
  const ip = getIp(req);
  try {
    // Enforce ordering: TOTP must have been verified in this setup session first.
    const stage = await getSetupStage();
    if (stage !== "totp_verified") {
      return res.status(400).json({
        error: "TOTP verification has not been completed. Please restart setup.",
        code: "INVALID_SETUP_STAGE",
      });
    }
    const result = await verifyOtpChallenge("email", code);

    if (!result.ok) {
      const messages: Record<string, string> = {
        NO_CHALLENGE:      "No email verification in progress. Please restart setup.",
        OTP_EXPIRED:       "Verification code has expired. Please restart setup.",
        TOO_MANY_ATTEMPTS: "Too many failed attempts. Please restart setup.",
      };
      const status = result.code === "OTP_INVALID" ? 400 : 400;
      const msg = messages[result.code] ?? (
        result.attemptsRemaining != null
          ? `Incorrect code. ${result.attemptsRemaining} attempt${result.attemptsRemaining !== 1 ? "s" : ""} remaining.`
          : "Incorrect code."
      );
      writeAuditLog({ action: "2fa_setup_email_otp_failed", module: "Security", ipAddress: ip, status: "failure" }).catch(() => {});
      return res.status(status).json({ error: msg, code: result.code, attemptsRemaining: result.attemptsRemaining });
    }

    writeAuditLog({ action: "2fa_setup_email_otp_verified", module: "Security", ipAddress: ip }).catch(() => {});

    const mobile = await getSetting("admin_mobile");
    if (!mobile) {
      return res.status(400).json({
        error: "No mobile number configured. Please set your mobile in Profile Settings before enabling 2FA.",
        code: "MOBILE_NOT_CONFIGURED",
      });
    }

    const otp = await upsertOtpChallenge("sms");
    await sendSms(mobile, `TwirlDrape Admin 2FA: Your verification code is ${otp}. Valid for 5 minutes. Do not share.`);
    // Advance stage — gates SMS OTP operations.
    await setSetupStage("email_otp_verified");

    res.json({ step: "sms_otp", maskedMobile: maskMobile(mobile) });
  } catch (err) {
    logger.error({ err }, "[admin2fa] setup/verify-email-otp error");
    res.status(500).json({ error: "Email verification failed" });
  }
});

// ── POST /api/admin/2fa/setup/verify-sms-otp ─────────────────────────────────
// Verifies the SMS OTP atomically. On success, activates 2FA and issues a verified session.

router.post("/admin/2fa/setup/verify-sms-otp", requireAdminKey, otpVerifyLimiter, async (req: any, res: any) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Verification code is required" });
  }
  const ip = getIp(req);
  try {
    // Enforce ordering: email OTP must have been verified before SMS can be accepted.
    const stage = await getSetupStage();
    if (stage !== "email_otp_verified") {
      return res.status(400).json({
        error: "Email verification has not been completed. Please restart setup.",
        code: "INVALID_SETUP_STAGE",
      });
    }
    const result = await verifyOtpChallenge("sms", code);

    if (!result.ok) {
      const messages: Record<string, string> = {
        NO_CHALLENGE:      "No SMS verification in progress. Please restart setup.",
        OTP_EXPIRED:       "Verification code has expired. Please restart setup.",
        TOO_MANY_ATTEMPTS: "Too many failed attempts. Please restart setup.",
      };
      const msg = messages[result.code] ?? (
        result.attemptsRemaining != null
          ? `Incorrect code. ${result.attemptsRemaining} attempt${result.attemptsRemaining !== 1 ? "s" : ""} remaining.`
          : "Incorrect code."
      );
      writeAuditLog({ action: "2fa_setup_sms_otp_failed", module: "Security", ipAddress: ip, status: "failure" }).catch(() => {});
      return res.status(400).json({ error: msg, code: result.code, attemptsRemaining: result.attemptsRemaining });
    }

    // SMS OTP verified — activate 2FA
    const pendingSecret = await getSetting("admin_2fa_secret_pending");
    if (!pendingSecret) {
      return res.status(400).json({ error: "Setup session expired. Please restart setup.", code: "NO_PENDING_SECRET" });
    }

    await Promise.all([
      upsertSetting("admin_2fa_secret", pendingSecret),
      upsertSetting("admin_2fa_enabled", "true"),
      upsertSetting("admin_2fa_enabled_at", new Date().toISOString()),
      deleteSetting("admin_2fa_secret_pending"),
      clearSetupStage(),
    ]);
    clearAdmin2faCache();
    writeAuditLog({ action: "2fa_enabled", module: "Security", ipAddress: ip }).catch(() => {});

    // Issue verified session so the admin isn't locked out immediately
    const { tokenHash, sessionId } = await createVerifiedSession(req);
    res.json({ ok: true, sessionId, tokenHash });
  } catch (err) {
    logger.error({ err }, "[admin2fa] setup/verify-sms-otp error");
    res.status(500).json({ error: "SMS verification failed" });
  }
});

// ── POST /api/admin/2fa/setup/resend-email-otp ───────────────────────────────
// Resends the email OTP. Enforces a 60-second server-side cooldown.

router.post("/admin/2fa/setup/resend-email-otp", requireAdminKey, async (req: any, res: any) => {
  try {
    // Only allow resend if TOTP was verified in this setup session.
    const stage = await getSetupStage();
    if (stage !== "totp_verified") {
      return res.status(400).json({
        error: "TOTP verification has not been completed. Please restart setup.",
        code: "INVALID_SETUP_STAGE",
      });
    }
    const remaining = await checkResendCooldown("email");
    if (remaining > 0) {
      return res.status(429).json({ error: `Please wait ${remaining} seconds before resending.`, secondsRemaining: remaining, code: "RESEND_COOLDOWN" });
    }
    const email = await getSetting("admin_email");
    if (!email) {
      return res.status(400).json({ error: "No admin email configured.", code: "EMAIL_NOT_CONFIGURED" });
    }
    const otp = await upsertOtpChallenge("email");
    await sendAdminEmailOtp(email, otp);
    res.json({ ok: true, maskedEmail: maskEmail(email) });
  } catch (err) {
    logger.error({ err }, "[admin2fa] resend-email-otp error");
    res.status(500).json({ error: "Failed to resend email OTP" });
  }
});

// ── POST /api/admin/2fa/setup/resend-sms-otp ─────────────────────────────────
// Resends the SMS OTP. Enforces a 60-second server-side cooldown.

router.post("/admin/2fa/setup/resend-sms-otp", requireAdminKey, async (req: any, res: any) => {
  try {
    // Only allow SMS resend after email OTP has been verified.
    const stage = await getSetupStage();
    if (stage !== "email_otp_verified") {
      return res.status(400).json({
        error: "Email verification has not been completed. Please restart setup.",
        code: "INVALID_SETUP_STAGE",
      });
    }
    const remaining = await checkResendCooldown("sms");
    if (remaining > 0) {
      return res.status(429).json({ error: `Please wait ${remaining} seconds before resending.`, secondsRemaining: remaining, code: "RESEND_COOLDOWN" });
    }
    const mobile = await getSetting("admin_mobile");
    if (!mobile) {
      return res.status(400).json({ error: "No mobile number configured.", code: "MOBILE_NOT_CONFIGURED" });
    }
    const otp = await upsertOtpChallenge("sms");
    await sendSms(mobile, `TwirlDrape Admin 2FA: Your verification code is ${otp}. Valid for 5 minutes. Do not share.`);
    res.json({ ok: true, maskedMobile: maskMobile(mobile) });
  } catch (err) {
    logger.error({ err }, "[admin2fa] resend-sms-otp error");
    res.status(500).json({ error: "Failed to resend SMS OTP" });
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
// Recovery code regeneration has been retired along with the recovery-code system.

router.post("/admin/2fa/regenerate-codes", requireAdminKey, (_req: any, res: any) => {
  res.status(410).json({
    error: "Recovery codes have been retired and can no longer be regenerated.",
    code: "RECOVERY_CODES_RETIRED",
  });
});

export default router;
