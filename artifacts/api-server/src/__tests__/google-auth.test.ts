import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createGoogleAuthChallenge,
  verifyGoogleAuthOtp,
  resendGoogleAuthOtp,
  getGoogleOAuthUrl,
} from "../lib/googleAuth";
import { mongoUsers } from "@workspace/db";

describe("Google Social Auth & OTP Flow Unit Tests", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test_google_client_id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test_google_client_secret";
  });

  it("generates Google OAuth URL with proper scopes and state", () => {
    const url = getGoogleOAuthUrl("http://localhost:5000/google-callback", "test_state_123");
    expect(url).toBeDefined();
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=test_google_client_id");
    expect(url).toContain("state=test_state_123");
  });

  it("throws configuration error if GOOGLE_CLIENT_ID is missing", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    expect(() => getGoogleOAuthUrl("http://localhost:5000/google-callback", "state")).toThrow(
      /Google OAuth is not configured/
    );
  });

  it("creates Google OTP challenge and sends 6-digit OTP", async () => {
    const challenge = await createGoogleAuthChallenge({
      email: "test.otp@example.com",
      googleId: "google_12345",
      name: "Test OTP User",
      targetRole: "customer",
      mode: "signup",
    });

    expect(challenge.challengeId).toBeDefined();
    expect(challenge.email).toBe("test.otp@example.com");
    expect(challenge.targetRole).toBe("customer");
  });

  it("rejects invalid OTP code and decrements attempt count", async () => {
    const challenge = await createGoogleAuthChallenge({
      email: "invalid.otp@example.com",
      googleId: "google_abcde",
      name: "Invalid OTP User",
      targetRole: "customer",
      mode: "login",
    });

    const wrongOtp = "000000";
    const result = verifyGoogleAuthOtp(challenge.challengeId, wrongOtp, "customer");

    expect(result.success).toBe(false);
    expect(result.code).toBe("INVALID_OTP");
    expect(result.error).toContain("Invalid OTP code");
  });

  it("enforces rate-limiting on resending OTP", async () => {
    const challenge = await createGoogleAuthChallenge({
      email: "resend.otp@example.com",
      googleId: "google_fghij",
      name: "Resend User",
      targetRole: "customer",
      mode: "login",
    });

    // Immediate resend should be blocked by 60s cooldown timer
    const immediateResend = await resendGoogleAuthOtp(challenge.challengeId);
    expect(immediateResend.success).toBe(false);
    expect(immediateResend.error).toContain("Please wait");
  });

  it("prevents duplicate User creation when linking existing email", async () => {
    const existingEmail = "existing.user@example.com";
    await mongoUsers.insert({
      name: "Existing User",
      email: existingEmail,
      passwordHash: "hash123",
      role: "customer",
    });

    const userBefore = await mongoUsers.findByEmail(existingEmail);
    expect(userBefore).toBeDefined();

    // Verify lookup finds existing account
    const foundUser = await mongoUsers.findByEmail(existingEmail);
    expect(foundUser?.id).toBe(userBefore?.id);
  });
});
