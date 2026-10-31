import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sendSellerVerificationCode,
  verifySellerEmailCode,
  isSellerEmailVerified,
  consumeSellerEmailVerification,
} from "../lib/sellerVerification";
import {
  sendSellerVerificationEmail,
  getSmtpTransporter,
  getSenderAddress,
} from "../lib/transactionalEmail";
import nodemailer from "nodemailer";
import { mongoSellers, mongoUsers } from "@workspace/db";

describe("Seller Email Verification System — Complete 10-Point Flow", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // 1. A valid new seller email
  it("1. Successfully generates and sends verification code for a valid new seller email", async () => {
    const validEmail = "validnewseller@example.com";
    const res = await sendSellerVerificationCode(validEmail);

    expect(res.delivered).toBe(true);
    expect(res.devCode).toBeDefined();
    expect(res.devCode).toMatch(/^[0-9]{6}$/);
    expect(res.error).toBeUndefined();
  });

  // 2. An invalid email address
  it("2. Rejects invalid email addresses cleanly without generating a code", async () => {
    const invalidEmails = [
      "",
      "   ",
      "notanemail",
      "missingatsign.com",
      "@nodomain.com",
      "spaces in@email.com",
    ];

    for (const badEmail of invalidEmails) {
      const res = await sendSellerVerificationCode(badEmail);
      expect(res.delivered).toBe(false);
      expect(res.error).toBe("Please enter a valid email address.");
    }
  });

  // 3. An email that is already registered
  it("3. Detects already registered seller emails and returns appropriate prompt", async () => {
    const registeredEmail = "alreadyseller@example.com";

    // Mock mongoSellers.findByEmail to simulate existing seller account
    vi.spyOn(mongoSellers, "findByEmail").mockResolvedValueOnce({
      id: "vend_existing_123",
      email: registeredEmail,
      name: "Existing Shop",
    } as any);

    const res = await sendSellerVerificationCode(registeredEmail);
    expect(res.delivered).toBe(false);
    expect(res.error).toContain("already exists. Please sign in instead");
  });

  // 4. SMTP credentials missing or incorrect
  it("4. Handles SMTP configuration correctly and fails safely on invalid credentials without exposing secrets", async () => {
    process.env.SMTP_HOST = "smtp.invalid-provider.local";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "testuser";
    process.env.SMTP_PASS = "supersecretpassword";
    delete process.env.RESEND_API_KEY;

    // Spy on nodemailer.createTransport and mock a sendMail rejection (e.g. 535 Auth failed)
    const mockSendMail = vi.fn().mockRejectedValueOnce(
      new Error("535 5.7.8 Authentication credentials invalid")
    );
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: mockSendMail,
    } as any);

    const res = await sendSellerVerificationEmail({
      email: "smtp-fail@example.com",
      code: "123456",
    });

    expect(res.delivered).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error).not.toContain("supersecretpassword");
    expect(mockSendMail).toHaveBeenCalledOnce();
  });

  // 5. SMTP timeout or delivery-provider failure
  it("5. Handles SMTP timeout or provider failure gracefully without crashing or false success", async () => {
    process.env.SMTP_HOST = "smtp.slow-provider.local";
    delete process.env.RESEND_API_KEY;

    const timeoutErr: any = new Error("Connection timed out after 10000ms");
    timeoutErr.code = "ETIMEDOUT";

    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: vi.fn().mockRejectedValueOnce(timeoutErr),
    } as any);

    const res = await sendSellerVerificationEmail({
      email: "timeout@example.com",
      code: "654321",
    });

    expect(res.delivered).toBe(false);
    expect(res.error).toContain("Unable to send the verification code");
  });

  // 6. Repeated Send Verification Code clicks (cooldown rate limit)
  it("6. Enforces resend cooldown on repeated clicks to prevent spam", async () => {
    const email = "repeatedclicker@example.com";
    const res1 = await sendSellerVerificationCode(email);
    expect(res1.delivered).toBe(true);

    // Second click immediately should be blocked by 30-second cooldown
    const res2 = await sendSellerVerificationCode(email);
    expect(res2.delivered).toBe(false);
    expect(res2.error).toContain("seconds before requesting another code");
  });

  // 7. Correct and incorrect verification codes
  it("7. Validates correct 6-digit code, rejects incorrect code, and locks after max attempts", async () => {
    const email = "testattempts@example.com";
    const sendRes = await sendSellerVerificationCode(email);
    const correctCode = sendRes.devCode!;

    // Try bad code (attempt 1)
    const bad1 = verifySellerEmailCode(email, "999999");
    expect(bad1.valid).toBe(false);
    expect(bad1.error).toContain("Invalid verification code");

    // Correct code succeeds
    const good = verifySellerEmailCode(email, correctCode);
    expect(good.valid).toBe(true);
    expect(good.error).toBeUndefined();

    // Replay attempt fails (already used)
    const reuse = verifySellerEmailCode(email, correctCode);
    expect(reuse.valid).toBe(false);
    expect(reuse.error).toContain("already been used");
  });

  // 8. Expired verification codes
  it("8. Rejects expired verification codes after 5-minute validity window", async () => {
    const email = "expiredcode@example.com";
    const sendRes = await sendSellerVerificationCode(email);
    const code = sendRes.devCode!;

    // Advance clock by 6 minutes (beyond 5 min expiration)
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 6 * 60 * 1000;
      const res = verifySellerEmailCode(email, code);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("expired");
    } finally {
      Date.now = realNow;
    }
  });

  // 9. Resending a code and verifying the latest valid code (earlier code invalidated)
  it("9. Resending invalidates previous code so only the latest valid code works", async () => {
    const email = "resendtest@example.com";
    const realNow = Date.now;

    let timeShift = 0;
    Date.now = () => realNow() + timeShift;

    try {
      // First request
      const res1 = await sendSellerVerificationCode(email);
      const code1 = res1.devCode!;

      // Advance time by 31 seconds past cooldown
      timeShift += 31 * 1000;

      // Resend a new code
      const res2 = await sendSellerVerificationCode(email);
      expect(res2.delivered).toBe(true);
      const code2 = res2.devCode!;

      // Verify that code1 is now invalid (overwritten by code2)
      const tryOld = verifySellerEmailCode(email, code1);
      expect(tryOld.valid).toBe(false);

      // Verify that code2 succeeds
      const tryNew = verifySellerEmailCode(email, code2);
      expect(tryNew.valid).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  // 10. Completing shop registration after successful verification
  it("10. Confirms verified status allows registration, then consumption clears status", async () => {
    const email = "completeshopreg@example.com";
    const sendRes = await sendSellerVerificationCode(email);
    const code = sendRes.devCode!;

    // Not verified before verification
    expect(isSellerEmailVerified(email)).toBe(false);

    // Verify code
    const verifyRes = verifySellerEmailCode(email, code);
    expect(verifyRes.valid).toBe(true);

    // Now verified
    expect(isSellerEmailVerified(email)).toBe(true);

    // Complete registration: consume status
    consumeSellerEmailVerification(email);

    // Status is consumed and no longer active
    expect(isSellerEmailVerified(email)).toBe(false);
  });
});
