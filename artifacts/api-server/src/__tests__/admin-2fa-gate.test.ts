/**
 * isAdmin middleware — 2FA gate tests
 *
 * Tests the actual isAdmin middleware (not mocked) to confirm:
 *  - GET /api/admin/* returns 403 + code:"2FA_REQUIRED" when 2FA is on but no
 *    session token is sent.
 *  - GET /api/admin/* passes when a valid, unrevoked, two_factor_verified
 *    session token is included.
 *  - GET /api/admin/* returns 403 + 2FA_REQUIRED when the session is revoked.
 *  - GET /api/admin/* returns 403 + 2FA_REQUIRED when the session's
 *    twoFactorVerified flag is false.
 *  - /api/admin/2fa/login/* paths are exempt from the session requirement.
 *
 * NOTE: The isAdmin middleware is intentionally NOT mocked here so the 2FA
 * enforcement logic is exercised exactly as it runs in production.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── hoisted state ────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  sessions: new Map<
    string,
    { revokedAt: Date | null; twoFactorVerified: boolean }
  >(),
}));

// ─── @workspace/db mock ───────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const siteSettingsTable: any = {
    _t: "site_settings",
    key: "key_col",
    value: "value_col",
  };
  const adminLoginSessionsTable: any = {
    _t: "admin_login_sessions",
    sessionTokenHash: "session_token_hash",
    revokedAt: "revoked_at",
    twoFactorVerified: "two_factor_verified",
  };

  function queryResult(rows: unknown[]): any {
    return {
      where: vi.fn(() => queryResult(rows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(rows).catch(fn),
    };
  }

  /**
   * Extract the value being compared in an eq(col, value) drizzle condition.
   * drizzle-orm stores the literal comparison value at queryChunks[3].
   */
  function extractEqValue(cond: any): string | null {
    const chunks = cond?.queryChunks;
    if (Array.isArray(chunks) && typeof chunks[3] === "string") return chunks[3];
    return null;
  }

  const db: any = {
    select: vi.fn((_spec?: any) => ({
      from: vi.fn((table: any) => {
        if (table._t === "site_settings") {
          return {
            where: vi.fn((cond: any) => {
              const key = extractEqValue(cond);
              const value = key ? state.settings.get(key) ?? null : null;
              return queryResult(value !== null ? [{ value }] : []);
            }),
          };
        }
        if (table._t === "admin_login_sessions") {
          return {
            where: vi.fn((cond: any) => {
              const tokenHash = extractEqValue(cond);
              const session = tokenHash
                ? state.sessions.get(tokenHash) ?? null
                : null;
              return queryResult(session ? [session] : []);
            }),
          };
        }
        return queryResult([]);
      }),
    })),

    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => Promise.resolve()),
        returning: vi.fn(() => Promise.resolve([{ id: "mock-id" }])),
      })),
    })),

    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
      then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
      catch: (fn: any) => Promise.resolve().catch(fn),
    })),
  };

  return { db, siteSettingsTable, adminLoginSessionsTable };
});

// ─── Known session token hashes seeded into state.sessions ────────────────────

const ADMIN_KEY = "gate-test-admin-key";
process.env.ADMIN_API_KEY = ADMIN_KEY;

const VALID_TOKEN_HASH = "valid-session-token-hash-abc123";
const UNVERIFIED_TOKEN_HASH = "unverified-session-token-hash-xyz";
const REVOKED_TOKEN_HASH = "revoked-session-token-hash-revoked";

// ─── App rebuilt before every test with a freshly-imported isAdmin ─────────────
// vi.resetModules() clears the 30 s TTL cache so each test sees a clean state.

let app: Express;

beforeEach(async () => {
  vi.clearAllMocks();
  state.settings.clear();
  state.sessions.clear();

  vi.resetModules();
  const { isAdmin } = await import("../middlewares/isAdmin");

  app = express();
  app.use(express.json());

  // Protected admin route under test
  app.get("/api/admin/products", isAdmin, (_req: any, res: any) => {
    res.json({ ok: true });
  });

  // Simulates the exempt login endpoint (only needs key, no session required)
  app.post("/api/admin/2fa/login/verify", isAdmin, (_req: any, res: any) => {
    res.json({ ok: true });
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("isAdmin 2FA gate", () => {
  describe("when 2FA is disabled", () => {
    beforeEach(() => {
      state.settings.set("admin_2fa_enabled", "false");
    });

    it("passes admin key without any session token", async () => {
      const res = await request(app)
        .get("/api/admin/products")
        .set("x-admin-key", ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe("when 2FA is enabled", () => {
    beforeEach(() => {
      state.settings.set("admin_2fa_enabled", "true");

      state.sessions.set(VALID_TOKEN_HASH, {
        revokedAt: null,
        twoFactorVerified: true,
      });
      state.sessions.set(UNVERIFIED_TOKEN_HASH, {
        revokedAt: null,
        twoFactorVerified: false,
      });
      state.sessions.set(REVOKED_TOKEN_HASH, {
        revokedAt: new Date(),
        twoFactorVerified: true,
      });
    });

    it("returns 403 + 2FA_REQUIRED when no session token is sent", async () => {
      const res = await request(app)
        .get("/api/admin/products")
        .set("x-admin-key", ADMIN_KEY);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("2FA_REQUIRED");
    });

    it("passes when a valid, unrevoked, two_factor_verified session token is sent", async () => {
      const res = await request(app)
        .get("/api/admin/products")
        .set("x-admin-key", ADMIN_KEY)
        .set("x-admin-session-token", VALID_TOKEN_HASH);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("returns 403 + 2FA_REQUIRED when session exists but twoFactorVerified is false", async () => {
      const res = await request(app)
        .get("/api/admin/products")
        .set("x-admin-key", ADMIN_KEY)
        .set("x-admin-session-token", UNVERIFIED_TOKEN_HASH);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("2FA_REQUIRED");
    });

    it("returns 403 + 2FA_REQUIRED when the session has been revoked", async () => {
      const res = await request(app)
        .get("/api/admin/products")
        .set("x-admin-key", ADMIN_KEY)
        .set("x-admin-session-token", REVOKED_TOKEN_HASH);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("2FA_REQUIRED");
    });

    it("returns 403 + 2FA_REQUIRED when an unknown session token is sent", async () => {
      const res = await request(app)
        .get("/api/admin/products")
        .set("x-admin-key", ADMIN_KEY)
        .set("x-admin-session-token", "token-that-does-not-exist");

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("2FA_REQUIRED");
    });

    it("returns 403 when admin key is wrong regardless of session token", async () => {
      const res = await request(app)
        .get("/api/admin/products")
        .set("x-admin-key", "wrong-key")
        .set("x-admin-session-token", VALID_TOKEN_HASH);

      expect(res.status).toBe(403);
    });

    it("2fa/login/* paths bypass the session requirement and only need the admin key", async () => {
      // Even with 2FA enabled, the login endpoint must be reachable without a session
      const res = await request(app)
        .post("/api/admin/2fa/login/verify")
        .set("x-admin-key", ADMIN_KEY)
        .send({ code: "123456" });

      // Should reach the handler (returning 200), not be blocked by the 2FA gate
      expect(res.status).toBe(200);
    });
  });
});
