import { describe, it, expect, beforeEach, vi } from "vitest";
import { mongoUsers, mongoVendors, mongoSellers } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/passwords";
import {
  requestPasswordReset,
  validateResetToken,
  performPasswordReset,
} from "../lib/passwordReset";
import * as transactionalEmail from "../lib/transactionalEmail";

describe("Password Reset & Forgot Password Complete Test Suite", () => {
  const customerEmail = "customer.test@example.com";
  const sellerEmail = "seller.test@example.com";
  const initialPassword = "OldPassword123";
  const newPassword = "NewSecurePassword456";

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(transactionalEmail, "sendPasswordResetEmail").mockResolvedValue({ delivered: true });
    // Setup clean test accounts in database
    const initialHash = hashPassword(initialPassword);

    // Create or reset Customer account
    const existingCust = await mongoUsers.findByEmail(customerEmail);
    if (existingCust) {
      await mongoUsers.update(existingCust.id, {
        passwordHash: initialHash,
        role: "customer",
      });
    } else {
      await mongoUsers.insert({
        name: "Test Customer",
        email: customerEmail,
        passwordHash: initialHash,
        role: "customer",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Create or reset Seller account in dedicated Seller collection
    const existingSeller = await mongoSellers.findByEmail(sellerEmail);
    if (existingSeller) {
      await mongoSellers.update(existingSeller.id, {
        passwordHash: initialHash,
        status: "approved",
      });
    } else {
      const sellerUser = await mongoUsers.insert({
        name: "Test Seller",
        email: sellerEmail,
        passwordHash: initialHash,
        role: "seller",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await mongoSellers.insert({
        name: "Test Seller Shop",
        email: sellerEmail,
        contactEmail: sellerEmail,
        passwordHash: initialHash,
        ownerId: sellerUser.id,
        status: "approved",
      });
    }
  });

  it("1. User Forgot Password — generates valid reset token and email URL", async () => {
    const res = await requestPasswordReset(customerEmail, "customer", "http://localhost:5000");
    expect(res.success).toBe(true);
    expect(res.debugResetUrl).toBeDefined();
    expect(res.debugResetUrl).toContain("/reset-password?token=");
  });

  it("2. Seller Forgot Password — generates valid seller reset token and seller URL", async () => {
    const res = await requestPasswordReset(sellerEmail, "seller", "http://localhost:5000");
    expect(res.success).toBe(true);
    expect(res.debugResetUrl).toBeDefined();
    expect(res.debugResetUrl).toContain("/seller/reset-password?token=");
  });

  it("3. Generic response prevents email enumeration for unregistered emails", async () => {
    const res = await requestPasswordReset("nonexistent.user@example.com", "customer");
    expect(res.success).toBe(true);
    expect(res.message).toContain("If an account with that email address exists");
    expect(res.debugResetUrl).toBeUndefined();
  });

  it("4. Validates reset token before password change", async () => {
    const res = await requestPasswordReset(customerEmail, "customer");
    const token = new URL(res.debugResetUrl!).searchParams.get("token")!;

    const validation = await validateResetToken(token, "customer");
    expect(validation.valid).toBe(true);
    expect(validation.email).toBe(customerEmail);
    expect(validation.targetRole).toBe("customer");
  });

  it("5. Rejects password reset if passwords do not match or are too short", async () => {
    const res = await requestPasswordReset(customerEmail, "customer");
    const token = new URL(res.debugResetUrl!).searchParams.get("token")!;

    // Short password check
    const shortRes = await performPasswordReset(token, "123", "123", "customer");
    expect(shortRes.success).toBe(false);
    expect(shortRes.error).toContain("at least 6 characters");

    // Mismatched passwords check
    const mismatchRes = await performPasswordReset(token, "Password123", "DifferentPass123", "customer");
    expect(mismatchRes.success).toBe(false);
    expect(mismatchRes.error).toContain("Passwords do not match");
  });

  it("6. Successfully updates Customer password and invalidates token", async () => {
    const reqRes = await requestPasswordReset(customerEmail, "customer");
    const token = new URL(reqRes.debugResetUrl!).searchParams.get("token")!;

    const resetRes = await performPasswordReset(token, newPassword, newPassword, "customer");
    expect(resetRes.success).toBe(true);
    expect(resetRes.message).toContain("Your password has been updated successfully");

    // Verify token is now invalid (single-use enforcement)
    const revalidation = await validateResetToken(token, "customer");
    expect(revalidation.valid).toBe(false);
    expect(revalidation.error).toContain("already been used");

    // Verify database password update
    const user = await mongoUsers.findByEmail(customerEmail);
    expect(user).toBeDefined();
    expect(verifyPassword(newPassword, user!.passwordHash)).toBe(true);
    expect(verifyPassword(initialPassword, user!.passwordHash)).toBe(false);
  });

  it("7. Successfully updates Seller password in database", async () => {
    const reqRes = await requestPasswordReset(sellerEmail, "seller");
    const token = new URL(reqRes.debugResetUrl!).searchParams.get("token")!;

    const resetRes = await performPasswordReset(token, newPassword, newPassword, "seller");
    expect(resetRes.success).toBe(true);

    // Verify updated password in dedicated seller database collection
    const seller = await mongoSellers.findByEmail(sellerEmail);
    expect(seller).toBeDefined();
    expect(verifyPassword(newPassword, seller!.passwordHash)).toBe(true);
    expect(verifyPassword(initialPassword, seller!.passwordHash)).toBe(false);
  });

  it("8. Strict Role Isolation — Seller token cannot be used to reset User account", async () => {
    const sellerReq = await requestPasswordReset(sellerEmail, "seller");
    const sellerToken = new URL(sellerReq.debugResetUrl!).searchParams.get("token")!;

    // Attempting to use seller token on customer validation endpoint/role
    const crossValidation = await validateResetToken(sellerToken, "customer");
    expect(crossValidation.valid).toBe(false);
    expect(crossValidation.error).toContain("intended for seller accounts");

    // Attempting to execute reset on customer endpoint
    const crossReset = await performPasswordReset(sellerToken, newPassword, newPassword, "customer");
    expect(crossReset.success).toBe(false);
    expect(crossReset.error).toContain("intended for seller accounts");
  });

  it("9. Strict Role Isolation — User token cannot be used to reset Seller account", async () => {
    const custReq = await requestPasswordReset(customerEmail, "customer");
    const custToken = new URL(custReq.debugResetUrl!).searchParams.get("token")!;

    // Attempting to use customer token on seller validation endpoint/role
    const crossValidation = await validateResetToken(custToken, "seller");
    expect(crossValidation.valid).toBe(false);
    expect(crossValidation.error).toContain("intended for user accounts");

    // Attempting to execute reset on seller endpoint
    const crossReset = await performPasswordReset(custToken, newPassword, newPassword, "seller");
    expect(crossReset.success).toBe(false);
    expect(crossReset.error).toContain("intended for user accounts");
  });

  it("10. Generates new token and invalidates prior active tokens when new request is made", async () => {
    const req1 = await requestPasswordReset(customerEmail, "customer");
    const token1 = new URL(req1.debugResetUrl!).searchParams.get("token")!;

    const req2 = await requestPasswordReset(customerEmail, "customer");
    const token2 = new URL(req2.debugResetUrl!).searchParams.get("token")!;

    // token1 should now be invalidated
    const val1 = await validateResetToken(token1, "customer");
    expect(val1.valid).toBe(false);
    expect(val1.error).toContain("already been used");

    // token2 should be valid
    const val2 = await validateResetToken(token2, "customer");
    expect(val2.valid).toBe(true);
  });
});
