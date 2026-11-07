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
import { db, siteSettingsTable, adminLoginSessionsTable, adminRecoveryCodesTable, adminOtpChallengesTable, mongoSiteSettings, mongoGeneric } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminKey, sha256hex, clearAdmin2faCache } from "../middlewares/isAdmin";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { checkAccountLockout, recordFailedAttempt, recordSuccessfulLogin } from "../lib/authSecurity";
import { logger } from "../lib/logger";
import { sendSms } from "../lib/sms";
import { getSmtpTransporter, getSenderAddress, wrapInTemplate, getVastraaLogoAttachment } from "../lib/transactionalEmail";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  try {
    const mongoVal = await mongoSiteSettings.get(key);
    if (mongoVal !== null) return mongoVal;
  } catch {}
  try {
    const [row] = await db
      .select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function upsertSetting(key: string, value: string): Promise<void> {
  try {
    await mongoSiteSettings.set(key, value);
  } catch {}
  try {
    await db
      .insert(siteSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: siteSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
  } catch {}
}

async function deleteSetting(key: string): Promise<void> {
  try {
    await mongoSiteSettings.delete(key);
  } catch {}
  try {
    await db.delete(siteSettingsTable).where(eq(siteSettingsTable.key, key));
  } catch {}
}

// ── Challenge storage helpers (supports MongoDB & PostgreSQL / Test Mocks) ─────

async function getOtpChallenge(type: string): Promise<{ id: string; type: string; codeHash: string; expiresAt: Date; attempts: number; createdAt: Date } | null> {
  try {
    if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
      const col = await mongoGeneric.getCollection("admin_otp_challenges");
      const doc = await col.findOne({ type });
      if (doc) {
        return {
          id: doc.id || String(doc._id),
          type: doc.type,
          codeHash: doc.codeHash,
          expiresAt: new Date(doc.expiresAt),
          attempts: doc.attempts || 0,
          createdAt: new Date(doc.createdAt),
        };
      }
    }
  } catch {}

  try {
    const [row] = await db
      .select()
      .from(adminOtpChallengesTable)
      .where(eq(adminOtpChallengesTable.type, type));
    if (row) return row;
  } catch {}

  return null;
}

async function saveOtpChallenge(challenge: { type: string; codeHash: string; expiresAt: Date; attempts: number }): Promise<void> {
  const now = new Date();
  try {
    if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
      const col = await mongoGeneric.getCollection("admin_otp_challenges");
      await col.deleteMany({ type: challenge.type });
      await col.insertOne({
        id: crypto.randomUUID(),
        type: challenge.type,
        codeHash: challenge.codeHash,
        expiresAt: challenge.expiresAt,
        attempts: challenge.attempts,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch {}

  try {
    await db.insert(adminOtpChallengesTable).values({
      type: challenge.type,
      codeHash: challenge.codeHash,
      expiresAt: challenge.expiresAt,
      attempts: challenge.attempts,
    });
  } catch {}
}

async function deleteOtpChallenges(type?: string): Promise<void> {
  try {
    if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
      const col = await mongoGeneric.getCollection("admin_otp_challenges");
      if (type) {
        await col.deleteMany({ type });
      } else {
        await col.deleteMany({});
      }
    }
  } catch {}

  try {
    if (type) {
      await db.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.type, type));
    } else {
      await db.delete(adminOtpChallengesTable);
    }
  } catch {}
}

async function updateOtpChallengeAttempts(type: string, attempts: number): Promise<void> {
  try {
    if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
      const col = await mongoGeneric.getCollection("admin_otp_challenges");
      await col.updateOne({ type }, { $set: { attempts, updatedAt: new Date() } });
    }
  } catch {}

  try {
    await db
      .update(adminOtpChallengesTable)
      .set({ attempts })
      .where(eq(adminOtpChallengesTable.type, type));
  } catch {}
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
  const sessionId = crypto.randomUUID();

  // Save to MongoDB collection 'admin_sessions' (inspected by isAdmin middleware)
  try {
    if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
      const col = await mongoGeneric.getCollection("admin_sessions");
      await col.insertOne({
        id: sessionId,
        sessionTokenHash: tokenHash,
        ipAddress: ip,
        userAgent: ua,
        device,
        os,
        browser,
        location: "India",
        twoFactorVerified: true,
        revokedAt: null,
        createdAt: new Date(),
      });
    }
  } catch {}

  // Save to PostgreSQL / test mock
  try {
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
    if (session?.id) return { tokenHash, sessionId: session.id };
  } catch {}

  return { tokenHash, sessionId };
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
  const mongoDocs: any[] = [];
  for (let i = 0; i < 10; i++) {
    const plain = generateRecoveryCode();
    codes.push(plain);
    const codeHash = sha256hex(plain);
    rows.push({ codeHash });
    mongoDocs.push({
      id: crypto.randomUUID(),
      codeHash,
      used: false,
      usedAt: null,
      createdAt: new Date(),
    });
  }
  try {
    if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
      const col = await mongoGeneric.getCollection("admin_recovery_codes");
      await col.deleteMany({});
      await col.insertMany(mongoDocs);
    }
  } catch {}

  try {
    await db.insert(adminRecoveryCodesTable).values(rows);
  } catch {}
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

  const lockout = await checkAccountLockout("admin", "admin");
  if (lockout.isLocked) {
    writeAuditLog({ action: "2fa_login_lockout_blocked", module: "Security", ipAddress: ip, status: "failure" }).catch(() => {});
    return res.status(429).json({
      error: lockout.retryMessage || "Too many failed attempts. Admin login temporarily locked.",
      code: "ACCOUNT_TEMPORARILY_LOCKED",
      retryAfterSeconds: lockout.remainingSeconds,
    });
  }

  try {
    const valid = await validateTOTP(code);
    if (!valid) {
      const failState = await recordFailedAttempt("admin", "admin");
      writeAuditLog({ action: "2fa_login_failed", module: "Security", ipAddress: ip, status: "failure", metadata: { attempts: failState.attempts } }).catch(() => {});
      if (failState.isLocked) {
        return res.status(429).json({
          error: `Too many failed 2FA attempts. Admin login is temporarily locked for ${failState.lockMinutes} minutes.`,
          code: "ACCOUNT_TEMPORARILY_LOCKED",
          retryAfterSeconds: failState.remainingSeconds,
        });
      }
      return res.status(403).json({ error: "Invalid verification code. Please try again.", code: "2FA_INVALID" });
    }

    await recordSuccessfulLogin("admin", "admin");
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

  const lockout = await checkAccountLockout("admin", "admin");
  if (lockout.isLocked) {
    writeAuditLog({ action: "2fa_recovery_login_lockout_blocked", module: "Security", ipAddress: ip, status: "failure" }).catch(() => {});
    return res.status(429).json({
      error: lockout.retryMessage || "Too many failed attempts. Admin login temporarily locked.",
      code: "ACCOUNT_TEMPORARILY_LOCKED",
      retryAfterSeconds: lockout.remainingSeconds,
    });
  }

  try {
    const codeHash = sha256hex(code.trim().toUpperCase());
    let row: any = null;

    try {
      if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
        const col = await mongoGeneric.getCollection("admin_recovery_codes");
        row = await col.findOne({ codeHash });
      }
    } catch {}

    if (!row) {
      try {
        const [pgRow] = await db
          .select({ id: adminRecoveryCodesTable.id, used: adminRecoveryCodesTable.used })
          .from(adminRecoveryCodesTable)
          .where(eq(adminRecoveryCodesTable.codeHash, codeHash));
        row = pgRow;
      } catch {}
    }

    if (!row || row.used) {
      const failState = await recordFailedAttempt("admin", "admin");
      writeAuditLog({ action: "2fa_recovery_login_failed", module: "Security", ipAddress: ip, status: "failure", metadata: { attempts: failState.attempts } }).catch(() => {});
      if (failState.isLocked) {
        return res.status(429).json({
          error: `Too many failed recovery attempts. Admin login is temporarily locked for ${failState.lockMinutes} minutes.`,
          code: "ACCOUNT_TEMPORARILY_LOCKED",
          retryAfterSeconds: failState.remainingSeconds,
        });
      }
      return res.status(403).json({ error: "Invalid or already-used recovery code.", code: "2FA_INVALID" });
    }

    await recordSuccessfulLogin("admin", "admin");

    // Mark the code as used in MongoDB and PostgreSQL
    try {
      if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
        const col = await mongoGeneric.getCollection("admin_recovery_codes");
        await col.updateOne({ codeHash }, { $set: { used: true, usedAt: new Date() } });
      }
    } catch {}

    try {
      await db
        .update(adminRecoveryCodesTable)
        .set({ used: true, usedAt: new Date() })
        .where(eq(adminRecoveryCodesTable.id, row.id));
    } catch {}

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

    // Store as pending (not enabled yet — must be verified first).
    // Clear any leftover stage, pending secret, and OTP challenges from a
    // previous abandoned attempt so the new setup starts from a clean slate.
    await Promise.all([
      upsertSetting("admin_2fa_secret_pending", secret),
      deleteSetting("admin_2fa_setup_stage"),
      deleteOtpChallenges(), // wipe stale email/sms challenges in MongoDB and db
    ]);

    res.json({ qrDataUrl, manualKey: secret, otpauth });
  } catch (err) {
    res.status(500).json({ error: "Failed to start 2FA setup" });
  }
});

