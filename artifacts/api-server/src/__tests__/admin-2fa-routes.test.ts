/**
 * Admin 2FA routes — integration tests
 *
 * Covers:
 *  - POST /admin/2fa/setup/start     (generates pending secret + QR code)
 *  - POST /admin/2fa/setup/verify    (valid TOTP enables 2FA, invalid → 400)
 *  - POST /admin/2fa/login/verify    (valid TOTP → verified session; invalid → 403)
 *  - POST /admin/2fa/login/recovery  (valid unused code → session; used/invalid → 403)
 *  - POST /admin/2fa/disable         (valid TOTP disables 2FA; no code → 400; bad code → 403)
 *  - POST /admin/2fa/regenerate-codes (valid TOTP → 10 new codes, old ones cleared; invalid → 403)
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
  /** recovery code rows: { id, codeHash, used, usedAt } */
  recoveryCodes: [] as { id: string; codeHash: string; used: boolean; usedAt: Date | null }[],
  /** OTP challenges keyed by type ("email" | "sms") */
  challenges: new Map<string, { id: string; type: string; codeHash: string; expiresAt: Date; attempts: number; createdAt: Date }>(),
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
  const adminRecoveryCodesTable: any = {
    _t: "admin_recovery_codes",
    id: "rc_id",
    codeHash: "code_hash",
    used: "used",
    usedAt: "used_at",
  };
  const adminOtpChallengesTable: any = {
    _t: "admin_otp_challenges",
    id: "id",
    type: "type_col",
    codeHash: "code_hash",
    expiresAt: "expires_at",
    attempts: "attempts",
    createdAt: "created_at",
  };

  /** Find a challenge by type or id */
  function findChallenge(val: string | null) {
    if (!val) return undefined;
    if (state.challenges.has(val)) return state.challenges.get(val);
    for (const ch of state.challenges.values()) {
      if (ch.id === val) return ch;
    }
    return undefined;
  }

  /** Delete a challenge by type or id */
  function deleteChallenge(val: string | null) {
    if (!val) return;
    if (state.challenges.has(val)) { state.challenges.delete(val); return; }
    for (const [type, ch] of state.challenges.entries()) {
      if (ch.id === val) { state.challenges.delete(type); return; }
    }
  }

  function queryResult(rows: unknown[]): any {
    return {
      where: vi.fn(() => queryResult(rows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(rows).catch(fn),
    };
  }

  /**
   * Extract the literal comparison value from an eq(col, value) drizzle condition.
   * drizzle-orm places the literal value at queryChunks[3].
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
          return { where: vi.fn(() => queryResult([])) };
        }
        if (table._t === "admin_recovery_codes") {
          return {
            where: vi.fn((cond: any) => {
              // Supports eq(codeHash, hash) — extract by hash; or eq(id, id)
              const val = extractEqValue(cond);
              if (val) {
                const found = state.recoveryCodes.find(r => r.codeHash === val || r.id === val);
                return queryResult(found ? [{ id: found.id, used: found.used }] : []);
              }
              return queryResult(state.recoveryCodes.map(r => ({ id: r.id, codeHash: r.codeHash, used: r.used })));
            }),
          };
        }
        if (table._t === "admin_otp_challenges") {
          return {
            where: vi.fn((cond: any) => {
              const val = extractEqValue(cond);
              const ch = findChallenge(val);
              return queryResult(ch ? [ch] : []);
            }),
          };
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
          for (const r of rows) {
            state.recoveryCodes.push({ id: `rc-${++state.idCounter}`, codeHash: r.codeHash, used: false, usedAt: null });
          }
          return Promise.resolve();
        }
        if (table._t === "admin_otp_challenges") {
          const v = Array.isArray(vals) ? vals[0] : vals;
          const id = `otp-${++state.idCounter}`;
          state.challenges.set(v.type, { id, createdAt: new Date(), ...v });
          return Promise.resolve();
        }
        return {
          onConflictDoUpdate: vi.fn(() => Promise.resolve()),
          returning: vi.fn(() => Promise.resolve([{ id: `row-${++state.idCounter}` }])),
        };
      }),
    })),

    update: vi.fn((table: any) => ({
      set: vi.fn((vals: any) => ({
        where: vi.fn((cond: any) => {
          if (table._t === "admin_recovery_codes") {
            const val = extractEqValue(cond);
            if (val) {
              const idx = state.recoveryCodes.findIndex(r => r.id === val || r.codeHash === val);
              if (idx !== -1) {
                if (vals.used !== undefined) state.recoveryCodes[idx].used = vals.used;
                if (vals.usedAt !== undefined) state.recoveryCodes[idx].usedAt = vals.usedAt;
              }
            }
          }
          if (table._t === "admin_otp_challenges") {
            const val = extractEqValue(cond);
            const ch = findChallenge(val);
            if (ch) Object.assign(ch, vals);
          }
          return Promise.resolve();
        }),
      })),
    })),

    delete: vi.fn((table: any) => {
      const doDelete = (cond?: any) => {
        if (table._t === "site_settings" && cond) {
          const key = extractEqValue(cond);
          if (key) state.settings.delete(key);
        }
        if (table._t === "admin_otp_challenges") {
          if (cond) {
            const val = extractEqValue(cond);
            deleteChallenge(val);
          } else {
            // db.delete(adminOtpChallengesTable) with no .where() — clear all
            state.challenges.clear();
          }
        }
        if (table._t === "admin_recovery_codes" && !cond) {
          state.recoveryCodes.length = 0;
        }
        return Promise.resolve();
      };
      return {
        where: vi.fn((cond: any) => doDelete(cond)),
        then: (resolve: any, reject: any) => doDelete().then(resolve, reject),
        catch: (fn: any) => doDelete().catch(fn),
      };
    }),
  };

  // transaction proxies through to the same mock db instance
  db.transaction = vi.fn((fn: any) => fn(db));

  return {
    db,
    siteSettingsTable,
    adminLoginSessionsTable,
    adminRecoveryCodesTable,
    adminOtpChallengesTable,
  };
});

// ─── Resend and SMS mocks ─────────────────────────────────────────────────────
// vi.hoisted is required because vi.mock factories are hoisted above const declarations.

const { mockResendSendRoutes } = vi.hoisted(() => ({
  mockResendSendRoutes: vi.fn().mockResolvedValue({ id: "mock-email-id" }),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function (this: any) {
    this.emails = { send: mockResendSendRoutes };
  }),
}));

vi.mock("../lib/sms", () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}));

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
  state.challenges.clear();
  state.idCounter = 0;
  mockGetIp.mockReturnValue("127.0.0.1");

  // Make delivery services available by default
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_FROM_NUMBER = "+15551234567";

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

  it("advances setup stage to totp_verified and does NOT enable 2FA when TOTP code is valid", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, next: "email-otp" });
    // Stage advanced
    expect(state.settings.get("admin_2fa_setup_stage")).toBe("totp_verified");
    // 2FA NOT enabled yet — requires email + SMS OTP to follow
    expect(state.settings.get("admin_2fa_enabled")).toBeUndefined();
    // No session issued at this stage
    expect(state.sessions.length).toBe(0);
    // Pending secret still in place — needed by verify-sms-otp
    expect(state.settings.get("admin_2fa_secret_pending")).toBe(TEST_SECRET);
  });

  it("returns 400 and does NOT advance stage when TOTP code is wrong", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
    expect(state.settings.has("admin_2fa_enabled")).toBe(false);
    expect(state.settings.has("admin_2fa_setup_stage")).toBe(false);
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

describe("POST /api/admin/2fa/login/recovery", () => {
  const VALID_CODE = "AAAAA-BBBBB";
  // sha256hex is mocked as (s) => `sha256:${s}`; codes are normalised to uppercase before hashing
  const VALID_HASH = `sha256:${VALID_CODE.toUpperCase()}`;

  beforeEach(() => {
    state.settings.set("admin_2fa_enabled", "true");
    state.settings.set("admin_2fa_secret", TEST_SECRET);
    // Unique IP to avoid sharing the rate-limit bucket with login/verify tests
    mockGetIp.mockReturnValue("10.0.1.2");
  });

  it("issues a verified session when a valid unused recovery code is provided", async () => {
    state.recoveryCodes.push({ id: "rc-seed-1", codeHash: VALID_HASH, used: false, usedAt: null });

    const res = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sessionId: expect.any(String),
      tokenHash: expect.any(String),
    });
    expect(state.sessions.length).toBe(1);
    expect(state.sessions[0].twoFactorVerified).toBe(true);
    // Code must be marked as used
    const stored = state.recoveryCodes.find(r => r.id === "rc-seed-1");
    expect(stored?.used).toBe(true);
  });

  it("returns 403 when the recovery code does not exist", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "WRONG-12345" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("2FA_INVALID");
    expect(state.sessions.length).toBe(0);
  });

  it("returns 403 when the recovery code has already been used", async () => {
    state.recoveryCodes.push({ id: "rc-seed-1", codeHash: VALID_HASH, used: true, usedAt: new Date() });

    const res = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("2FA_INVALID");
    expect(state.sessions.length).toBe(0);
  });

  it("returns 400 when the code body field is missing", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 403 when the admin key header is missing", async () => {
    state.recoveryCodes.push({ id: "rc-seed-1", codeHash: VALID_HASH, used: false, usedAt: null });

    const res = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .send({ code: VALID_CODE });

    expect(res.status).toBe(403);
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

describe("POST /api/admin/2fa/regenerate-codes", () => {
  beforeEach(() => {
    state.settings.set("admin_2fa_enabled", "true");
    state.settings.set("admin_2fa_secret", TEST_SECRET);
    // Pre-seed two existing codes (one used, one not) to confirm they're cleared
    state.recoveryCodes.push(
      { id: "old-1", codeHash: "sha256:OLD-UNUSED", used: false, usedAt: null },
      { id: "old-2", codeHash: "sha256:OLD-USED", used: true, usedAt: new Date() },
    );
    mockGetIp.mockReturnValue("10.0.2.1");
  });

  it("returns 10 new codes and replaces all old ones when TOTP is valid", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.codes)).toBe(true);
    expect(res.body.codes).toHaveLength(10);
    // Each plain code must match the XXXXXXXXXX-XXXXXXXXXX hex format
    for (const c of res.body.codes as string[]) {
      expect(c).toMatch(/^[0-9A-F]{10}-[0-9A-F]{10}$/);
    }
    // State must have exactly 10 new rows — old ones gone
    expect(state.recoveryCodes).toHaveLength(10);
    expect(state.recoveryCodes.find(r => r.id === "old-1")).toBeUndefined();
    expect(state.recoveryCodes.find(r => r.id === "old-2")).toBeUndefined();
    // New rows must all be unused
    expect(state.recoveryCodes.every(r => !r.used)).toBe(true);
  });

  it("returns 403 and leaves old codes untouched when TOTP is wrong", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    expect(res.status).toBe(403);
    expect(state.recoveryCodes).toHaveLength(2); // unchanged
  });

  it("returns 400 when 2FA is not enabled", async () => {
    state.settings.set("admin_2fa_enabled", "false");

    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validCode(TEST_SECRET) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not enabled/i);
  });

  it("returns 400 when authenticator code is missing from body", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 403 when admin key header is missing", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
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
