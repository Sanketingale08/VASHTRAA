import { describe, it, expect, beforeEach, vi } from "vitest";
import { sendSellerVerificationCode, verifySellerEmailCode, isSellerEmailVerified, consumeSellerEmailVerification } from "../lib/sellerVerification";

describe("Seller Email Verification System", () => {
  const testEmail = "newseller@example.com";

  it("successfully generates and sends a verification code", async () => {
    const res = await sendSellerVerificationCode(testEmail);
    expect(res.delivered).toBe(true);
    expect(res.devCode).toBeDefined();
    expect(res.devCode).toMatch(/^[0-9]{6}$/);
  });

  it("enforces a 30-second resend cooldown rate limit", async () => {
    const email = "cooldownseller@example.com";
    const res1 = await sendSellerVerificationCode(email);
    expect(res1.delivered).toBe(true);

    const res2 = await sendSellerVerificationCode(email);
    expect(res2.delivered).toBe(false);
    expect(res2.error).toContain("Resend limit reached");
  });

  it("validates a correct 6-digit code and invalidates it after verification", async () => {
    const email = "validateseller@example.com";
    const sendRes = await sendSellerVerificationCode(email);
    expect(sendRes.devCode).toBeDefined();
    const code = sendRes.devCode!;

    // Test invalid code first
    const badVerify = verifySellerEmailCode(email, "000000");
    expect(badVerify.valid).toBe(false);

    // Test correct code
    const goodVerify = verifySellerEmailCode(email, code);
    expect(goodVerify.valid).toBe(true);

    // Test reuse (should fail as code is already used)
    const reuseVerify = verifySellerEmailCode(email, code);
    expect(reuseVerify.valid).toBe(false);
    expect(reuseVerify.error).toContain("already been used");
  });

  it("allows checking verified status and consuming verification", async () => {
    const email = "consumeseller@example.com";
    const sendRes = await sendSellerVerificationCode(email);
    const code = sendRes.devCode!;

    expect(isSellerEmailVerified(email)).toBe(false);

    verifySellerEmailCode(email, code);
    expect(isSellerEmailVerified(email)).toBe(true);

    consumeSellerEmailVerification(email);
    expect(isSellerEmailVerified(email)).toBe(false);
  });
});
