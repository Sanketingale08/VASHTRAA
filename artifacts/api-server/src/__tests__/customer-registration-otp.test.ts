import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sendCustomerRegistrationCode,
  verifyCustomerRegistrationCode,
  isCustomerEmailVerified,
  consumeCustomerRegistrationCode,
} from "../lib/customerVerification";
import * as transactionalEmail from "../lib/transactionalEmail";
import { mongoUsers } from "@workspace/db";

describe("Customer Registration Email Verification (OTP) Service", () => {
  const originalEnv = { ...process.env };
  let lastDispatchedOtp = "";

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    lastDispatchedOtp = "";

    vi.spyOn(transactionalEmail, "sendRegistrationOtpEmail").mockImplementation(async (opts) => {
      lastDispatchedOtp = opts.code;
      return { delivered: true };
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("1. Generates and dispatches a 6-digit verification code for a new customer email", async () => {
    const email = "newbuyer.test@example.com";
    const res = await sendCustomerRegistrationCode(email, "New Buyer");

    expect(res.delivered).toBe(true);
    // In production, devCode must NEVER be leaked in the return value
    expect((res as any).devCode).toBeUndefined();
    expect(lastDispatchedOtp).toMatch(/^[0-9]{6}$/);
    expect(res.error).toBeUndefined();
  });

  it("2. Rejects invalid email addresses cleanly without generating a code", async () => {
    const badEmails = [
      "",
      "   ",
      "notanemail",
      "noatsign.com",
      "@nodomain.com",
      "spaces in@domain.com",
    ];

    for (const bad of badEmails) {
      const res = await sendCustomerRegistrationCode(bad);
      expect(res.delivered).toBe(false);
      expect(res.error).toBe("Please enter a valid email address.");
      expect((res as any).devCode).toBeUndefined();
    }
  });

  it("3. Prevents duplicate registrations when email already exists as a customer", async () => {
    const existingEmail = "existinguser@vastraasaree.com";

    vi.spyOn(mongoUsers, "findByEmail").mockResolvedValueOnce({
      id: "user-123",
      email: existingEmail,
      role: "customer",
    } as any);

    const res = await sendCustomerRegistrationCode(existingEmail);
    expect(res.delivered).toBe(false);
    expect(res.error).toContain("account with this email address already exists");
  });

  it("4. Enforces 30-second cooldown between resend requests", async () => {
    const email = "cooldown.test@example.com";
    const first = await sendCustomerRegistrationCode(email);
    expect(first.delivered).toBe(true);

    // Immediate second attempt within 30 seconds
    const second = await sendCustomerRegistrationCode(email);
    expect(second.delivered).toBe(false);
    expect(second.error).toContain("Please wait");
    expect(second.error).toContain("before requesting another code");
  });

  it("5. Successfully verifies a correct OTP code and sets verification state", async () => {
    const email = "verify.success@example.com";
    const sendRes = await sendCustomerRegistrationCode(email);
    expect(sendRes.delivered).toBe(true);
    const code = lastDispatchedOtp;

    const verifyRes = verifyCustomerRegistrationCode(email, code);
    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.error).toBeUndefined();

    // Verify email is recorded as verified
    expect(isCustomerEmailVerified(email)).toBe(true);

    // Consume verification
    consumeCustomerRegistrationCode(email);
    expect(isCustomerEmailVerified(email)).toBe(false);
  });

  it("6. Rejects incorrect OTP and decrements remaining verification attempts", async () => {
    const email = "wrongcode.test@example.com";
    const sendRes = await sendCustomerRegistrationCode(email);
    expect(sendRes.delivered).toBe(true);

    const verifyRes = verifyCustomerRegistrationCode(email, "000000");
    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.error).toContain("Invalid verification code");
    expect(verifyRes.remainingAttempts).toBe(4);
  });

  it("7. Invalidates code and locks out verification after 5 failed attempts", async () => {
    const email = "bruteforce.test@example.com";
    const sendRes = await sendCustomerRegistrationCode(email);
    expect(sendRes.delivered).toBe(true);
    const originalCode = lastDispatchedOtp;

    // 5 incorrect attempts
    for (let i = 0; i < 4; i++) {
      const res = verifyCustomerRegistrationCode(email, `11111${i}`);
      expect(res.valid).toBe(false);
      expect(res.remainingAttempts).toBe(4 - i);
    }

    // 5th attempt invalidates the code completely
    const fifthRes = verifyCustomerRegistrationCode(email, "999999");
    expect(fifthRes.valid).toBe(false);
    expect(fifthRes.error).toContain("Too many incorrect attempts");
    expect(fifthRes.remainingAttempts).toBe(0);

    // Subsequent attempt confirms code is expired/invalid
    const sixthRes = verifyCustomerRegistrationCode(email, originalCode);
    expect(sixthRes.valid).toBe(false);
    expect(sixthRes.error).toContain("expired or not found");
  });

  it("8. Rejects expired OTP codes (>10 minutes)", async () => {
    const email = "expired.test@example.com";
    const sendRes = await sendCustomerRegistrationCode(email);
    expect(sendRes.delivered).toBe(true);
    const code = lastDispatchedOtp;

    // Fast-forward time by 11 minutes
    const futureTime = Date.now() + 11 * 60 * 1000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(futureTime);

    const verifyRes = verifyCustomerRegistrationCode(email, code);
    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.error).toContain("expired");

    dateSpy.mockRestore();
  });

  it("9. Limits maximum code requests to 5 per hour per email", async () => {
    const email = "ratelimit.test@example.com";
    let now = Date.now();

    // 5 valid requests spaced 35 seconds apart
    for (let i = 0; i < 5; i++) {
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(now);
      const res = await sendCustomerRegistrationCode(email);
      expect(res.delivered).toBe(true);
      now += 35 * 1000;
      dateSpy.mockRestore();
    }

    // 6th request within the same hour
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const sixth = await sendCustomerRegistrationCode(email);
    expect(sixth.delivered).toBe(false);
    expect(sixth.error).toContain("Too many verification requests");
    dateSpy.mockRestore();
  });
});
