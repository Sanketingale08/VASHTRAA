import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { Resend } from "resend";
import crypto from "crypto";

const router = Router();


// ─── In-memory phone OTP store ──────────────────────────────────────────────
// userId → { otp, phone, expiresAt, requests: Date[], attempts: number }
interface OtpEntry {
  otp: string;
  phone: string;
  expiresAt: Date;
  requests: Date[];
  attempts: number;     // verify attempts for brute-force protection
}
const phoneOtpStore = new Map<string, OtpEntry>();

const OTP_TTL_MS      = 10 * 60 * 1000;  // 10 minutes
const RATE_LIMIT      = 5;               // max OTP *send* requests per hour
const RATE_WINDOW     = 60 * 60 * 1000;  // 1 hour
const MAX_VERIFY_TRIES = 5;              // max verify attempts before OTP is invalidated

function generateOtp(): string {
  return String(crypto.randomInt(100_000, 999_999));
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const u = await clerkClient.users.getUser(userId);
    return u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? null;
  } catch { return null; }
}

async function sendOtpEmail(toEmail: string, otp: string, phone: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      // Production must have a mailer configured — fail loudly so engineers notice
      throw new Error("RESEND_API_KEY is not set; cannot send OTP in production");
    }
    // Development fallback: log the OTP so the flow works without Resend configured
    console.info(`[phone-otp] DEV: OTP for +91${phone} → ${otp} (email: ${toEmail})`);
    return;
  }
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "noreply@twirldrape.com",
    to: toEmail,
    subject: "Your TwirlDrape mobile number verification code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1E6B5A;font-size:20px;margin:0 0 8px">Mobile Number Change</h2>
        <p style="color:#555;font-size:14px;margin:0 0 24px">
          You requested to change your registered mobile number to <strong>+91 ${phone}</strong>.
          Use the code below to confirm this change.
        </p>
        <div style="background:#F3F8F5;border:1px solid #C9A84C33;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <p style="font-size:32px;font-weight:700;letter-spacing:0.3em;color:#1E6B5A;margin:0">${otp}</p>
          <p style="color:#888;font-size:12px;margin:8px 0 0">Valid for 10 minutes</p>
        </div>
        <p style="color:#888;font-size:12px">If you did not request this change, please ignore this email. Your mobile number will not be updated.</p>
      </div>
    `,
  });
}

// ─── Phone OTP: request ──────────────────────────────────────────────────────
router.post("/account/phone-otp/request", requireAuth, async (req: any, res: any): Promise<void> => {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    res.status(400).json({ error: "A valid 10-digit phone number is required." });
    return;
  }
  const userId: string = req.userId;
  const now = new Date();

  // Rate limiting
  const entry = phoneOtpStore.get(userId);
  const recentRequests = (entry?.requests ?? []).filter(
    (d) => now.getTime() - d.getTime() < RATE_WINDOW
  );
  if (recentRequests.length >= RATE_LIMIT) {
    res.status(429).json({ error: "Too many OTP requests. Please try again later." });
    return;
  }

  const toEmail = await getUserEmail(userId);
  if (!toEmail) {
    res.status(400).json({ error: "Could not resolve your email address." });
    return;
  }

  const otp = generateOtp();
  phoneOtpStore.set(userId, {
    otp,
    phone,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    requests: [...recentRequests, now],
    attempts: 0,
  });

  try {
    await sendOtpEmail(toEmail, otp, phone);
  } catch (err) {
    // sendOtpEmail only throws in production (missing key or Resend error).
    // In dev it logs the OTP to console and returns normally, so this branch
    // is never reached in development.
    req.log?.error({ err }, "[phone-otp] Failed to send OTP email — invalidating entry");
    phoneOtpStore.delete(userId);
    res.status(500).json({ error: "Failed to send verification email. Please try again." });
    return;
  }

  res.json({ success: true, sentTo: toEmail.replace(/^(.{2})(.*)(@.+)$/, "$1***$3") });
});

// ─── Phone OTP: verify ───────────────────────────────────────────────────────
router.post("/account/phone-otp/verify", requireAuth, async (req: any, res: any): Promise<void> => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    res.status(400).json({ error: "Phone and code are required." });
    return;
  }
  const userId: string = req.userId;
  const entry = phoneOtpStore.get(userId);

  if (!entry) {
    res.status(400).json({ error: "No pending verification. Please request a new code." });
    return;
  }
  if (new Date() > entry.expiresAt) {
    phoneOtpStore.delete(userId);
    res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    return;
  }
  if (entry.phone !== phone) {
    res.status(400).json({ error: "Phone number does not match the pending verification." });
    return;
  }

  // Brute-force protection: max attempts before OTP is invalidated
  if (entry.attempts >= MAX_VERIFY_TRIES) {
    phoneOtpStore.delete(userId);
    res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
    return;
  }

  if (entry.otp !== String(code).trim()) {
    entry.attempts += 1;
    const remaining = MAX_VERIFY_TRIES - entry.attempts;
    if (remaining <= 0) {
      phoneOtpStore.delete(userId);
      res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
    } else {
      res.status(400).json({
        error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
      });
    }
    return;
  }

  // OTP valid — update publicMetadata.phone
  phoneOtpStore.delete(userId);
  try {
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: { phone },
    });
    res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "[phone-otp] Failed to update phone metadata");
    res.status(500).json({ error: "Failed to update phone number. Please try again." });
  }
});

// ─── Profile PATCH ───────────────────────────────────────────────────────────
router.patch("/account/profile", requireAuth, async (req: any, res: any): Promise<void> => {
  // `phone` is intentionally excluded here — phone changes require OTP verification
  // via POST /api/account/phone-otp/request + /api/account/phone-otp/verify.
  const { alternateMobile, dateOfBirth, gender, language } = req.body;
  try {
    await clerkClient.users.updateUserMetadata(req.userId, {
      publicMetadata: {
        alternateMobile: alternateMobile ?? "",
        dateOfBirth: dateOfBirth ?? "",
        gender: gender ?? "",
        language: language ?? "English",
      },
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update profile metadata");
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
