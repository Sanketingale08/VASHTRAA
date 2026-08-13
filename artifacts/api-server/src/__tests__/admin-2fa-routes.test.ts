/**
 * Admin 2FA routes — integration tests
 *
 * Covers:
 *  - POST /admin/2fa/setup/start  (generates pending secret + QR code)
 *  - POST /admin/2fa/setup/verify (valid TOTP enables 2FA, invalid → 400)
 *  - POST /admin/2fa/login/verify (valid TOTP → verified session; invalid → 403)
 *  - POST /admin/2fa/login/recovery (retired → 410 RECOVERY_CODES_RETIRED)
 *  - POST /admin/2fa/disable       (valid TOTP disables 2FA; no code → 400; bad code → 403)
 *  - Rate limiter on /admin/2fa/login/verify kicks in after 5 attempts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { generateSync } from "otplib";
import admin2faRouter from "../routes/admin2fa";

const ADMIN_KEY = "test-admin-key-2fa-routes";

// ─── hoisted mutable state ────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  /** site_settings rows keyed by settings key */
  settings: new Map<string, string>(),
  /** inserted admin_login_sessions rows */
  sessions: [] as any[],
  /** inserted admin_recovery_codes rows */
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

  function queryResult(rows: unknown[]): any {
    return {
      where: vi.fn(() => queryResult(rows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(rows).catch(fn),
    };
  }

  /**
   * Extract the settings key from an eq(siteSettingsTable.key, <value>) drizzle condition.
   * drizzle-orm places the literal comparison value at queryChunks[3].
   */
  function extractSettingsKey(cond: any): string | null {
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
              const key = extractSettingsKey(cond);
              const value = key ? state.settings.get(key) ?? null : null;
              return queryResult(value !== null ? [{ value }] : []);
            }),
          };
        }
        if (table._t === "admin_login_sessions") {
          return { where: vi.fn(() => queryResult([])) };
        }
        return queryResult([]);
      }),
    })),

    insert: vi.fn((table: any) => ({
      values: vi.fn((vals: any) => {
        if (table._t === "site_settings") {
          return {
            onConflictDoUpdate: vi.fn((_opts: any) => {
              const v = Array.isArray(vals) ? vals : [vals];
              for (const row of v) {
                if (row.key) state.settings.set(row.key, row.value ?? "");
              }
              return Promise.resolve();
            }),
          };
        }
        if (table._t === "admin_login_sessions") {
          const id = `session-${++state.idCounter}`;
          state.sessions.push({ id, ...vals });
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
          const key = extractSettingsKey(cond);
          if (key) state.settings.delete(key);
        }
        return Promise.resolve();
      }),
      // db.delete(adminRecoveryCodesTable) awaited directly (no .where)
      then: (resolve: any, reject: any) => {
        if (table._t === "admin_recovery_codes") state.recoveryCodes.length = 0;
        return Promise.resolve().then(resolve, reject);
      },
      catch: (fn: any) => Promise.resolve().catch(fn),
    })),
  };

  return {
    db,
    siteSettingsTable,
    adminLoginSessionsTable,
    adminRecoveryCodesTable,
  };
});

// ─── mock requireAdminKey ──────────────────────────────────────────────────────

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (req: any, res: any, next: any) => {
    if (req.headers["x-admin-key"] === ADMIN_KEY) return next();
    return res.status(403).json({ error: "Forbidden" });
  },
  sha256hex: (s: string) => `sha256:${s}`,
  clearAdmin2faCache: vi.fn(),
}));

// ─── mock auditLog & logger ────────────────────────────────────────────────────

const mockGetIp = vi.fn(() => "127.0.0.1");
vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  getIp: (_req: any) => mockGetIp(),
}));

vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── build express app ────────────────────────────────────────────────────────
// The router (and its rate-limiter) is the same module-level singleton for all
// tests in this file. Different IPs isolate the rate-limit counters.

let app: Express;

