/**
 * Admin 2FA end-to-end lifecycle test
 *
 * Exercises the full security chain using the REAL admin2fa router and the
 * REAL isAdmin middleware (only @workspace/db is mocked).  No separate seeding
 * of session rows — the session is created by setup/verify and its tokenHash is
 * carried directly into the isAdmin gate check, exactly as in production.
 *
 * Flow under test:
 *  1. POST /admin/2fa/setup/start   — stores pending secret, returns manualKey
 *  2. POST /admin/2fa/setup/verify  — enables 2FA, returns { sessionId, tokenHash }
 *  3. GET  /admin/products          — protected route; passes with tokenHash header
 *  4. GET  /admin/products          — same route; blocked (403 2FA_REQUIRED) without token
 *  5. POST /admin/2fa/login/verify  — fresh TOTP login; returns a new tokenHash
 *  6. GET  /admin/products          — passes with the new login tokenHash
 *  7. POST /admin/2fa/disable       — valid TOTP disables 2FA
 *  8. GET  /admin/products          — passes with key only (2FA off)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { generateSync } from "otplib";

// ─── hoisted mutable state ────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  /** admin_login_sessions keyed by sessionTokenHash */
  sessions: new Map<string, { revokedAt: Date | null; twoFactorVerified: boolean }>(),
  recoveryCodes: [] as any[],
  idCounter: 0,
}));

// ─── @workspace/db mock ───────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const siteSettingsTable: any = {
    _t: "site_settings",
    key: "key_col",
    value: "value_col",
    updatedAt: "updated_at",
  };
  const adminLoginSessionsTable: any = {
    _t: "admin_login_sessions",
    id: "id",
    sessionTokenHash: "session_token_hash",
    twoFactorVerified: "two_factor_verified",
    revokedAt: "revoked_at",
  };
  const adminRecoveryCodesTable: any = { _t: "admin_recovery_codes" };

  /**
   * Extract the literal value being compared in eq(col, value).
   * drizzle-orm stores it at queryChunks[3].
   */
  function extractEqValue(cond: any): string | null {
    const chunks = cond?.queryChunks;
    if (Array.isArray(chunks) && typeof chunks[3] === "string") return chunks[3];
    return null;
  }

  function thenable(value: any): any {
    return {
      then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(value).catch(fn),
    };
  }

  const db: any = {
    select: vi.fn((_spec?: any) => ({
      from: vi.fn((table: any) => {
        if (table._t === "site_settings") {
          return {
            where: vi.fn((cond: any) => {
              const key = extractEqValue(cond);
              const value = key ? state.settings.get(key) ?? null : null;
              return thenable(value !== null ? [{ value }] : []);
            }),
          };
        }
        if (table._t === "admin_login_sessions") {
          return {
            where: vi.fn((cond: any) => {
              const tokenHash = extractEqValue(cond);
              const session = tokenHash ? state.sessions.get(tokenHash) ?? null : null;
              return thenable(session ? [session] : []);
            }),
          };
        }
        return thenable([]);
      }),
    })),

    insert: vi.fn((table: any) => ({
      values: vi.fn((vals: any) => {
        if (table._t === "site_settings") {
          return {
            onConflictDoUpdate: vi.fn((_opts: any) => {
              const rows = Array.isArray(vals) ? vals : [vals];
              for (const row of rows) {
                if (row.key) state.settings.set(row.key, row.value ?? "");
              }
              return Promise.resolve();
            }),
          };
        }
        if (table._t === "admin_login_sessions") {
          const id = `session-${++state.idCounter}`;
          // Store the session so isAdmin can look it up by tokenHash
          state.sessions.set(vals.sessionTokenHash, {
            revokedAt: vals.revokedAt ?? null,
            twoFactorVerified: vals.twoFactorVerified ?? false,
          });
          return {
            returning: vi.fn((_spec?: any) => Promise.resolve([{ id }])),
          };
        }
        if (table._t === "admin_recovery_codes") {
          const rows = Array.isArray(vals) ? vals : [vals];
          state.recoveryCodes.push(...rows);
          return Promise.resolve();
        }
        return {
          onConflictDoUpdate: vi.fn(() => Promise.resolve()),
          returning: vi.fn(() => Promise.resolve([{ id: `row-${++state.idCounter}` }])),
        };
      }),
    })),

    delete: vi.fn((table: any) => ({
      where: vi.fn((cond: any) => {
        if (table._t === "site_settings") {
          const key = extractEqValue(cond);
          if (key) state.settings.delete(key);
        }
        return Promise.resolve();
      }),
      // db.delete(adminRecoveryCodesTable) awaited directly (no .where)
      ...thenable(undefined),
    })),
  };

  return { db, siteSettingsTable, adminLoginSessionsTable, adminRecoveryCodesTable };
});

// ─── mock auditLog (fire-and-forget — do not let it reach real DB) ────────────

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  getIp: (_req: any) => "127.0.0.1",
}));

vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Lifecycle test ───────────────────────────────────────────────────────────

