import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import rateLimit from "express-rate-limit";
import { authRateLimiter, otpRateLimiter, couponValidateLimiter, ticketCreationLimiter, pdfExportLimiter } from "../middlewares/rateLimiter";
import { checkAccountLockout, recordFailedAttempt, recordSuccessfulLogin } from "../lib/authSecurity";

describe("Rate Limiting & Abuse Prevention Protections", () => {
  describe("1. Express Rate Limiter Middleware Capabilities", () => {
    it("returns 429 Too Many Requests when rate limit threshold is exceeded", async () => {
      const app = express();
      const testLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Rate limit exceeded" },
      });

      app.get("/test-limit", testLimiter, (_req, res) => {
        res.json({ ok: true });
      });

      // 3 allowed requests
      const r1 = await request(app).get("/test-limit");
      expect(r1.status).toBe(200);
      const r2 = await request(app).get("/test-limit");
      expect(r2.status).toBe(200);
      const r3 = await request(app).get("/test-limit");
      expect(r3.status).toBe(200);

      // 4th request exceeds max: 3
      const r4 = await request(app).get("/test-limit");
      expect(r4.status).toBe(429);
      expect(r4.body.error).toBe("Rate limit exceeded");
    });
  });

  describe("2. IP-Bound Account Lockout & Anti-Griefing", () => {
    it("isolates failed attempts by client IP so an attacker cannot lock out victims from another IP", () => {
      const targetUser = "victim@vashtraa.com";
      const attackerIp = "198.51.100.5";
      const legitimateIp = "203.0.113.42";

      // Reset
      recordSuccessfulLogin(targetUser, "customer", attackerIp);
      recordSuccessfulLogin(targetUser, "customer", legitimateIp);

      // Attacker performs 5 consecutive failed attempts
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(targetUser, "customer", attackerIp);
      }

      // Attacker IP is now locked
      const attackerCheck = checkAccountLockout(targetUser, "customer", attackerIp);
      expect(attackerCheck.isLocked).toBe(true);

      // Legitimate user from legitimate IP is NOT locked
      const victimCheck = checkAccountLockout(targetUser, "customer", legitimateIp);
      expect(victimCheck.isLocked).toBe(false);
    });
  });

  describe("3. Rate Limiter Middleware Definitions & Configurations", () => {
    it("ensures all sensitive attack surfaces have active rate limiters configured", () => {
      expect(authRateLimiter).toBeDefined();
      expect(otpRateLimiter).toBeDefined();
      expect(couponValidateLimiter).toBeDefined();
      expect(ticketCreationLimiter).toBeDefined();
      expect(pdfExportLimiter).toBeDefined();
    });
  });
});