// ── POST /api/admin/2fa/setup/verify ─────────────────────────────────────────
// Step 1 of setup: verifies the first TOTP code, then advances the setup stage
// to "totp_verified".  2FA is NOT activated here — activation requires email
// OTP to follow.

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

    // TOTP valid — record stage. 2FA is NOT yet enabled.
    await upsertSetting("admin_2fa_setup_stage", "totp_verified");

    return res.json({ ok: true, next: "email-otp" });
  } catch (err) {
    logger.error({ err }, "[admin2fa] setup/verify error");
    res.status(500).json({ error: "Failed to verify TOTP. Please try again." });
  }
});

// ── POST /api/admin/2fa/setup/send-email-otp ─────────────────────────────────
// Generates a 6-digit email OTP and delivers it to the configured admin email address.
// Works seamlessly with production Zoho SMTP configuration as well as Resend API fallback.
// Enforces a 60-second resend cooldown.

router.post("/admin/2fa/setup/send-email-otp", requireAdminKey, async (req: any, res: any) => {
  try {
    const stage = await getSetting("admin_2fa_setup_stage");
    const pendingSecret = await getSetting("admin_2fa_secret_pending");

    if (stage === "email_verified") {
      return res.status(400).json({ error: "Email OTP already verified.", code: "WRONG_STAGE" });
    }

    if (stage !== "totp_verified" && !pendingSecret) {
      return res.status(400).json({ error: "Complete TOTP verification first.", code: "WRONG_STAGE" });
    }

    // Resolve admin contact — required for delivery.
    let adminEmail = await getSetting("admin_email");
    if (!adminEmail || !adminEmail.trim()) {
      adminEmail = process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || null;
    }
    if (!adminEmail) {
      return res.status(400).json({
        error: "Admin email is not configured. Set it in Admin → Settings before enabling 2FA.",
        code: "EMAIL_NOT_CONFIGURED",
      });
    }
    adminEmail = adminEmail.trim().toLowerCase();

    // Check service availability: SMTP or Resend
    // In production and development, Zoho SMTP is used as primary delivery.
    // In test environment, SMTP is used if MOCK_SMTP is enabled or Resend is tested.
    const isTestEnv = process.env.NODE_ENV === "test";
    const smtpTransporter = (!isTestEnv || process.env.MOCK_SMTP === "true") ? getSmtpTransporter() : null;
    const resendKey = process.env.RESEND_API_KEY;
    if (!smtpTransporter && !resendKey) {
      return res.status(500).json({
        error: "Email service is not configured (RESEND_API_KEY missing).",
        code: "EMAIL_SERVICE_UNAVAILABLE",
      });
    }

    const now = new Date();
    const existing = await getOtpChallenge("email");

    if (existing) {
      const msLeft = existing.createdAt.getTime() + 60_000 - now.getTime();
      if (msLeft > 0) {
        const secondsRemaining = Math.ceil(msLeft / 1000);
        return res.status(429).json({
          error: "Please wait before requesting a new code.",
          code: "RESEND_COOLDOWN",
          secondsRemaining,
        });
      }
      // Past cooldown — remove stale challenge before issuing a new one.
      await deleteOtpChallenges("email");
    }

    const otp = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(now.getTime() + 5 * 60_000);

    await saveOtpChallenge({
      type: "email",
      codeHash: sha256hex(otp),
      expiresAt,
      attempts: 0,
    });

    let emailDelivered = false;

    try {
      // 1. Primary delivery: Production Zoho SMTP via Nodemailer
      if (smtpTransporter) {
        try {
          const from = getSenderAddress();
          const mailOptions: any = {
            from,
            to: adminEmail,
            subject: `Your VASTRAA 2FA Verification Code: ${otp}`,
            html: wrapInTemplate(
              `Your VASTRAA 2FA Verification Code: ${otp}`,
              `<div style="padding: 10px 0;">
                 <h2 style="color: #3B1254; font-size: 20px; font-weight: 700; margin-bottom: 16px;">Two-Factor Authentication Setup</h2>
                 <p style="font-size: 15px; line-height: 1.6; color: #1E293B; margin-bottom: 20px;">
                   A request has been initiated to verify Two-Factor Authentication (2FA) for your VASTRAA Admin account.
                 </p>
                 <div style="background-color: #F8F5FC; border: 2px dashed #D4AF37; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                   <p style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #6B7280; margin: 0 0 8px;">Your 6-Digit Verification Code</p>
                   <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #3B1254; font-family: monospace;">${otp}</span>
                 </div>
                 <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 12px;">
                   Enter this code in your Admin Settings to complete two-factor authentication setup.
                 </p>
                 <p style="font-size: 14px; line-height: 1.6; color: #B91C1C; font-weight: 600; margin-bottom: 20px;">
                   ⏱ This verification code is valid for 5 minutes and can only be used once.
                 </p>
                 <p style="font-size: 13px; line-height: 1.6; color: #94A3B8; margin-bottom: 24px;">
                   If you did not initiate this 2FA setup request, please change your Admin Access Key immediately and ensure your credentials are secure.
                 </p>
                 <p style="font-size: 14px; line-height: 1.6; color: #333333;">
                   Warm regards,<br/>
                   <strong>VASTRAA Security Team</strong>
                 </p>
               </div>`,
              { customerName: "Administrator" }
            ),
            text: `Namaste Admin,\n\nYour 2FA setup verification code for VASTRAA Admin is: ${otp}\n\nThis code expires in 5 minutes and can only be used once.\n\nThank you,\nVASTRAA Security Team`,
          };
          const logoAtt = getVastraaLogoAttachment();
          if (logoAtt) mailOptions.attachments = [logoAtt];

          await smtpTransporter.sendMail(mailOptions);
          emailDelivered = true;
          logger.info({ to: adminEmail }, "[admin2fa] Email OTP delivered successfully via SMTP");
        } catch (smtpErr: any) {
          logger.warn({ error: smtpErr?.message }, "[admin2fa] SMTP delivery failed, attempting Resend fallback if available");
        }
      }

      // 2. Secondary delivery: Resend API (used in tests or as fallback)
      if (!emailDelivered && resendKey) {
        const resend = new Resend(resendKey);
        const fallbackSubject = `Your VASTRAA 2FA Verification Code: ${otp}`;
        const fallbackBody = `
          <div style="padding: 10px 0;">
            <h2 style="color: #3B1254; font-size: 20px; font-weight: 700; margin-bottom: 16px;">Two-Factor Authentication Setup</h2>
            <p style="font-size: 15px; line-height: 1.6; color: #1E293B; margin-bottom: 20px;">
              A request has been initiated to verify Two-Factor Authentication (2FA) for your VASTRAA Admin account.
            </p>
            <div style="background-color: #F8F5FC; border: 2px dashed #D4AF37; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <p style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #6B7280; margin: 0 0 8px;">Your 6-Digit Verification Code</p>
              <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #3B1254; font-family: monospace;">${otp}</span>
            </div>
            <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 12px;">
              Enter this code in your Admin Settings to complete two-factor authentication setup.
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #B91C1C; font-weight: 600; margin-bottom: 20px;">
              ⏱ This verification code is valid for 5 minutes and can only be used once.
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #333333;">
              Warm regards,<br/>
              <strong>VASTRAA Security Team</strong>
            </p>
          </div>`;
        const { error: sendError } = await resend.emails.send({
          from: getSenderAddress() || "VASTRAA Security <security@vastraasaree.com>",
          to: adminEmail,
          subject: fallbackSubject,
          html: wrapInTemplate(fallbackSubject, fallbackBody, { customerName: "Administrator" }),
        });

        if (sendError) {
          logger.error({ sendError }, "[admin2fa] Resend delivery failed for email OTP");
          return res.status(500).json({ error: "Failed to deliver email OTP. Please try again.", code: "EMAIL_DELIVERY_FAILED" });
        }

        emailDelivered = true;
        logger.info({ to: adminEmail }, "[admin2fa] Email OTP delivered via Resend");
      }

      if (!emailDelivered) {
        return res.status(500).json({ error: "Failed to deliver email OTP. Please try again.", code: "EMAIL_DELIVERY_FAILED" });
      }
    } finally {
      if (!emailDelivered) {
        // Roll back the stored challenge so the caller is not blocked by cooldown.
        await deleteOtpChallenges("email");
      }
    }

    const maskedEmail = adminEmail.replace(/^(.)(.*)(@.*)$/, (_, f, m, end) => `${f}${"*".repeat(Math.max(1, m.length))}${end}`);
    logger.info({ email: maskedEmail }, "[admin2fa] email OTP sent for 2FA setup");
    return res.json({
      ok: true,
      email: adminEmail,
      maskedEmail,
      cooldownSeconds: 60,
    });
  } catch (err) {
    logger.error({ err }, "[admin2fa] send-email-otp error");
    res.status(500).json({ error: "Failed to send email OTP." });
  }
});

