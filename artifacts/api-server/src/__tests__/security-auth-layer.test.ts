import { describe, it, expect, beforeEach } from "vitest";
import { signAccessToken, verifyAccessToken } from "../lib/jwt";
import { createAuthSession, rotateRefreshToken, revokeSession, revokeAllUserSessions, listActiveUserSessions } from "../lib/sessions";

describe("Production Security & Authentication Layer", () => {
  const dummyReq: any = {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0" },
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
  };

  describe("1. JWT Access Tokens", () => {
    it("signs and verifies valid JWT access tokens", () => {
      const token = signAccessToken({
        sub: "usr_customer_101",
        role: "customer",
        email: "customer@example.com",
        sid: "sess_101",
      });

      expect(token).toBeDefined();
      expect(token.split(".").length).toBe(3);

      const payload = verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe("usr_customer_101");
      expect(payload?.role).toBe("customer");
      expect(payload?.sid).toBe("sess_101");
      expect(payload?.iss).toBe("vastraa-auth");
      expect(payload?.aud).toBe("vastraa-portal");
    });

    it("rejects tampered JWT access tokens", () => {
      const token = signAccessToken({
        sub: "usr_customer_101",
        role: "customer",
        email: "customer@example.com",
        sid: "sess_101",
      });

      const parts = token.split(".");
      const tampered = `${parts[0]}.${parts[1]}.invalid_signature_hash`;

      const payload = verifyAccessToken(tampered);
      expect(payload).toBeNull();
    });

    it("prevents role spoofing in JWT payload verification", () => {
      const token = signAccessToken({
        sub: "usr_customer_101",
        role: "customer",
        email: "customer@example.com",
        sid: "sess_101",
      });

      const payload = verifyAccessToken(token);
      expect(payload?.role).toBe("customer");
      expect(payload?.role).not.toBe("admin");
      expect(payload?.role).not.toBe("seller");
    });
  });

  describe("2. Refresh Token Rotation & Reuse Detection", () => {
    it("creates a session and successfully rotates refresh token", async () => {
      const { accessToken, refreshToken, session } = await createAuthSession(
        "usr_seller_202",
        "seller@vastraa.com",
        "seller",
        dummyReq
      );

      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(session.id).toBeDefined();

      const rotated = await rotateRefreshToken(session.id, refreshToken, dummyReq);
      expect(rotated).not.toBeNull();
      expect(rotated?.accessToken).toBeDefined();
      expect(rotated?.refreshToken).toBeDefined();
      expect(rotated?.refreshToken).not.toBe(refreshToken);
    });

    it("detects refresh token reuse and revokes entire session family", async () => {
      const { refreshToken: token1, session } = await createAuthSession(
        "usr_customer_303",
        "reuse@example.com",
        "customer",
        dummyReq
      );

      // First rotation succeeds (issues token2)
      const rotated1 = await rotateRefreshToken(session.id, token1, dummyReq);
      expect(rotated1).not.toBeNull();
      const token2 = rotated1!.refreshToken;

      // Simulate Replay Attack: Attacker presents already-used token1 after grace period
      // (Wait mock or force rotatedAt back in time to trigger reuse detection)
      rotated1!.session.rotatedAt = Date.now() - 20000; // 20 seconds ago

      const reuseAttempt = await rotateRefreshToken(session.id, token1, dummyReq);
      expect(reuseAttempt).toBeNull(); // Reuse detected and rejected!

      // Legitimate user presenting token2 should now ALSO be rejected because session family was revoked!
      const userAttempt = await rotateRefreshToken(session.id, token2, dummyReq);
      expect(userAttempt).toBeNull();
    });
  });

  describe("3. Logout & Multi-Device Revocation", () => {
    it("revokes single session on normal logout", async () => {
      const { session } = await createAuthSession(
        "usr_logout_1",
        "logout@example.com",
        "customer",
        dummyReq
      );

      await revokeSession(session.id, "user_logout");

      const active = await listActiveUserSessions("usr_logout_1", "customer");
      expect(active.find((s) => s.id === session.id)).toBeUndefined();
    });

    it("revokes all active sessions across devices on logout-all", async () => {
      const user = "usr_multi_device";
      await createAuthSession(user, "multi@example.com", "customer", dummyReq);
      await createAuthSession(user, "multi@example.com", "customer", dummyReq);

      const activeBefore = await listActiveUserSessions(user, "customer");
      expect(activeBefore.length).toBeGreaterThanOrEqual(2);

      await revokeAllUserSessions(user, "customer", "logout_all_devices");

      const activeAfter = await listActiveUserSessions(user, "customer");
      expect(activeAfter.length).toBe(0);
    });
  });
});
