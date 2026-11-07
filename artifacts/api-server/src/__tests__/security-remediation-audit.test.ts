import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getJwtSecret, signAccessToken, verifyAccessToken } from "../lib/jwt";
import { r2StorageService } from "../services/r2StorageService";
import { confirmOrderPayment } from "../routes/payments";
import { verifyAdminAccessKey } from "../middlewares/isAdmin";
import { mongoOrders, mongoUsers } from "@workspace/db";

describe("Security Remediation & Hardening Audit Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("1. JWT Secret & Token Hardening", () => {
    it("should never fallback to a static hardcoded string in production", () => {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;
      delete process.env.SESSION_SECRET;

      const secret = getJwtSecret();
      expect(secret).not.toBe("vastraa-production-jwt-secret-2026-key-v1");
      expect(secret).not.toBe("dev-vastraa-insecure-jwt-secret-do-not-use-in-prod");
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });

    it("should correctly sign and verify a JWT access token with role and subject", () => {
      process.env.JWT_SECRET = "super-secret-production-key-strictly-tested-32-chars-long";
      const token = signAccessToken({
        sub: "user_test_sec_01",
        role: "customer",
        email: "sec.test@vastraasaree.com",
      });

      expect(typeof token).toBe("string");
      const verified = verifyAccessToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe("user_test_sec_01");
      expect(verified?.role).toBe("customer");
      expect(verified?.email).toBe("sec.test@vastraasaree.com");
    });

    it("should reject tampered JWT signatures", () => {
      process.env.JWT_SECRET = "super-secret-production-key-strictly-tested-32-chars-long";
      const token = signAccessToken({
        sub: "user_victim_123",
        role: "customer",
        email: "victim@vastraasaree.com",
      });

      const parts = token.split(".");
      // Tamper payload to elevate role to admin
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      payload.role = "admin";
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const verified = verifyAccessToken(tamperedToken);
      expect(verified).toBeNull();
    });
  });

  describe("2. R2 MIME Validation & Stored XSS Prevention", () => {
    it("should accept safe raster images (JPG, PNG, WEBP)", () => {
      const jpgResult = r2StorageService.validateFileMetadata("image/jpeg", 1024 * 500);
      expect(jpgResult.ok).toBe(true);

      const pngResult = r2StorageService.validateFileMetadata("image/png", 1024 * 500);
      expect(pngResult.ok).toBe(true);

      const webpResult = r2StorageService.validateFileMetadata("image/webp", 1024 * 500);
      expect(webpResult.ok).toBe(true);
    });

    it("should strictly reject image/svg+xml to prevent stored XSS attacks", () => {
      const svgResult = r2StorageService.validateFileMetadata("image/svg+xml", 1024);
      expect(svgResult.ok).toBe(false);
      expect(svgResult.error).toContain("Invalid file format");
    });

    it("should reject HTML and non-image MIME types", () => {
      const htmlResult = r2StorageService.validateFileMetadata("text/html", 1024);
      expect(htmlResult.ok).toBe(false);

      const scriptResult = r2StorageService.validateFileMetadata("application/javascript", 1024);
      expect(scriptResult.ok).toBe(false);
    });

    it("should reject files exceeding the 25MB maximum limit", () => {
      const largeResult = r2StorageService.validateFileMetadata("image/jpeg", 30 * 1024 * 1024);
      expect(largeResult.ok).toBe(false);
      expect(largeResult.error).toContain("exceeds limit");
    });
  });

  describe("3. Admin Key & Default Credential Hardening", () => {
    it("should reject Admin@123 in production when no DB hash is set", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.ADMIN_API_KEY;

      const isAllowed = await verifyAdminAccessKey("Admin@123");
      expect(isAllowed).toBe(false);
    });

    it("should reject empty or invalid admin keys", async () => {
      expect(await verifyAdminAccessKey("")).toBe(false);
      expect(await verifyAdminAccessKey(undefined)).toBe(false);
      expect(await verifyAdminAccessKey("wrong-key-12345")).toBe(false);
    });
  });

  describe("4. Cashfree Payment & Underpayment Prevention", () => {
    it("should reject confirming an order when paid amount is less than order total", async () => {
      const mockOrderId = "ORD-SEC-TEST-999";
      vi.spyOn(mongoOrders, "findById").mockResolvedValueOnce({
        id: mockOrderId,
        total: 2500,
        paymentStatus: "pending",
        status: "pending",
        items: [],
      } as any);

      // Attempt underpayment: order total is ₹2500, but payment reports ₹100
      await expect(
        confirmOrderPayment(mockOrderId, {
          paymentId: "cf_pay_underpay_1",
          paymentMethod: "upi",
          amount: 100,
        })
      ).rejects.toThrow(/Payment amount mismatch/);
    });
  });
});