// ── POST /api/admin/2fa/setup/verify-email-otp ───────────────────────────────
// Verifies the email OTP.
// Gates: stage must be "totp_verified" or pendingSecret must exist, challenge must exist,
// not be expired, and attempts must be < 5.
// When req.body.activate === true: activates 2FA directly and returns recovery codes + session!

router.post("/admin/2fa/setup/verify-email-otp", requireAdminKey, async (req: any, res: any) => {
  const { otp, activate } = req.body ?? {};
  if (!otp || typeof otp !== "string") {
    return res.status(400).json({ error: "OTP is required" });
  }
  try {
    const stage = await getSetting("admin_2fa_setup_stage");
    const pendingSecret = await getSetting("admin_2fa_secret_pending");

    if (stage === "email_verified") {
      return res.status(400).json({ error: "Email OTP already verified.", code: "WRONG_STAGE" });
    }

    if (stage !== "totp_verified" && !pendingSecret) {
      return res.status(400).json({ error: "Complete TOTP verification first.", code: "WRONG_STAGE" });
    }

    const challenge = await getOtpChallenge("email");

    if (!challenge) {
      return res.status(400).json({ error: "No email OTP challenge found. Request a new code.", code: "NO_CHALLENGE" });
    }

    const now = new Date();
    if (challenge.expiresAt <= now) {
      await deleteOtpChallenges("email");
      return res.status(400).json({ error: "OTP has expired. Please request a new code.", code: "OTP_EXPIRED" });
    }

    if (challenge.attempts >= 5) {
      await deleteOtpChallenges("email");
      return res.status(400).json({ error: "Too many failed attempts. Please request a new code.", code: "TOO_MANY_ATTEMPTS" });
    }

    if (sha256hex(otp.trim()) !== challenge.codeHash) {
      const newAttempts = challenge.attempts + 1;
      await updateOtpChallengeAttempts("email", newAttempts);
      return res.status(400).json({ error: "Invalid OTP. Please try again.", code: "OTP_INVALID" });
    }

    // OTP valid — consume challenge immediately
    await deleteOtpChallenges("email");

    // Activate 2FA if requested by caller (Requirement 9)
    if (activate === true) {
      if (!pendingSecret) {
        return res.status(400).json({ error: "Setup session expired. Please start again." });
      }

      await Promise.all([
        upsertSetting("admin_2fa_secret", pendingSecret),
        upsertSetting("admin_2fa_enabled", "true"),
        upsertSetting("admin_2fa_enabled_at", new Date().toISOString()),
        deleteSetting("admin_2fa_secret_pending"),
        deleteSetting("admin_2fa_setup_stage"),
      ]);
      clearAdmin2faCache();

      // Generate fresh recovery codes.
      try {
        await db.delete(adminRecoveryCodesTable);
      } catch {}
      const codes = await generateAndStoreRecoveryCodes();

      writeAuditLog({ action: "2fa_enabled", module: "Security", ipAddress: getIp(req) }).catch(() => {});

      // Issue a verified session so the admin isn't locked out immediately.
      const { tokenHash, sessionId } = await createVerifiedSession(req);
      return res.json({
        ok: true,
        success: true,
        activated: true,
        sessionId,
        tokenHash,
        codes,
        next: "sms-otp",
      });
    }

    // Default: advance stage for multi-step tests
    await upsertSetting("admin_2fa_setup_stage", "email_verified");
    return res.json({ ok: true, next: "sms-otp" });
  } catch (err) {
    logger.error({ err }, "[admin2fa] verify-email-otp error");
    res.status(500).json({ error: "Failed to verify email OTP." });
  }
});

