import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requestPasswordReset, validateResetToken, performPasswordReset } from "../lib/passwordReset";
import { mongoUsers, mongoSellers } from "@workspace/db";
import * as transactionalEmail from "../lib/transactionalEmail";

describe("Password Reset Email Integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    vi.spyOn(transactionalEmail, "sendPasswordResetEmail").mockResolvedValue({ delivered: true });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("1. Generates reset link and sends email for a registered customer", async () => {
    const customerEmail = "customer.reset@vastraasaree.com";

    vi.spyOn(mongoUsers, "findByEmail").mockResolvedValueOnce({
      id: "cust_123",
      email: customerEmail,
      name: "Radha Sharma",
      role: "customer",
    } as any);

    const result = await requestPasswordReset(customerEmail, "customer", "https://vastraasaree.com");

    expect(result.success).toBe(true);
    expect(result.message).toContain("password reset link has been sent");
    expect(result.debugResetUrl).toBeDefined();
    expect(result.debugResetUrl).toContain("https://vastraasaree.com/reset-password?token=");
  });

  it("2. Generates seller reset link with /seller/reset-password for a registered seller", async () => {
    const sellerEmail = "weaver.reset@vastraasaree.com";

    vi.spyOn(mongoSellers, "findByEmail").mockResolvedValueOnce({
      id: "seller_456",
      email: sellerEmail,
      name: "Kashi Weaves",
    } as any);

    const result = await requestPasswordReset(sellerEmail, "seller", "https://vastraasaree.com");

    expect(result.success).toBe(true);
    expect(result.debugResetUrl).toBeDefined();
    expect(result.debugResetUrl).toContain("https://vastraasaree.com/seller/reset-password?token=");
  });

  it("3. Handles non-existent email safely without throwing or exposing account status", async () => {
    const unknownEmail = "unknown.user@example.com";

    vi.spyOn(mongoUsers, "findByEmail").mockResolvedValueOnce(null);

    const result = await requestPasswordReset(unknownEmail, "customer", "https://vastraasaree.com");

    expect(result.success).toBe(true);
    expect(result.message).toContain("If an account with that email address exists");
    expect(result.debugResetUrl).toBeUndefined();
  });

  it("4. Validates active reset token and executes password update", async () => {
    const email = "update.test@vastraasaree.com";

    vi.spyOn(mongoUsers, "findByEmail").mockResolvedValueOnce({
      id: "cust_789",
      email,
      name: "Pooja Varma",
      role: "customer",
    } as any);

    const reqResult = await requestPasswordReset(email, "customer", "https://vastraasaree.com");
    expect(reqResult.success).toBe(true);
    const token = new URL(reqResult.debugResetUrl!).searchParams.get("token")!;
    expect(token).toBeTruthy();

    // Verify token validity
    const valResult = await validateResetToken(token, "customer");
    expect(valResult.valid).toBe(true);
    expect(valResult.email).toBe(email);

    // Mock user lookup and update on mongoUsers
    vi.spyOn(mongoUsers, "findById").mockResolvedValueOnce({
      id: "cust_789",
      email,
      name: "Pooja Varma",
      role: "customer",
    } as any);
    vi.spyOn(mongoUsers, "update").mockResolvedValueOnce({} as any);

    // Perform reset
    const resetResult = await performPasswordReset({
      token,
      newPassword: "NewSecurePassword123!",
      targetRole: "customer",
    });

    expect(resetResult.success).toBe(true);

    // Verify token is now invalid (single-use)
    const secondValidation = await validateResetToken(token, "customer");
    expect(secondValidation.valid).toBe(false);
  });
});
