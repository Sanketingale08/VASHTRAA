import crypto from "crypto";
import { sendRegistrationOtpEmail } from "./transactionalEmail";
import { mongoUsers } from "@workspace/db";
import { logger } from "./logger";

interface VerificationRecord {
  codeHash: string;
  expiresAt: number;
  verified: boolean;
  verifiedAt?: number;
  used: boolean;
  attempts: number;
  lastResendAt: number;
  resendCount: number;
  name?: string;
}

// In-memory store keyed by normalized email address
const codeStore = new Map<string, VerificationRecord>();

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes expiration
const MAX_VERIFICATION_ATTEMPTS = 5;
const COOLDOWN_MS = 30 * 1000; // 30 seconds resend cooldown
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour window

function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * Generates and sends a 6-digit email verification code to the customer's email address during registration.
 * Securely hashes the OTP and sets a 10-minute expiration time.
 */
export async function sendCustomerRegistrationCode(
  email: string,
  name?: string
): Promise<{ delivered: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { delivered: false, error: "Please enter a valid email address." };
  }

  // Check if a customer account already exists with this email in MongoDB Atlas
  try {
    const existingUser = await mongoUsers.findByEmail(cleanEmail, "customer");
    if (existingUser) {
      return {
        delivered: false,
        error: "A customer account with this email address already exists. Please sign in instead.",
      };
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, email: cleanEmail }, "[customerVerification] Error checking existing user account by email");
  }

  const existingRecord = codeStore.get(cleanEmail);
  const now = Date.now();

  // Resend rate limiting: prevent spamming resend within 30 seconds
  if (existingRecord) {
    const timeSinceLastResend = now - (existingRecord.lastResendAt || 0);
    if (timeSinceLastResend < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - timeSinceLastResend) / 1000);
      return {
        delivered: false,
        error: `Please wait ${waitSec} second${waitSec !== 1 ? "s" : ""} before requesting another code.`,
      };
    }

    // Max 5 resends per hour limit
    if (existingRecord.resendCount >= 5 && now - existingRecord.lastResendAt < RATE_WINDOW_MS) {
      return {
        delivered: false,
        error: "Too many verification requests. Please wait a few minutes before trying again.",
      };
    }
  }

  // Generate secure 6-digit numeric OTP code (supporting leading zeros e.g. "004821")
  const codeInt = crypto.randomInt(0, 1000000);
  const code = codeInt.toString().padStart(6, "0");
  const codeHash = sha256hex(code);
  const expiresAt = now + CODE_EXPIRY_MS;
  const newResendCount = existingRecord ? existingRecord.resendCount + 1 : 1;

  // Store hashed verification record (invalidates any previous unverified code for this email)
  codeStore.set(cleanEmail, {
    codeHash,
    expiresAt,
    verified: false,
    used: false,
    attempts: 0,
    lastResendAt: now,
    resendCount: newResendCount,
    name: name?.trim() || existingRecord?.name,
  });

  logger.info({ email: cleanEmail }, "[customerVerification] Issued 6-digit customer registration verification code for email");

  // Attempt to send email via SMTP (Nodemailer) or fallback
  const result = await sendRegistrationOtpEmail({ email: cleanEmail, code, name });

  if (!result.delivered) {
    // Delete unverified code record if sending failed so customer can retry cleanly
    codeStore.delete(cleanEmail);
    logger.warn({ email: cleanEmail, error: result.error }, "[customerVerification] Email delivery failed; cleared code record");
    return { delivered: false, error: result.error || "Unable to send the verification code. Please try again." };
  }

  return { delivered: true };
}

/**
 * Verifies the 6-digit verification code entered by the customer.
 */
export function verifyCustomerRegistrationCode(
  email: string,
  code: string
): { valid: boolean; error?: string; remainingAttempts?: number } {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    return { valid: false, error: "Invalid verification code. Please enter a 6-digit number." };
  }

  const record = codeStore.get(cleanEmail);

  if (!record) {
    return { valid: false, error: "Verification code expired or not found. Please request a new verification code." };
  }

  if (record.used) {
    return { valid: false, error: "This verification code has already been used. Please request a new code." };
  }

  if (Date.now() > record.expiresAt) {
    codeStore.delete(cleanEmail);
    return { valid: false, error: "Your verification code has expired. Please request a new code." };
  }

  if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    codeStore.delete(cleanEmail);
    return { valid: false, error: "Maximum verification attempts exceeded. Please request a new code.", remainingAttempts: 0 };
  }

  const inputHash = sha256hex(cleanCode);

  if (record.codeHash !== inputHash) {
    record.attempts += 1;
    const remaining = MAX_VERIFICATION_ATTEMPTS - record.attempts;
    if (remaining <= 0) {
      codeStore.delete(cleanEmail);
      return { valid: false, error: "Too many incorrect attempts. Verification code invalidated. Please request a new code.", remainingAttempts: 0 };
    }
    return { valid: false, error: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`, remainingAttempts: remaining };
  }

  // Mark record as verified
  record.verified = true;
  record.verifiedAt = Date.now();
  return { valid: true };
}

/**
 * Checks whether an email address has been verified for registration.
 */
export function isCustomerEmailVerified(email: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  const record = codeStore.get(cleanEmail);
  if (!record) return false;
  if (!record.verified) return false;
  if (record.used) return false;
  if (Date.now() > record.expiresAt) {
    codeStore.delete(cleanEmail);
    return false;
  }
  return true;
}

/**
 * Marks the verification code as consumed upon successful account creation.
 */
export function consumeCustomerRegistrationCode(email: string): void {
  const cleanEmail = email.trim().toLowerCase();
  const record = codeStore.get(cleanEmail);
  if (record) {
    record.used = true;
    // Remove after short delay
    setTimeout(() => {
      codeStore.delete(cleanEmail);
    }, 60_000).unref?.();
  }
}