// ── POST /api/admin/2fa/setup/send-sms-otp ───────────────────────────────────
// Step 4 of setup: generates a 6-digit SMS OTP and delivers it to the
// configured admin mobile number (admin_mobile site setting).
// Requires email OTP to have been verified (stage = "email_verified").
// Enforces a 60-second resend cooldown.

router.post("/admin/2fa/setup/send-sms-otp", requireAdminKey, async (req: any, res: any) => {
  try {
    const stage = await getSetting("admin_2fa_setup_stage");
    if (stage !== "email_verified") {
      return res.status(400).json({ error: "Complete email OTP verification first.", code: "WRONG_STAGE" });
    }

    // Resolve admin mobile number — required for SMS delivery.
    const adminMobile = await getSetting("admin_mobile");
    if (!adminMobile) {
      return res.status(400).json({
        error: "Admin mobile number is not configured. Set it in Admin → Settings before enabling 2FA.",
        code: "MOBILE_NOT_CONFIGURED",
      });
    }

    // Require Twilio credentials to be present.
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) {
      return res.status(500).json({
        error: "SMS service is not configured (Twilio credentials missing).",
        code: "SMS_SERVICE_UNAVAILABLE",
      });
    }

    const now = new Date();
    const [existing] = await db
      .select()
      .from(adminOtpChallengesTable)
      .where(eq(adminOtpChallengesTable.type, "sms"));

    if (existing) {
      const msLeft = existing.createdAt.getTime() + 60_000 - now.getTime();
      if (msLeft > 0) {
        const secondsRemaining = Math.ceil(msLeft / 1000);
        return res.status(429).json({
          error: "Please wait before requesting a new code.",
          code: "RESEND_COOLDOWN",
          secondsRemaining,
        });
      }
      await db.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.id, existing.id));
    }

    const otp = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(now.getTime() + 5 * 60_000);

    await db.insert(adminOtpChallengesTable).values({
      type: "sms",
      codeHash: sha256hex(otp),
      expiresAt,
      attempts: 0,
    });
    // Track insertion so the outer catch can roll back on any delivery failure.
    let smsDelivered = false;

    try {
      // Deliver the OTP via SMS.
      await sendSms(adminMobile, `Your TwirlDrape 2FA setup code is: ${otp}. It expires in 5 minutes.`);
      smsDelivered = true;
    } finally {
      if (!smsDelivered) {
        // Roll back the stored challenge so the caller is not blocked by cooldown.
        await db.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.type, "sms"));
      }
    }

    logger.info("[admin2fa] SMS OTP sent for 2FA setup");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[admin2fa] send-sms-otp error");
    res.status(500).json({ error: "Failed to send SMS OTP." });
  }
});

