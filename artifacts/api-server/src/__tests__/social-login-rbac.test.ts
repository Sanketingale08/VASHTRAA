import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import {
  mongoUsers,
  mongoVendors,
  mongoSellers,
  mongoProducts,
  mongoOrders,
  mongoSessions,
} from "@workspace/db";
import { signAccessToken, verifyAccessToken } from "../lib/jwt";
import { findSessionInStore } from "../lib/sessions";

describe("Required Test Cases: Social Login, RBAC, and Dashboard Isolation in VASTRAA", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test_google_client_id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test_google_client_secret";
  });

  /**
   * 1. New Google login creates a customer account and does not open the seller portal.
   */
  it("Test Case 1: New Google login creates a customer account and does not open the seller portal", async () => {
    const newEmail = `tc1.newuser.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(newEmail).toString("hex")}`;

    // Initiating Google login from the seller flow
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
    expect(res.body.user.email).toBe(newEmail);
    // Crucial check: Must be customer, NEVER seller
    expect(res.body.user.role).toBe("customer");
    // Crucial check: Redirection must be onboarding (/seller/register), NEVER /seller/dashboard
    expect(res.body.redirectUrl).toBe("/seller/register");

    // Verify DB state: user is stored as customer
    const userInDb = await mongoUsers.findById(res.body.user.id);
    expect(userInDb?.role).toBe("customer");

    // Verify NO approved vendor shop was auto-created in mongoVendors or mongoSellers
    const vendor = await mongoVendors.findByOwnerId(res.body.user.id);
    expect(vendor).toBeNull();

    // Verify customer token is blocked from accessing seller dashboard API
    const sellerDashRes = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", `Bearer ${res.body.token}`);

    expect(sellerDashRes.status).toBe(403);
    expect(sellerDashRes.body.code).toBe("ROLE_MISMATCH");
  });

  /**
   * 2. Existing customer social login opens only the customer dashboard.
   */
  it("Test Case 2: Existing customer social login opens only the customer dashboard", async () => {
    const custEmail = `tc2.cust.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(custEmail).toString("hex")}`;

    // Pre-create customer account
    const existingCust = await mongoUsers.insert({
      name: "Existing Shopper",
      email: custEmail,
      passwordHash: "cust_pwd_hash",
      role: "customer",
    });

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
    expect(res.body.user.id).toBe(existingCust.id);
    expect(res.body.user.role).toBe("customer");
    expect(res.body.redirectUrl).toBe("/account/overview");

    // Verify identity restoration via /api/auth/me
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${res.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(custEmail);
    expect(meRes.body.user.role).toBe("customer");
  });

  /**
   * 3. An authorized seller can access their own seller dashboard.
   */
  it("Test Case 3: An authorized seller can access their own seller dashboard", async () => {
    const sellerEmail = `tc3.seller.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(sellerEmail).toString("hex")}`;

    // Pre-register seller account and approved vendor record
    const sellerUser = await mongoUsers.insert({
      name: "Authorized Artisan",
      email: sellerEmail,
      passwordHash: "seller_pwd_hash",
      role: "seller",
    });

    const vendorDoc = await mongoVendors.insert({
      id: `vend_${sellerUser.id}`,
      name: "Yeola Silk Handlooms",
      email: sellerEmail,
      contactEmail: sellerEmail,
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

    // Verify authorized access to /api/seller/dashboard
    const dashRes = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", `Bearer ${res.body.token}`);

    expect(dashRes.status).toBe(200);

    // Verify authorized access to /api/seller/profile
    const profRes = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${res.body.token}`);

    expect(profRes.status).toBe(200);
    expect(profRes.body.shopName).toBe("Yeola Silk Handlooms");
  });

  /**
   * 4. A customer cannot access seller pages or seller APIs by changing the URL.
   */
  it("Test Case 4: A customer cannot access seller pages or seller APIs by changing the URL", async () => {
    const custEmail = `tc4.cust.${Date.now()}@example.com`;
    const custUser = await mongoUsers.insert({
      name: "Url Manipulator",
      email: custEmail,
      passwordHash: "hash123",
      role: "customer",
    });

    // Customer token
    const customerToken = signAccessToken({
      sub: custUser.id,
      role: "customer",
      email: custEmail,
    });

    // Try accessing various protected seller endpoints
    const endpoints = [
      "/api/seller/dashboard",
      "/api/seller/products",
      "/api/seller/profile",
      "/api/seller/payouts",
      "/api/seller/status",
    ];

    for (const ep of endpoints) {
      const res = await request(app)
        .get(ep)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ROLE_MISMATCH");
    }
  });

  /**
   * 5. Seller A cannot access Seller B's products, orders, profile, earnings, or financial reports.
   */
  it("Test Case 5: Seller A cannot access Seller B's products, orders, profile, earnings, or financial reports", async () => {
    // 1. Create Seller A
    const sellerAUser = await mongoUsers.insert({
      name: "Seller A",
      email: `sellerA.${Date.now()}@example.com`,
      passwordHash: "hashA",
      role: "seller",
    });
    const vendorA = await mongoVendors.insert({
      id: `vend_A_${Date.now()}`,
      vendorId: `vend_A_${Date.now()}`,
      name: "Shop A",
      email: sellerAUser.email,
      ownerId: sellerAUser.id,
      status: "approved",
    });

    // 2. Create Seller B
    const sellerBUser = await mongoUsers.insert({
      name: "Seller B",
      email: `sellerB.${Date.now()}@example.com`,
      passwordHash: "hashB",
      role: "seller",
    });
    const vendorB = await mongoVendors.insert({
      id: `vend_B_${Date.now()}`,
      vendorId: `vend_B_${Date.now()}`,
      name: "Shop B",
      email: sellerBUser.email,
      ownerId: sellerBUser.id,
      status: "approved",
    });

    // 3. Create Product owned exclusively by Seller B
    const prodB = await mongoProducts.insert({
      id: `prod_B_${Date.now()}`,
      name: "Seller B Exclusive Paithani",
      price: 12500,
      stock: 5,
      vendorId: vendorB.id,
      sellerId: vendorB.id,
      ownerId: sellerBUser.id,
      status: "approved",
      active: true,
    });

    // 4. Create Order containing Seller B's product
    const orderB = await mongoOrders.insert({
      id: `ord_B_${Date.now()}`,
      displayId: "ORD-B-1001",
      customerName: "Buyer",
      items: [
        {
          productId: prodB.id,
          name: prodB.name,
          price: 12500,
          quantity: 1,
          vendorId: vendorB.id,
        },
      ],
      total: 12500,
      status: "delivered",
      createdAt: new Date().toISOString(),
    });

    const tokenA = signAccessToken({
      sub: sellerAUser.id,
      role: "seller",
      email: sellerAUser.email,
    });

    // Attack 1: Seller A attempts to update Seller B's product
    const updateRes = await request(app)
      .put(`/api/products/${prodB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ price: 100 });

    expect(updateRes.status).toBe(403);
    expect(updateRes.body.error).toContain("you do not own this product");

    // Attack 2: Seller A attempts to delete Seller B's product
    const deleteRes = await request(app)
      .delete(`/api/products/${prodB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.error).toContain("you do not own this product");

    // Attack 3: Seller A attempts to view Seller B's order
    const viewOrderRes = await request(app)
      .get(`/api/seller/orders/${orderB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(viewOrderRes.status).toBe(403);
    expect(viewOrderRes.body.error).toContain("don't have any items in this order");

    // Attack 4: Seller A's product list must NOT contain Seller B's products
    const prodsListRes = await request(app)
      .get("/api/seller/products")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(prodsListRes.status).toBe(200);
    const prodIds = prodsListRes.body.products.map((p: any) => p.id);
    expect(prodIds).not.toContain(prodB.id);

    // Attack 5: Seller A's profile must show Seller A's details, not Seller B
    const profRes = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(profRes.status).toBe(200);
    expect(profRes.body.shopName).toBe("Shop A");
    expect(profRes.body.ownerId).toBe(sellerAUser.id);
  }, 20000);

  /**
   * 6. A customer cannot access admin pages or admin APIs.
   */
  it("Test Case 6: A customer cannot access admin pages or admin APIs", async () => {
    const custUser = await mongoUsers.insert({
      name: "Regular Customer",
      email: `cust.admin.probe.${Date.now()}@example.com`,
      passwordHash: "hash123",
      role: "customer",
    });

    const custToken = signAccessToken({
      sub: custUser.id,
      role: "customer",
      email: custUser.email,
    });

    const adminEndpoints = [
      "/api/admin/vendors",
      "/api/admin/orders",
      "/api/admin/products/stats",
      "/api/admin/settings/profile",
      "/api/admin/shipping/status",
    ];

    for (const ep of adminEndpoints) {
      const res = await request(app)
        .get(ep)
        .set("Authorization", `Bearer ${custToken}`);

      // Must be rejected with 403 Forbidden
      expect(res.status).toBe(403);
    }
  });

  /**
   * 7. An unauthorized user cannot obtain admin access by modifying frontend state or API payloads.
   */
  it("Test Case 7: An unauthorized user cannot obtain admin access by modifying frontend state or API payloads", async () => {
    const custUser = await mongoUsers.insert({
      name: "Privilege Escalation Attacker",
      email: `attacker.${Date.now()}@example.com`,
      passwordHash: "hash123",
      role: "customer",
    });

    const custToken = signAccessToken({
      sub: custUser.id,
      role: "customer",
      email: custUser.email,
    });

    // Attacker tries to inject { role: "admin", isAdmin: true, userRole: "super_admin" } into profile update
    const patchRes = await request(app)
      .patch("/api/account/profile")
      .set("Authorization", `Bearer ${custToken}`)
      .send({
        name: "Tampered Admin",
        role: "admin",
        isAdmin: true,
        userRole: "super_admin",
      });

    expect(patchRes.status).toBe(200);

    // Verify DB record: role in database remains strictly "customer"
    const freshUser = await mongoUsers.findById(custUser.id);
    expect(freshUser?.role).toBe("customer");

    // Attacker tries to supply fake admin claims to access admin endpoint
    const adminRes = await request(app)
      .get("/api/admin/vendors")
      .set("Authorization", `Bearer ${custToken}`)
      .send({ role: "admin", isAdmin: true });

    expect(adminRes.status).toBe(403);
  });

  /**
   * 8. Refreshing the browser preserves the correct authenticated account and role.
   */
  it("Test Case 8: Refreshing the browser preserves the correct authenticated account and role", async () => {
    // 1. Authenticate Customer via Google Login
    const custEmail = `refresh.cust.${Date.now()}@example.com`;
    const devCustCode = `dev_google_code_${Buffer.from(custEmail).toString("hex")}`;

    const custLoginRes = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCustCode,
        role: "customer",
        mode: "login",
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(custLoginRes.status).toBe(200);
    const custToken = custLoginRes.body.token;

    // Simulate browser reload calling /api/auth/me with stored token
    const custMe = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${custToken}`);

    expect(custMe.status).toBe(200);
    expect(custMe.body.user.email).toBe(custEmail);
    expect(custMe.body.user.role).toBe("customer");

    // 2. Authenticate Seller via Google Login
    const sellerEmail = `refresh.seller.${Date.now()}@example.com`;
    const devSellerCode = `dev_google_code_${Buffer.from(sellerEmail).toString("hex")}`;

    const sellerUser = await mongoUsers.insert({
      name: "Refresh Seller",
      email: sellerEmail,
      passwordHash: "hash123",
      role: "seller",
    });
    await mongoVendors.insert({
      id: `vend_ref_${Date.now()}`,
      name: "Refresh Shop",
      email: sellerEmail,
      ownerId: sellerUser.id,
      status: "approved",
    });

    const sellerLoginRes = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devSellerCode,
        role: "seller",
        mode: "login",
        redirectUri: "http://localhost:3000/google-callback",
      });

    expect(sellerLoginRes.status).toBe(200);
    const sellerToken = sellerLoginRes.body.token;

    // Simulate browser reload calling /api/seller/status with stored token
    const sellerStatus = await request(app)
      .get("/api/seller/status")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(sellerStatus.status).toBe(200);
    expect(sellerStatus.body.isSeller).toBe(true);
    expect(sellerStatus.body.vendorName).toBe("Refresh Shop");
  });

  /**
   * 9. Logging out and switching accounts does not retain the previous user's session or data.
   */
  it("Test Case 9: Logging out and switching accounts does not retain the previous user's session or data", async () => {
    // 1. User 1 logs in
    const user1Email = `user1.${Date.now()}@example.com`;
    const devCode1 = `dev_google_code_${Buffer.from(user1Email).toString("hex")}`;

    const loginRes1 = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCode1,
        role: "customer",
        mode: "login",
        redirectUri: "http://localhost:3000/google-callback",
      });

    const token1 = loginRes1.body.token;
    const jwt1 = verifyAccessToken(token1);
    expect(jwt1?.sid).toBeDefined();

    // Verify session is active
    const meRes1 = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token1}`);
    expect(meRes1.status).toBe(200);
    expect(meRes1.body.user.email).toBe(user1Email);

    // 2. User 1 logs out
    const logoutRes = await request(app)
      .post("/api/auth/sign-out")
      .set("Authorization", `Bearer ${token1}`);

    expect(logoutRes.status).toBe(200);

    // 3. User 1's token is now REVOKED and rejected
    const revokedRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token1}`);

    expect(revokedRes.status).toBe(401);
    expect(revokedRes.body.code).toBe("SESSION_REVOKED");

    // 4. User 2 logs in on the same browser
    const user2Email = `user2.${Date.now()}@example.com`;
    const devCode2 = `dev_google_code_${Buffer.from(user2Email).toString("hex")}`;

    const loginRes2 = await request(app)
      .post("/api/auth/google/callback")
      .send({
        code: devCode2,
        role: "customer",
        mode: "login",
        redirectUri: "http://localhost:3000/google-callback",
      });

    const token2 = loginRes2.body.token;
    const meRes2 = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token2}`);

    expect(meRes2.status).toBe(200);
    // User 2's session contains ONLY User 2's data
    expect(meRes2.body.user.email).toBe(user2Email);
    expect(meRes2.body.user.email).not.toBe(user1Email);
  });

  /**
   * 10. Invalid, expired, or tampered authentication tokens are rejected.
   */
  it("Test Case 10: Invalid, expired, or tampered authentication tokens are rejected", async () => {
    // 1. Missing token
    const missingRes = await request(app).get("/api/auth/me");
    expect(missingRes.status).toBe(401);

    // 2. Tampered token (modified signature characters)
    const validToken = signAccessToken({ sub: "user_123", role: "customer", email: "tamper@example.com" });
    const tamperedToken = validToken.substring(0, validToken.length - 8) + "TamperedX";

    const tamperedRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tamperedToken}`);

    expect(tamperedRes.status).toBe(401);
    expect(tamperedRes.body.code).toBe("UNAUTHORIZED");

    // 3. Expired token (using negative TTL)
    const expiredToken = signAccessToken(
      { sub: "user_123", role: "customer", email: "expired@example.com" },
      "-10s"
    );

    const expiredRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(expiredRes.status).toBe(401);

    // 4. Garbage string as token
    const garbageRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid_non_jwt_token_payload");

    expect(garbageRes.status).toBe(401);
  });

  /**
   * 11. OAuth callback failures do not create unauthorized sessions.
   */
  it("Test Case 11: OAuth callback failures do not create unauthorized sessions", async () => {
    // 1. Empty body
    const emptyRes = await request(app)
      .post("/api/auth/google/callback")
      .send({});

    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.success).toBe(false);
    expect(emptyRes.headers["set-cookie"]).toBeUndefined();

    // 2. Missing authorization code
    const missingCodeRes = await request(app)
      .post("/api/auth/google/callback")
      .send({ role: "customer", mode: "login" });

    expect(missingCodeRes.status).toBe(400);
    expect(missingCodeRes.body.success).toBe(false);
    expect(missingCodeRes.headers["set-cookie"]).toBeUndefined();

    // 3. Invalid OTP verification challenge
    const invalidOtpRes = await request(app)
      .post("/api/auth/google/verify-otp")
      .send({ challengeId: "non_existent_challenge", otp: "123456" });

    expect(invalidOtpRes.status).toBe(400);
    expect(invalidOtpRes.body.success).toBe(false);
    expect(invalidOtpRes.headers["set-cookie"]).toBeUndefined();
  });

  /**
   * 12. Existing seller approvals and account permissions remain unchanged after social login.
   */
  it("Test Case 12: Existing seller approvals and account permissions remain unchanged after social login", async () => {
    const sellerEmail = `tc12.approved.${Date.now()}@example.com`;
    const devCode = `dev_google_code_${Buffer.from(sellerEmail).toString("hex")}`;

    // Create an established seller with customized business data and approved status
    const sellerUser = await mongoUsers.insert({
      name: "Master Artisan Rajesh",
      email: sellerEmail,
      passwordHash: "hash123",
      role: "seller",
      phone: "9876543210",
    });

    const originalVendor = await mongoVendors.insert({
      id: `vend_${sellerUser.id}`,
      name: "Rajesh Traditional Handlooms",
      email: sellerEmail,
      contactEmail: sellerEmail,
      ownerId: sellerUser.id,
      status: "approved",
      location: "Paithan, Maharashtra",
      rating: 4.95,
      sareesCount: 42,
      gstin: "27AAAAA0000A1Z5",
      bankAccount: "123456789012",
      bankIfsc: "SBIN0001234",
      bankVerified: true,
    });

    // Seller signs in via Google OAuth
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

    // Query database directly to confirm approvals and business data were NOT modified or reset
    const vendorAfterLogin = await mongoVendors.findByOwnerId(sellerUser.id);
    expect(vendorAfterLogin).toBeDefined();
    expect(vendorAfterLogin?.status).toBe("approved");
    expect(vendorAfterLogin?.gstin).toBe("27AAAAA0000A1Z5");
    expect(vendorAfterLogin?.bankAccount).toBe("123456789012");
    expect(vendorAfterLogin?.bankVerified).toBe(true);
    expect(vendorAfterLogin?.sareesCount).toBe(42);
    expect(vendorAfterLogin?.location).toBe("Paithan, Maharashtra");

    // Seller user role in DB remains "seller"
    const userAfterLogin = await mongoUsers.findById(sellerUser.id);
    expect(userAfterLogin?.role).toBe("seller");
  });
});