const ADMIN_KEY = "lifecycle-test-admin-key";
process.env.ADMIN_API_KEY = ADMIN_KEY;

let app: Express;

beforeEach(async () => {
  vi.clearAllMocks();
  state.settings.clear();
  state.sessions.clear();
  state.recoveryCodes.length = 0;
  state.idCounter = 0;

  // Fresh module instances clear the 30 s TTL caches inside isAdmin.ts
  vi.resetModules();

  const [{ default: admin2faRouter }, { isAdmin }] = await Promise.all([
    import("../routes/admin2fa"),
    import("../middlewares/isAdmin"),
  ]);

  app = express();
  app.use(express.json());
  app.use("/api", admin2faRouter);
  // A representative protected admin route (mirrors any real admin endpoint)
  app.get("/api/admin/products", isAdmin, (_req: any, res: any) => {
    res.json({ ok: true });
  });
});

describe("Admin 2FA full lifecycle", () => {
  it("enable → session issued → protected route gated → fresh login → disable → gate lifted", async () => {
    // ── Step 1: setup/start ──────────────────────────────────────────────────
    const startRes = await request(app)
      .post("/api/admin/2fa/setup/start")
      .set("x-admin-key", ADMIN_KEY)
      .send({ accessKey: ADMIN_KEY });

    expect(startRes.status).toBe(200);
    const { manualKey: secret } = startRes.body as { manualKey: string };
    expect(secret).toBeTruthy();
    expect(state.settings.get("admin_2fa_secret_pending")).toBe(secret);

    // ── Step 2: setup/verify — 2FA is now enabled; a verified session is issued
    const setupCode = generateSync({ secret, strategy: "totp" });
    const verifyRes = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: setupCode });

    expect(verifyRes.status).toBe(200);
    const { tokenHash: setupToken } = verifyRes.body as {
      ok: boolean;
      sessionId: string;
      tokenHash: string;
    };
    expect(setupToken).toBeTruthy();
    expect(state.settings.get("admin_2fa_enabled")).toBe("true");
    expect(state.settings.get("admin_2fa_secret")).toBe(secret);

    // ── Step 3: protected route passes with the issued session token ──────────
    const withToken = await request(app)
      .get("/api/admin/products")
      .set("x-admin-key", ADMIN_KEY)
      .set("x-admin-session-token", setupToken);

    expect(withToken.status).toBe(200);

    // ── Step 4: same route blocked when session token is omitted ─────────────
    const noToken = await request(app)
      .get("/api/admin/products")
      .set("x-admin-key", ADMIN_KEY);

    expect(noToken.status).toBe(403);
    expect(noToken.body.code).toBe("2FA_REQUIRED");

    // ── Step 5: login/verify — replays the login flow, issues a new session ──
    const loginCode = generateSync({ secret, strategy: "totp" });
    const loginRes = await request(app)
      .post("/api/admin/2fa/login/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: loginCode });

    expect(loginRes.status).toBe(200);
    const { tokenHash: loginToken } = loginRes.body as {
      sessionId: string;
      tokenHash: string;
    };
    expect(loginToken).toBeTruthy();
    expect(loginToken).not.toBe(setupToken); // distinct session per login

    // ── Step 6: protected route passes with the new login session token ───────
    const withLoginToken = await request(app)
      .get("/api/admin/products")
      .set("x-admin-key", ADMIN_KEY)
      .set("x-admin-session-token", loginToken);

    expect(withLoginToken.status).toBe(200);

    // ── Step 7: disable — wrong TOTP (even with valid session) is rejected ─────
    const badDisable = await request(app)
      .post("/api/admin/2fa/disable")
      .set("x-admin-key", ADMIN_KEY)
      .set("x-admin-session-token", loginToken)
      .send({ code: "000000" });

    expect(badDisable.status).toBe(403);
    expect(state.settings.get("admin_2fa_enabled")).toBe("true"); // still on

    // ── Step 8: disable with valid TOTP + valid session ───────────────────────
    const disableCode = generateSync({ secret, strategy: "totp" });
    const disableRes = await request(app)
      .post("/api/admin/2fa/disable")
      .set("x-admin-key", ADMIN_KEY)
      .set("x-admin-session-token", loginToken)
      .send({ code: disableCode });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body).toEqual({ ok: true });
    expect(state.settings.get("admin_2fa_enabled")).toBe("false");

    // ── Step 9: 2FA is off — protected route passes with key only ─────────────
    const afterDisable = await request(app)
      .get("/api/admin/products")
      .set("x-admin-key", ADMIN_KEY);

    expect(afterDisable.status).toBe(200);
  });

  it("replayed expired TOTP code (000000) cannot authenticate — always rejected with 403", async () => {
    // Seed a known secret so the TOTP check is live
    state.settings.set("admin_2fa_enabled", "true");
    state.settings.set("admin_2fa_secret", "YWYP33KQWTRJA3R3GRBZJH3O3KRMIRPR");

    const res = await request(app)
      .post("/api/admin/2fa/login/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("2FA_INVALID");
    // No session must have been created
    expect(state.sessions.size).toBe(0);
  });
});
