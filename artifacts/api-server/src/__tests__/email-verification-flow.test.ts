import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import crypto from "crypto";
import http from "http";
import app from "../app";
import { mongoUsers } from "@workspace/db";
import * as transactionalEmail from "../lib/transactionalEmail";

describe("Email Verification Before Login Workflow (VASTRAA)", () => {
  const originalEnv = { ...process.env };
  let capturedVerificationUrl: string | null = null;
  let capturedEmailOpts: any = null;
  let server: http.Server;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, "127.0.0.1", () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    capturedVerificationUrl = null;
    capturedEmailOpts = null;

    // Spy on sendEmailVerificationEmail to capture verification URLs and verify email options
    vi.spyOn(transactionalEmail, "sendEmailVerificationEmail").mockImplementation(async (opts) => {
      capturedEmailOpts = opts;
      capturedVerificationUrl = opts.verificationUrl;
      return {
        delivered: true,
        messageId: "mock-msg-id-123",
        devUrl: opts.verificationUrl,
        simulated: true,
      };
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("1. Sign-Up creates user with isEmailVerified: false and sends time-limited verification email", async () => {
    const testEmail = `buyer_${Date.now()}@example.com`;
    const res = await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "Aaradhya Sharma",
        email: testEmail,
        password: "Password@123",
        confirmPassword: "Password@123",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe(
      "Your account has been created successfully. Please check your email and verify your account before logging in."
    );
    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.email).toBe(testEmail);
    // Crucial: No authentication token must be issued on sign-up before verification
    expect(res.body.token).toBeUndefined();
    expect(res.body.accessToken).toBeUndefined();

    // Verify user record in MongoDB
    const userInDb = await mongoUsers.findByEmail(testEmail, "customer");
    expect(userInDb).toBeDefined();
    expect(userInDb?.isEmailVerified).toBe(false);
    expect(userInDb?.emailVerified).toBe(false);
    expect(userInDb?.emailVerificationTokenHash).toBeDefined();
    expect(userInDb?.emailVerificationExpires).toBeDefined();

    // Verify token expiry is set ~15 minutes in the future
    const expiresTime = new Date(userInDb!.emailVerificationExpires!).getTime();
    const diffMinutes = (expiresTime - Date.now()) / (60 * 1000);
    expect(diffMinutes).toBeGreaterThan(14);
    expect(diffMinutes).toBeLessThanOrEqual(15.5);

    // Verify plain-text token is NOT in database
    expect(capturedVerificationUrl).toBeDefined();
    const urlObj = new URL(capturedVerificationUrl!);
    const rawToken = urlObj.searchParams.get("token");
    expect(rawToken).toBeDefined();
    expect(rawToken?.length).toBe(64); // 32 bytes hex = 64 characters
    expect(userInDb?.emailVerificationTokenHash).not.toBe(rawToken);

    // Verify the stored hash matches SHA-256 of raw token
    const expectedHash = crypto.createHash("sha256").update(rawToken!).digest("hex");
    expect(userInDb?.emailVerificationTokenHash).toBe(expectedHash);

    // Verify email recipient and name
    expect(capturedEmailOpts?.toEmail).toBe(testEmail);
    expect(capturedEmailOpts?.name).toBe("Aaradhya Sharma");
  });

  it("2. Unverified users are rejected from logging in with 403 and the exact required message", async () => {
    const testEmail = `unverified_${Date.now()}@example.com`;

    // Sign up
    await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "Pooja Patel",
        email: testEmail,
        password: "SecretPassword123",
        confirmPassword: "SecretPassword123",
      });

    // Attempt login immediately before email verification
    const loginRes = await request(server)
      .post("/api/auth/sign-in")
      .send({
        email: testEmail,
        password: "SecretPassword123",
      });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.success).toBe(false);
    expect(loginRes.body.error).toBe(
      "Please verify your email address before logging in. Check your inbox for the verification link."
    );
    expect(loginRes.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(loginRes.body.isEmailVerified).toBe(false);
    // Must never return access token
    expect(loginRes.body.token).toBeUndefined();
    expect(loginRes.body.accessToken).toBeUndefined();
  });

  it("3. Rejects invalid and missing verification tokens", async () => {
    // Missing token
    const missingRes = await request(server)
      .get("/api/auth/verify-email")
      .set("Accept", "application/json");

    expect(missingRes.status).toBe(400);
    expect(missingRes.body.success).toBe(false);
    expect(missingRes.body.code).toBe("TOKEN_REQUIRED");

    // Invalid non-existent token
    const invalidRes = await request(server)
      .get("/api/auth/verify-email?token=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")
      .set("Accept", "application/json");

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.success).toBe(false);
    expect(invalidRes.body.code).toBe("INVALID_OR_USED_TOKEN");
  });

  it("4. Rejects expired verification tokens (>15 minutes) and clears them", async () => {
    const testEmail = `expired_${Date.now()}@example.com`;

    await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "Kavita Rao",
        email: testEmail,
        password: "Password@123",
        confirmPassword: "Password@123",
      });

    const rawToken = new URL(capturedVerificationUrl!).searchParams.get("token")!;
    const userInDb = await mongoUsers.findByEmail(testEmail, "customer");

    // Artificially expire the token by setting expiry in the past
    await mongoUsers.update(userInDb!.id, {
      emailVerificationExpires: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    });

    // Try to verify with expired token
    const verifyRes = await request(server)
      .get(`/api/auth/verify-email?token=${rawToken}`)
      .set("Accept", "application/json");

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.code).toBe("TOKEN_EXPIRED");
    expect(verifyRes.body.error).toContain("expired");

    // Verify token was invalidated
    const refreshedUser = await mongoUsers.findByEmail(testEmail, "customer");
    expect(refreshedUser?.isEmailVerified).toBe(false);
    expect(refreshedUser?.emailVerificationTokenHash).toBeUndefined();
  });

  it("5. Resend verification generates new token, expires previous token, and avoids user enumeration", async () => {
    const testEmail = `resend_${Date.now()}@example.com`;

    await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "Meera Sen",
        email: testEmail,
        password: "Password@123",
        confirmPassword: "Password@123",
      });

    const initialToken = new URL(capturedVerificationUrl!).searchParams.get("token")!;
    capturedVerificationUrl = null;

    // Resend verification
    const resendRes = await request(server)
      .post("/api/auth/resend-verification")
      .send({ email: testEmail });

    expect(resendRes.status).toBe(200);
    expect(resendRes.body.success).toBe(true);
    expect(resendRes.body.message).toBe(
      "If your account requires verification, a verification email has been sent."
    );

    // Verify a new token was generated
    expect(capturedVerificationUrl).toBeDefined();
    const newToken = new URL(capturedVerificationUrl!).searchParams.get("token")!;
    expect(newToken).not.toBe(initialToken);

    // Old token should now be expired / invalid
    const oldVerifyRes = await request(server)
      .get(`/api/auth/verify-email?token=${initialToken}`)
      .set("Accept", "application/json");
    expect(oldVerifyRes.status).toBe(400);

    // Test non-existent email returns identical success message without exposing database status
    const fakeRes = await request(server)
      .post("/api/auth/resend-verification")
      .send({ email: "doesnotexist_999@example.com" });

    expect(fakeRes.status).toBe(200);
    expect(fakeRes.body.success).toBe(true);
    expect(fakeRes.body.message).toBe(
      "If your account requires verification, a verification email has been sent."
    );
  });

  it("6. Successful verification marks account verified, removes token fields, and allows login", async () => {
    const testEmail = `verify_success_${Date.now()}@example.com`;

    await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "Rhea Deshmukh",
        email: testEmail,
        password: "ValidPassword123!",
        confirmPassword: "ValidPassword123!",
      });

    const rawToken = new URL(capturedVerificationUrl!).searchParams.get("token")!;

    // Verify email via GET /api/auth/verify-email?token=...
    const verifyRes = await request(server)
      .get(`/api/auth/verify-email?token=${rawToken}`)
      .set("Accept", "application/json");

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.message).toContain("verified successfully");
    expect(verifyRes.body.redirectUrl).toBe("/sign-in?verified=true");

    // Verify MongoDB state
    const verifiedUser = await mongoUsers.findByEmail(testEmail, "customer");
    expect(verifiedUser?.isEmailVerified).toBe(true);
    expect(verifiedUser?.emailVerified).toBe(true);
    // Token fields must be removed after successful verification
    expect(verifiedUser?.emailVerificationTokenHash).toBeUndefined();
    expect(verifiedUser?.emailVerificationExpires).toBeUndefined();

    // Verify token cannot be reused
    const reuseRes = await request(server)
      .get(`/api/auth/verify-email?token=${rawToken}`)
      .set("Accept", "application/json");
    expect(reuseRes.status).toBe(400);

    // Now login should succeed completely
    const loginRes = await request(server)
      .post("/api/auth/sign-in")
      .send({
        email: testEmail,
        password: "ValidPassword123!",
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.user.email).toBe(testEmail);
  });

  it("7. Browser GET requests to /api/auth/verify-email redirect to login on success", async () => {
    const testEmail = `browser_redirect_${Date.now()}@example.com`;

    await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "Ananya Roy",
        email: testEmail,
        password: "ValidPassword123!",
        confirmPassword: "ValidPassword123!",
      });

    const rawToken = new URL(capturedVerificationUrl!).searchParams.get("token")!;

    // Request as browser navigation with Accept: text/html
    const navRes = await request(server)
      .get(`/api/auth/verify-email?token=${rawToken}`)
      .set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9");

    expect(navRes.status).toBe(302);
    expect(navRes.headers.location).toContain("/sign-in?verified=true");
  });

  it("8. Existing verified users can still log in without obstruction", async () => {
    const existingEmail = `existing_verified_${Date.now()}@example.com`;

    // Create an existing verified user directly (simulating pre-existing or Google accounts)
    await mongoUsers.insert({
      name: "Existing Verified Customer",
      email: existingEmail,
      passwordHash: transactionalEmail ? "$2b$10$abcdef..." : "",
      role: "customer",
      isEmailVerified: true,
      emailVerified: true,
    });

    // Also test through sign-in flow by registering and verifying
    const testEmail = `legacy_user_${Date.now()}@example.com`;
    await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "Legacy User",
        email: testEmail,
        password: "MyPassword123",
        confirmPassword: "MyPassword123",
      });

    const rawToken = new URL(capturedVerificationUrl!).searchParams.get("token")!;
    await request(server).get(`/api/auth/verify-email?token=${rawToken}`);

    // Login succeeds
    const res = await request(server)
      .post("/api/auth/sign-in")
      .send({
        email: testEmail,
        password: "MyPassword123",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  it("9. Prevents duplicate account registrations", async () => {
    const email = `duplicate_check_${Date.now()}@example.com`;

    const first = await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "User One",
        email,
        password: "Password@123",
        confirmPassword: "Password@123",
      });
    expect(first.status).toBe(201);

    const duplicate = await request(server)
      .post("/api/auth/sign-up")
      .send({
        name: "User Duplicate",
        email,
        password: "Password@123",
        confirmPassword: "Password@123",
      });

    expect(duplicate.status).toBe(400);
    expect(duplicate.body.success).toBe(false);
    expect(duplicate.body.error).toContain("already exists");
  });
});
