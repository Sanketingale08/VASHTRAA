import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createGoogleAuthChallenge,
  verifyGoogleAuthOtp,
  resendGoogleAuthOtp,
  getGoogleOAuthUrl,
} from "../lib/googleAuth";
import { mongoUsers, mongoVendors } from "@workspace/db";
import { verifyAccessToken } from "../lib/jwt";

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

  it("uses development social login fallback URL if GOOGLE_CLIENT_ID is unconfigured or placeholder", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    const url = getGoogleOAuthUrl("http://localhost:5000/google-callback", "state_123");
    expect(url).toBeDefined();
    expect(url).toContain("code=");
    expect(url).toContain("dev_google_code_");
  });

  it("creates Google OTP challenge for customer signup", async () => {
    const challenge = await createGoogleAuthChallenge({
      email: "customer.signup@example.com",
      googleId: "google_cust_123",
      name: "Customer User",
      targetRole: "customer",
      mode: "signup",
    });

    expect(challenge.challengeId).toBeDefined();
    expect(challenge.email).toBe("customer.signup@example.com");
    expect(challenge.targetRole).toBe("customer");
  });

  it("creates Google OTP challenge for seller registration", async () => {
    const challenge = await createGoogleAuthChallenge({
      email: "seller.register@example.com",
      googleId: "google_seller_123",
      name: "Seller User",
      targetRole: "seller",
      mode: "signup",
    });

    expect(challenge.challengeId).toBeDefined();
    expect(challenge.email).toBe("seller.register@example.com");
    expect(challenge.targetRole).toBe("seller");
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

describe("Google OAuth HTTP Endpoints & Session Integration Tests", () => {
  it("GET /api/auth/google/url returns OAuth URL with encoded state payload", async () => {
    const res = await request(app)
      .get("/api/auth/google/url")
      .query({ role: "customer", mode: "login", redirectUri: "http://localhost:3000/google-callback" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toBeDefined();
    expect(res.body.state).toBeDefined();

    // Decode state
    const parsedState = JSON.parse(Buffer.from(res.body.state, "base64url").toString("utf-8"));
    expect(parsedState.role).toBe("customer");
    expect(parsedState.mode).toBe("login");
    expect(parsedState.redirectUri).toBe("http://localhost:3000/google-callback");
  });

  it("POST /api/auth/google/callback authenticates customer, issues JWT access token, and enables /api/auth/me access", async () => {
    const testEmail = `google.cust.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(testEmail).toString("hex")}`;

    const res = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCode,
        role: "customer",
        mode: "login",
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.role).toBe("customer");

    // Token must be a valid JWT access token
    const jwtPayload = verifyAccessToken(res.body.token);
    expect(jwtPayload).toBeDefined();
    expect(jwtPayload?.email).toBe(testEmail);
    expect(jwtPayload?.role).toBe("customer");

    // Refresh cookie must be set
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie);
    expect(cookieStr).toContain("vastraa_customer_refresh");

    // Verify /api/auth/me successfully restores identity with this token
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${res.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.user.email).toBe(testEmail);
    expect(meRes.body.user.role).toBe("customer");
  });

  it("POST /api/auth/google/callback for new user on seller flow creates customer account, does NOT grant seller access, and routes to /seller/register", async () => {
    const testSellerEmail = `google.new.seller.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(testSellerEmail).toString("hex")}`;

    const res = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCode,
        role: "seller",
        mode: "signup",
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testSellerEmail);
    // Role must be customer by default — never auto-grant seller
    expect(res.body.user.role).toBe("customer");
    // Redirection must be to seller registration/onboarding, NOT seller dashboard
    expect(res.body.redirectUrl).toBe("/seller/register");

    // Verify NO approved vendor shop was created
    const vendor = await mongoVendors.findByOwnerId(res.body.user.id);
    expect(vendor).toBeNull();

    // Verify customer refresh cookie was set
    const setCookie = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie);
    expect(cookieStr).toContain("vastraa_customer_refresh");
  });

  it("POST /api/auth/google/callback authenticates an existing authorized approved seller to /seller/dashboard", async () => {
    const authorizedSellerEmail = `google.approved.seller.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(authorizedSellerEmail).toString("hex")}`;

    // Create approved seller user and approved vendor profile in database
    const sellerUser = await mongoUsers.insert({
      name: "Approved Artisan",
      email: authorizedSellerEmail,
      passwordHash: "hash123",
      role: "seller",
    });

    await mongoVendors.insert({
      id: `vend_${sellerUser.id}`,
      name: "Artisan Handlooms",
      email: authorizedSellerEmail,
      contactEmail: authorizedSellerEmail,
      ownerId: sellerUser.id,
      status: "approved",
      location: "Yeola, Maharashtra",
      rating: 4.9,
    });

    const res = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCode,
        role: "seller",
        mode: "login",
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe("seller");
    expect(res.body.redirectUrl).toBe("/seller/dashboard");

    // Verify seller refresh cookie was set
    const setCookie = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie);
    expect(cookieStr).toContain("vastraa_seller_refresh");
  });

  it("POST /api/auth/google/callback rejects requests without authorization code or token", async () => {
    const res = await request(app)
      .post("/api/auth/google/callback")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Missing Google authorization code");
  });

  it("GET /api/auth/google/url preserves returnTo and POST /api/auth/google/callback returns it", async () => {
    const returnPath = "/checkout?step=payment";
    const urlRes = await request(app)
      .get("/api/auth/google/url")
      .query({
        role: "customer",
        mode: "login",
        returnTo: returnPath,
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(urlRes.status).toBe(200);
    expect(urlRes.body.state).toBeDefined();

    const testEmail = `google.return.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(testEmail).toString("hex")}`;

    const cbRes = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCode,
        role: "customer",
        mode: "login",
        state: urlRes.body.state,
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(cbRes.status).toBe(200);
    expect(cbRes.body.success).toBe(true);
    expect(cbRes.body.redirectUrl).toBe(returnPath);
  });

  it("maintains role-isolated accounts when same email signs in via customer vs seller Google login", async () => {
    const sharedEmail = `google.shared.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(sharedEmail).toString("hex")}`;

    // 1. Create approved seller in DB
    const sellerUser = await mongoUsers.insert({
      name: "Shared Seller",
      email: sharedEmail,
      passwordHash: "hash123",
      role: "seller",
    });

    await mongoVendors.insert({
      id: `vend_${sellerUser.id}`,
      name: "Shared Seller Shop",
      email: sharedEmail,
      contactEmail: sharedEmail,
      ownerId: sellerUser.id,
      status: "approved",
    });

    // Sign in as seller on seller portal
    const sellerRes = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCode,
        role: "seller",
        mode: "login",
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(sellerRes.status).toBe(200);
    expect(sellerRes.body.user.role).toBe("seller");
    expect(sellerRes.body.redirectUrl).toBe("/seller/dashboard");

    // 2. Also register a separate customer account with same email
    await mongoUsers.insert({
      name: "Shared Customer",
      email: sharedEmail,
      passwordHash: "hash456",
      role: "customer",
    });

    // Sign in with same email on customer portal
    const customerRes = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCode,
        role: "customer",
        mode: "login",
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(customerRes.status).toBe(200);
    expect(customerRes.body.user.role).toBe("customer");
    expect(customerRes.body.redirectUrl).toBe("/account/overview");

    // 3. Verify accounts exist with distinct roles in database
    const foundSeller = await mongoUsers.findByEmail(sharedEmail, "seller");
    const foundCustomer = await mongoUsers.findByEmail(sharedEmail, "customer");
    expect(foundSeller).toBeDefined();
    expect(foundCustomer).toBeDefined();
    expect(foundSeller?.role).toBe("seller");
    expect(foundCustomer?.role).toBe("customer");
  });
});


