import crypto from "crypto";
import { sendSellerVerificationEmail } from "./transactionalEmail";
import { mongoSellers, mongoUsers } from "@workspace/db";
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
}

// In-memory store keyed by normalized email address
const codeStore = new Map<string, VerificationRecord>();

const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes expiration
const MAX_VERIFICATION_ATTEMPTS = 5;
const COOLDOWN_MS = 30 * 1000; // 30 seconds resend cooldown

function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * Generates and sends a 6-digit email verification code to the seller's email address via SMTP or Resend.
 * Securely hashes the OTP and sets a 5-minute expiration time.
 */
export async function sendSellerVerificationCode(
  email: string
): Promise<{ delivered: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { delivered: false, error: "Please enter a valid email address." };
  }

  // Check if a seller account already exists with this email
  try {
    const existingSeller = await mongoSellers.findByEmail(cleanEmail);
    if (existingSeller) {
      return {
        delivered: false,
        error: "A seller account with this email address already exists. Please sign in instead.",
      };
    }

    const existingUser = await mongoUsers.findByEmail(cleanEmail);
    if (existingUser && existingUser.role === "seller") {
      return {
        delivered: false,
        error: "A seller account with this email address already exists. Please sign in instead.",
      };
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, email: cleanEmail }, "[sellerVerification] Error checking existing seller account by email");
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

    // Max 5 resends per 15 minutes limit
    if (existingRecord.resendCount >= 5 && now - existingRecord.lastResendAt < 15 * 60 * 1000) {
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

  // Store hashed verification record (invalidates any previous code for this email)
  codeStore.set(cleanEmail, {
    codeHash,
    expiresAt,
    verified: false,
    used: false,
    attempts: 0,
    lastResendAt: now,
    resendCount: newResendCount,
  });

  logger.info({ email: cleanEmail }, "[sellerVerification] Issued 6-digit seller verification code for email");

  // Attempt to send email via Resend
  const result = await sendSellerVerificationEmail({ email: cleanEmail, code });

  if (!result.delivered) {
    // Delete unverified code record if sending failed so seller can retry cleanly
    codeStore.delete(cleanEmail);
    logger.warn({ email: cleanEmail, error: result.error }, "[sellerVerification] Email delivery failed; cleared code record");
    return { delivered: false, error: result.error || "Unable to send the verification code. Please try again." };
  }

  return { delivered: true };
}

/**
 * Verifies the 6-digit verification code entered by the seller.
 */
export function verifySellerEmailCode(
  email: string,
  code: string
): { valid: boolean; error?: string } {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    return { valid: false, error: "Invalid verification code. Please check the code and try again." };
  }

  const record = codeStore.get(cleanEmail);

  if (!record) {
    return { valid: false, error: "Invalid verification code. Please check the code and try again." };
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
    return { valid: false, error: "Maximum verification attempts exceeded. Please request a new code." };
  }

  const inputHash = sha256hex(cleanCode);

  if (record.codeHash !== inputHash) {
    record.attempts += 1;
    if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      codeStore.delete(cleanEmail);
      return { valid: false, error: "Maximum verification attempts exceeded. Please request a new code." };
    }
    return { valid: false, error: "Invalid verification code. Please check the code and try again." };
  }

  // Mark as verified and invalidate OTP usage
  record.verified = true;
  record.verifiedAt = Date.now();
  record.used = true;
  codeStore.set(cleanEmail, record);

  logger.info({ email: cleanEmail }, "[sellerVerification] Email address successfully verified");

  return { valid: true };
}

/**
 * Checks if the email address has been verified.
 */
export function isSellerEmailVerified(email: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  const record = codeStore.get(cleanEmail);
  if (!record || !record.verified) return false;
  // Consider verified if within 2 hours
  if (Date.now() - (record.verifiedAt || 0) > 2 * 60 * 60 * 1000) return false;
  return true;
}

/**
 * Consumes the verified status after seller account registration completes.
 */
export function consumeSellerEmailVerification(email: string): void {
  const cleanEmail = email.trim().toLowerCase();
  codeStore.delete(cleanEmail);
}