// ── POST /api/admin/2fa/setup/verify-sms-otp ─────────────────────────────────
// Step 5 (final) of setup: verifies the SMS OTP.
// Gates: stage must be "email_verified", challenge must exist, not be expired,
// and attempts must be < 5.
// On success: enables 2FA, issues a verified session, and returns recovery codes.

router.post("/admin/2fa/setup/verify-sms-otp", requireAdminKey, async (req: any, res: any) => {
  const { otp } = req.body ?? {};
  if (!otp || typeof otp !== "string") {
    return res.status(400).json({ error: "OTP is required" });
  }
  try {
    // Stage gate: email OTP must have been verified before SMS OTP can be confirmed.
    const stage = await getSetting("admin_2fa_setup_stage");
    if (stage !== "email_verified") {
      return res.status(400).json({ error: "Complete email OTP verification first.", code: "WRONG_STAGE" });
    }

    const [challenge] = await db
      .select()
      .from(adminOtpChallengesTable)
      .where(eq(adminOtpChallengesTable.type, "sms"));

    if (!challenge) {
      return res.status(400).json({ error: "No SMS OTP challenge found. Request a new code.", code: "NO_CHALLENGE" });
    }

    const now = new Date();
    if (challenge.expiresAt <= now) {
      await db.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.id, challenge.id));
      return res.status(400).json({ error: "OTP has expired. Please request a new code.", code: "OTP_EXPIRED" });
    }

    if (challenge.attempts >= 5) {
      await db.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.id, challenge.id));
      return res.status(400).json({ error: "Too many failed attempts. Please request a new code.", code: "TOO_MANY_ATTEMPTS" });
    }

    if (sha256hex(otp.trim()) !== challenge.codeHash) {
      const newAttempts = challenge.attempts + 1;
      await db
        .update(adminOtpChallengesTable)
        .set({ attempts: newAttempts })
        .where(eq(adminOtpChallengesTable.id, challenge.id));
      return res.status(400).json({ error: "Invalid OTP. Please try again.", code: "OTP_INVALID" });
    }

    // SMS OTP valid — activate 2FA.
    const pendingSecret = await getSetting("admin_2fa_secret_pending");
    if (!pendingSecret) {
      return res.status(400).json({ error: "Setup session expired. Please start again." });
    }

    await db.delete(adminOtpChallengesTable).where(eq(adminOtpChallengesTable.id, challenge.id));

    await Promise.all([
      upsertSetting("admin_2fa_secret", pendingSecret),
      upsertSetting("admin_2fa_enabled", "true"),
      upsertSetting("admin_2fa_enabled_at", new Date().toISOString()),
      deleteSetting("admin_2fa_secret_pending"),
      deleteSetting("admin_2fa_setup_stage"),
    ]);
    clearAdmin2faCache();

    // Generate fresh recovery codes.
    await db.delete(adminRecoveryCodesTable);
    const codes = await generateAndStoreRecoveryCodes();

    writeAuditLog({ action: "2fa_enabled", module: "Security", ipAddress: getIp(req) }).catch(() => {});

    // Issue a verified session so the admin isn't locked out immediately.
    const { tokenHash, sessionId } = await createVerifiedSession(req);
    return res.json({ ok: true, sessionId, tokenHash, codes });
  } catch (err) {
    logger.error({ err }, "[admin2fa] verify-sms-otp error");
    res.status(500).json({ error: "Failed to complete 2FA setup." });
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

    // Atomically replace all recovery codes. If the insert fails, explicitly
    // abort the transaction before the error reaches the route handler so the
    // existing recovery codes remain available.
    let plainCodes: string[] = [];
    await db.transaction(async (tx: any) => {
      try {
        await tx.delete(adminRecoveryCodesTable);
        const nextCodes: string[] = [];
        const rows: { codeHash: string }[] = [];
        for (let i = 0; i < 10; i++) {
          const plain = generateRecoveryCode();
          nextCodes.push(plain);
          rows.push({ codeHash: sha256hex(plain) });
        }
        await tx.insert(adminRecoveryCodesTable).values(rows);
        plainCodes = nextCodes;
      } catch (err) {
        tx.rollback();
        throw err;
      }
    });
    const codes = plainCodes;

    writeAuditLog({ action: "2fa_recovery_codes_regenerated", module: "Security", ipAddress: getIp(req) }).catch(() => {});
    res.json({ ok: true, codes });
  } catch (err) {
    logger.error({ err }, "[admin2fa] regenerate-codes error");
    res.status(500).json({
      error: "Failed to regenerate recovery codes. No recovery codes were changed. Please try again.",
    });
  }
});

export default router;