beforeEach(() => {
  vi.clearAllMocks();
  state.settings.clear();
  state.sessions.length = 0;
  state.recoveryCodes.length = 0;
  state.idCounter = 0;
  mockGetIp.mockReturnValue("127.0.0.1");

  app = express();
  app.use(express.json());
  app.use("/api", admin2faRouter);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A valid 32-character base32 TOTP secret for testing (verified with otplib generateSync) */
const TEST_SECRET = "YWYP33KQWTRJA3R3GRBZJH3O3KRMIRPR";

/** Generate a valid TOTP code from a secret at the current moment */
function validCode(secret = TEST_SECRET): string {
  return generateSync({ secret, strategy: "totp" });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/admin/2fa/setup/start", () => {
  it("returns QR code and manual key when access key is provided", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/start")
      .set("x-admin-key", ADMIN_KEY)
      .send({ accessKey: ADMIN_KEY });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      qrDataUrl: expect.stringContaining("data:image/png"),
      manualKey: expect.any(String),
      otpauth: expect.stringContaining("otpauth://totp/"),
    });
    expect(state.settings.has("admin_2fa_secret_pending")).toBe(true);
  });

  it("returns 400 when access key is missing from body", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/start")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/access key/i);
  });

  it("returns 403 when admin key header is missing", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/start")
      .send({ accessKey: ADMIN_KEY });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/2fa/setup/verify", () => {
  beforeEach(() => {
    state.settings.set("admin_2fa_secret_pending", TEST_SECRET);
  });

  it("enables 2FA and returns a verified session when TOTP code is valid", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      sessionId: expect.any(String),
      tokenHash: expect.any(String),
    });
    expect(state.settings.get("admin_2fa_enabled")).toBe("true");
    expect(state.settings.get("admin_2fa_secret")).toBe(TEST_SECRET);
    expect(state.settings.has("admin_2fa_secret_pending")).toBe(false);
    expect(state.sessions.length).toBe(1);
    expect(state.sessions[0].twoFactorVerified).toBe(true);
    expect(state.recoveryCodes.length).toBe(10);
  });

  it("returns 400 and does NOT enable 2FA when TOTP code is wrong", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
    expect(state.settings.has("admin_2fa_enabled")).toBe(false);
  });

  it("returns 400 when no pending setup is in progress", async () => {
    state.settings.delete("admin_2fa_secret_pending");

    const res = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/setup/i);
  });

  it("returns 400 when code is missing from body", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/2fa/login/verify", () => {
  beforeEach(() => {
    state.settings.set("admin_2fa_enabled", "true");
    state.settings.set("admin_2fa_secret", TEST_SECRET);
    // Use a unique IP so these tests don't drain other rate-limit buckets
    mockGetIp.mockReturnValue("10.0.0.1");
  });

  it("returns a verified session when TOTP code is valid", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/login/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sessionId: expect.any(String),
      tokenHash: expect.any(String),
    });
    expect(state.sessions[0].twoFactorVerified).toBe(true);
  });

  it("returns 403 + 2FA_INVALID when TOTP code is wrong", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/login/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("2FA_INVALID");
    expect(state.sessions.length).toBe(0);
  });

  it("returns 400 when code is missing", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/login/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 403 when admin key is missing", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/login/verify")
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/2fa/login/recovery (retired)", () => {
  it("returns 410 RECOVERY_CODES_RETIRED — the recovery-code flow has been retired", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "AAAAA-BBBBB" });

    expect(res.status).toBe(410);
    expect(res.body.code).toBe("RECOVERY_CODES_RETIRED");
    expect(state.sessions.length).toBe(0);
  });
});

describe("POST /api/admin/2fa/disable", () => {
  beforeEach(() => {
    state.settings.set("admin_2fa_enabled", "true");
    state.settings.set("admin_2fa_secret", TEST_SECRET);
    state.settings.set("admin_2fa_enabled_at", new Date().toISOString());
  });

  it("disables 2FA when a valid TOTP code is provided", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/disable")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(state.settings.get("admin_2fa_enabled")).toBe("false");
  });

  it("returns 403 when TOTP code is wrong", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/disable")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    expect(res.status).toBe(403);
    expect(state.settings.get("admin_2fa_enabled")).toBe("true");
  });

  it("returns 400 when no code is provided — bare admin key alone is insufficient", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/disable")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/code/i);
  });

  it("returns 403 when admin key is missing", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/disable")
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(403);
  });
});

describe("Rate limiter on POST /api/admin/2fa/login/verify", () => {
  // Use a dedicated IP address for the rate-limit test so the 5 attempts on
  // other IPs (used by the login/verify describe above) don't bleed into this
  // window, and vice-versa.
  const RATE_LIMIT_IP = "99.99.99.99";

  beforeEach(() => {
    state.settings.set("admin_2fa_enabled", "true");
    state.settings.set("admin_2fa_secret", TEST_SECRET);
    mockGetIp.mockReturnValue(RATE_LIMIT_IP);
  });

  it("blocks the 6th request after 5 attempts within the 15-minute window", async () => {
    // Send 5 bad-code attempts (each one → 403 2FA_INVALID, not 429 yet)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/admin/2fa/login/verify")
        .set("x-admin-key", ADMIN_KEY)
        .send({ code: "000000" });
      expect(res.status).toBe(403);
    }

    // 6th attempt must be rate-limited
    const blocked = await request(app)
      .post("/api/admin/2fa/login/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});
