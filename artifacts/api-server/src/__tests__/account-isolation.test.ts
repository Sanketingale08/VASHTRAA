import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { mongoUsers, mongoAddresses, mongoCart } from "@workspace/db";
import { signAccessToken } from "../lib/jwt";

describe("Critical Authentication & Account Isolation Suite", () => {
  const timestamp = Date.now();
  const userA = {
    name: "Alice Isolation",
    email: `alice_iso_${timestamp}@testvastraa.com`,
    password: "Password123!",
    confirmPassword: "Password123!",
  };

  const userB = {
    name: "Bob Isolation",
    email: `bob_iso_${timestamp}@testvastraa.com`,
    password: "Password123!",
    confirmPassword: "Password123!",
  };

  let tokenA: string;
  let userIdA: string;
  let cookieA: string;

  let tokenB: string;
  let userIdB: string;
  let cookieB: string;

  afterAll(async () => {
    // Cleanup created users
    if (userIdA) {
      await mongoUsers.delete(userIdA).catch(() => {});
      const addrsA = await mongoAddresses.findByUserId(userIdA).catch(() => []);
      for (const a of addrsA) {
        await mongoAddresses.delete(a.id).catch(() => {});
      }
      await mongoCart.clearCart(userIdA).catch(() => {});
    }
    if (userIdB) {
      await mongoUsers.delete(userIdB).catch(() => {});
      const addrsB = await mongoAddresses.findByUserId(userIdB).catch(() => []);
      for (const b of addrsB) {
        await mongoAddresses.delete(b.id).catch(() => {});
      }
      await mongoCart.clearCart(userIdB).catch(() => {});
    }
  });

  describe("1. User Signup & Unique Session Mapping", () => {
    it("registers User A with unique ID and independent authenticated session", async () => {
      const res = await request(app)
        .post("/api/auth/sign-up")
        .send(userA);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(userA.email);
      expect(res.body.user.name).toBe(userA.name);
      expect(res.body.user.id).toBeDefined();

      tokenA = res.body.token;
      userIdA = res.body.user.id;

      // Extract refresh cookie if set
      const cookies = res.headers["set-cookie"] || [];
      const refreshCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith("vastraa_customer_rt="))
        : "";
      if (refreshCookie) {
        cookieA = refreshCookie.split(";")[0];
      }
    });

    it("registers User B with completely different unique ID and independent session", async () => {
      const res = await request(app)
        .post("/api/auth/sign-up")
        .send(userB);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(userB.email);
      expect(res.body.user.name).toBe(userB.name);

      tokenB = res.body.token;
      userIdB = res.body.user.id;

      // Assert user IDs are completely distinct and not colliding
      expect(userIdA).not.toBe(userIdB);
      expect(tokenA).not.toBe(tokenB);

      const cookies = res.headers["set-cookie"] || [];
      const refreshCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith("vastraa_customer_rt="))
        : "";
      if (refreshCookie) {
        cookieB = refreshCookie.split(";")[0];
      }
    });
  });

  describe("2. Account Profile & Identity Isolation", () => {
    it("restores User A's identity via /api/auth/me using User A token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe(userIdA);
      expect(res.body.user.email).toBe(userA.email);
      expect(res.body.user.name).toBe(userA.name);
      expect(res.body.user.role).toBe("customer");
    });

    it("restores User B's identity via /api/auth/me using User B token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe(userIdB);
      expect(res.body.user.email).toBe(userB.email);
      expect(res.body.user.name).toBe(userB.name);
      expect(res.body.user.role).toBe("customer");
    });

    it("restores User A's profile via /api/account/profile and sets no-cache headers", async () => {
      const res = await request(app)
        .get("/api/account/profile")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe(userIdA);
      expect(res.body.user.email).toBe(userA.email);
      expect(res.body.user.role).toBe("customer");

      // Verify anti-caching headers prevent client or proxy cache leaks
      const cacheControl = res.headers["cache-control"] || "";
      expect(cacheControl).toContain("no-store");
      expect(cacheControl).toContain("no-cache");
      expect(cacheControl).toContain("private");
    });

    it("restores User B's profile via /api/account/profile and does not bleed User A's data", async () => {
      const res = await request(app)
        .get("/api/account/profile")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe(userIdB);
      expect(res.body.user.email).toBe(userB.email);
      expect(res.body.user.name).not.toBe(userA.name);
    });
  });

  describe("3. Insecure Fallback and Tampering Prevention", () => {
    it("rejects unverified x-user-id header when accessing /api/account/profile", async () => {
      const res = await request(app)
        .get("/api/account/profile")
        .set("x-user-id", userIdA);

      expect(res.status).toBe(401);
    });

    it("rejects raw unverified email string in Authorization Bearer header", async () => {
      const res = await request(app)
        .get("/api/account/profile")
        .set("Authorization", `Bearer ${userA.email}`);

      expect(res.status).toBe(401);
    });

    it("rejects arbitrary User ID string in Authorization Bearer header", async () => {
      const res = await request(app)
        .get("/api/account/profile")
        .set("Authorization", `Bearer ${userIdA}`);

      expect(res.status).toBe(401);
    });

    it("rejects tampered or forged JWT tokens", async () => {
      const parts = tokenA.split(".");
      const tamperedToken = `${parts[0]}.${parts[1]}.invalid_signature`;

      const res = await request(app)
        .get("/api/account/profile")
        .set("Authorization", `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
    });
  });

  describe("4. Resource Ownership Isolation (Addresses)", () => {
    let addressAId: string;

    it("allows User A to create an address associated strictly with User A", async () => {
      const res = await request(app)
        .post("/api/addresses")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          name: "Alice Isolation",
          phone: "9876543210",
          line1: "123 Alice St",
          city: "Pune",
          state: "Maharashtra",
          pincode: "411001",
          addressType: "home",
          isDefault: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.address).toBeDefined();
      expect(res.body.address.userId).toBe(userIdA);
      addressAId = res.body.address.id;
    });

    it("prevents User B from seeing User A's address", async () => {
      const res = await request(app)
        .get("/api/addresses")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.addresses).toBeDefined();
      const userBAddresses = res.body.addresses;
      const found = userBAddresses.find((a: any) => a.id === addressAId);
      expect(found).toBeUndefined();
    });

    it("prevents User B from updating User A's address", async () => {
      const res = await request(app)
        .put(`/api/addresses/${addressAId}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({
          name: "Hacker Bob",
          phone: "9123456789",
          line1: "Hacked Address",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
        });

      expect(res.status).toBe(404);
    });

    it("prevents User B from deleting User A's address", async () => {
      const res = await request(app)
        .delete(`/api/addresses/${addressAId}`)
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });
  });

  describe("5. Logout & Session Invalidation", () => {
    it("logs out User A and revokes the active session on the server", async () => {
      const res = await request(app)
        .post("/api/auth/sign-out")
        .set("Authorization", `Bearer ${tokenA}`)
        .set("Cookie", cookieA || "");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("rejects subsequent requests using User A's revoked token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(401);
    });

    it("verifies User B remains authenticated and unaffected after User A logs out", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(userIdB);
    });
  });
});
