/**
 * Admin 2FA — Recovery code regeneration end-to-end tests
 *
 * Covers:
 *  - Wrong TOTP → 403, DB left untouched, old recovery code still accepted
 *  - Valid TOTP → old code hashes are absent from DB after regeneration
 *  - Valid TOTP → new set of exactly 10 unused codes stored in DB
 *  - New codes returned by regenerate-codes are accepted by login/recovery
 *  - Old codes are rejected by login/recovery after regeneration
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { generateSync } from "otplib";
import crypto from "crypto";
import admin2faRouter from "../routes/admin2fa";

const ADMIN_KEY = "test-admin-key-2fa-regen-e2e";

// ─── hoisted mutable state ────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  sessions: [] as any[],
  recoveryCodes: [] as { id: string; codeHash: string; used: boolean; usedAt: Date | null }[],
  challenges: new Map<string, { id: string; type: string; codeHash: string; expiresAt: Date; attempts: number; createdAt: Date }>(),
  idCounter: 0,
  failRecoveryCodeInsert: false,
  recoveryTransactionRollbackCount: 0,
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

  function extractEqValue(cond: any): string | null {
    const chunks = cond?.queryChunks;
    if (Array.isArray(chunks) && typeof chunks[3] === "string") return chunks[3];
    return null;
  }

  function queryResult(rows: unknown[]): any {
    return {
      where: vi.fn(() => queryResult(rows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(rows).catch(fn),
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
              if (val && state.challenges.has(val)) return queryResult([state.challenges.get(val)]);
              for (const ch of state.challenges.values()) {
                if (ch.id === val) return queryResult([ch]);
              }
              return queryResult([]);
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
          state.sessions.push({ id, ...vals });
          return { returning: vi.fn(() => Promise.resolve([{ id }])) };
        }
        if (table._t === "admin_recovery_codes") {
          if (state.failRecoveryCodeInsert) {
            throw new Error("Simulated recovery-code insert failure");
          }
          const rows = Array.isArray(vals) ? vals : [vals];
          for (const r of rows) {
            state.recoveryCodes.push({
              id: `rc-${++state.idCounter}`,
              codeHash: r.codeHash,
              used: false,
              usedAt: null,
            });
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
            if (val) {
              state.challenges.delete(val);
              for (const [type, ch] of state.challenges.entries()) {
                if (ch.id === val) { state.challenges.delete(type); break; }
              }
            }
          } else {
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

  db.transaction = vi.fn(async (fn: any) => {
    // Mirror the database transaction contract: mutations made before a
    // rejected callback are not visible after the transaction rolls back.
    const recoveryCodesSnapshot = state.recoveryCodes.map((row) => ({ ...row }));
    const idCounterSnapshot = state.idCounter;
    const tx = {
      ...db,
      rollback: vi.fn(() => {
        state.recoveryTransactionRollbackCount++;
        throw new Error("Transaction rolled back");
      }),
    };

    try {
      return await fn(tx);
    } catch (err) {
      state.recoveryCodes.splice(0, state.recoveryCodes.length, ...recoveryCodesSnapshot);
      state.idCounter = idCounterSnapshot;
      throw err;
    }
  });

  return {
    db,
    siteSettingsTable,
    adminLoginSessionsTable,
    adminRecoveryCodesTable,
    adminOtpChallengesTable,
  };
});

// ─── Resend / SMS mocks ───────────────────────────────────────────────────────

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function (this: any) {
    this.emails = { send: vi.fn().mockResolvedValue({ id: "mock-email-id" }) };
  }),
}));
vi.mock("../lib/sms", () => ({ sendSms: vi.fn().mockResolvedValue(undefined) }));

// ─── isAdmin mock: sha256hex is a real hash so codes work correctly ───────────

vi.mock("../middlewares/isAdmin", () => {
  const crypto = require("crypto");
  return {
    requireAdminKey: (req: any, res: any, next: any) => {
      if (req.headers["x-admin-key"] === ADMIN_KEY) return next();
      return res.status(403).json({ error: "Forbidden" });
    },
    sha256hex: (s: string) => crypto.createHash("sha256").update(s).digest("hex"),
    clearAdmin2faCache: vi.fn(),
  };
});

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  getIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET = "YWYP33KQWTRJA3R3GRBZJH3O3KRMIRPR";

function validTOTP(secret = TEST_SECRET): string {
  return generateSync({ secret, strategy: "totp" });
}

function sha256(s: string): string {
  // Must match the real sha256hex used in the route (crypto.createHash)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("crypto").createHash("sha256").update(s).digest("hex");
}

// ─── app ──────────────────────────────────────────────────────────────────────

let app: Express;

beforeEach(() => {
  vi.clearAllMocks();
  state.settings.clear();
  state.sessions.length = 0;
  state.recoveryCodes.length = 0;
  state.challenges.clear();
  state.idCounter = 0;
  state.failRecoveryCodeInsert = false;
  state.recoveryTransactionRollbackCount = 0;

  // 2FA is enabled with a known secret
  state.settings.set("admin_2fa_enabled", "true");
  state.settings.set("admin_2fa_secret", TEST_SECRET);

  app = express();
  app.use(express.json());
  app.use("/api", admin2faRouter);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/admin/2fa/regenerate-codes — wrong TOTP rejected before any change", () => {
  it("returns 403 when the TOTP code is wrong", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it("leaves the DB unchanged when TOTP is wrong — old codes are still usable", async () => {
    const OLD_PLAIN = "AABBCC1122-DDEEFF3344";
    const oldHash = sha256(OLD_PLAIN.trim().toUpperCase());
    state.recoveryCodes.push({ id: "old-rc-1", codeHash: oldHash, used: false, usedAt: null });

    // Attempt regeneration with wrong TOTP
    await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "000000" });

    // Old code row must still exist
    expect(state.recoveryCodes).toHaveLength(1);
    expect(state.recoveryCodes[0].id).toBe("old-rc-1");
    expect(state.recoveryCodes[0].used).toBe(false);

    // And the old code is still accepted by login/recovery
    const loginRes = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: OLD_PLAIN });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toMatchObject({ sessionId: expect.any(String), tokenHash: expect.any(String) });
  });
});

describe("POST /api/admin/2fa/regenerate-codes — valid TOTP accepted, codes replaced", () => {
  it("returns ok:true and exactly 10 new plain codes in XXXXXXXXXX-XXXXXXXXXX format", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP() });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.codes)).toBe(true);
    expect(res.body.codes).toHaveLength(10);
    for (const c of res.body.codes as string[]) {
      expect(c).toMatch(/^[0-9A-F]{10}-[0-9A-F]{10}$/);
    }
  });

  it("stores exactly 10 new unused code rows in the DB", async () => {
    await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP() });

    expect(state.recoveryCodes).toHaveLength(10);
    expect(state.recoveryCodes.every(r => !r.used)).toBe(true);
  });

  it("removes old code hashes from the DB — old codes are absent after regeneration", async () => {
    const OLD_PLAIN = "AABBCC1122-DDEEFF3344";
    const oldHash = sha256(OLD_PLAIN.trim().toUpperCase());
    state.recoveryCodes.push(
      { id: "old-1", codeHash: oldHash, used: false, usedAt: null },
      { id: "old-2", codeHash: sha256("USED-CODE-HASH"), used: true, usedAt: new Date() },
    );

    await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP() });

    // Old rows gone
    expect(state.recoveryCodes.find(r => r.id === "old-1")).toBeUndefined();
    expect(state.recoveryCodes.find(r => r.id === "old-2")).toBeUndefined();
    // None of the new rows carry the old hash
    expect(state.recoveryCodes.find(r => r.codeHash === oldHash)).toBeUndefined();
  });

  it("new codes returned by the endpoint are accepted by login/recovery", async () => {
    const regenRes = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP() });

    expect(regenRes.status).toBe(200);
    const newCodes: string[] = regenRes.body.codes;

    // Use the first new code to log in via recovery
    const loginRes = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: newCodes[0] });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toMatchObject({
      sessionId: expect.any(String),
      tokenHash: expect.any(String),
    });
    expect(state.sessions[0].twoFactorVerified).toBe(true);
    // The used code is now marked used in DB
    const usedRow = state.recoveryCodes.find(r => r.used);
    expect(usedRow).toBeDefined();
  });

  it("old codes are rejected by login/recovery after regeneration", async () => {
    const OLD_PLAIN = "AABBCC1122-DDEEFF3344";
    const oldHash = sha256(OLD_PLAIN.trim().toUpperCase());
    state.recoveryCodes.push({ id: "old-rc-1", codeHash: oldHash, used: false, usedAt: null });

    // Regenerate with valid TOTP — this clears old codes and inserts 10 new ones
    await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP() });

    // The old plain code must now be rejected
    const loginRes = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: OLD_PLAIN });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.code).toBe("2FA_INVALID");
  });

  it("each new code can only be used once (one-time use)", async () => {
    const regenRes = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP() });

    const newCodes: string[] = regenRes.body.codes;

    // First use succeeds
    const first = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: newCodes[0] });
    expect(first.status).toBe(200);

    // Second use of the same code must be rejected
    const second = await request(app)
      .post("/api/admin/2fa/login/recovery")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: newCodes[0] });
    expect(second.status).toBe(403);
    expect(second.body.code).toBe("2FA_INVALID");
  });

  it("treats a regenerated row with a previously used hash as unused", async () => {
    const REUSED_PLAIN = "ABABABABAB-ABABABABAB";
    const reusedHash = sha256(REUSED_PLAIN);
    state.recoveryCodes.push({
      id: "burned-rc-1",
      codeHash: reusedHash,
      used: true,
      usedAt: new Date(),
    });

    // Force regeneration to produce the same hash as the burned row. The
    // replacement rows must get their own fresh unused state.
    const randomBytesSpy = vi
      .spyOn(crypto, "randomBytes")
      .mockImplementation((size: number) => {
        if (size === 5) {
          return Buffer.from("ababababab", "hex");
        }
        return Buffer.alloc(size, 0);
      });

    try {
      const regenRes = await request(app)
        .post("/api/admin/2fa/regenerate-codes")
        .set("x-admin-key", ADMIN_KEY)
        .send({ code: validTOTP() });

      expect(regenRes.status).toBe(200);
      expect(regenRes.body.codes).toHaveLength(10);
      expect(new Set(regenRes.body.codes)).toEqual(new Set(["ABABABABAB-ABABABABAB"]));

      const replacementRows = state.recoveryCodes.filter(r => r.codeHash === reusedHash);
      expect(replacementRows).toHaveLength(10);
      expect(replacementRows.every(r => !r.used)).toBe(true);
      expect(replacementRows.every(r => r.id !== "burned-rc-1")).toBe(true);
    } finally {
      randomBytesSpy.mockRestore();
    }
  });
});

describe("POST /api/admin/2fa/regenerate-codes — guard rails", () => {
  it("returns 500 and preserves every old code when inserting replacements fails", async () => {
    const oldCodes = [
      { id: "old-unused", codeHash: sha256("OLD-UNUSED"), used: false, usedAt: null },
      { id: "old-used", codeHash: sha256("OLD-USED"), used: true, usedAt: new Date("2026-01-01T00:00:00.000Z") },
    ];
    state.recoveryCodes.push(...oldCodes);
    state.failRecoveryCodeInsert = true;

    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP() });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to regenerate recovery codes/i);
    expect(res.body.error).toMatch(/no recovery codes were changed/i);
    expect(state.recoveryTransactionRollbackCount).toBe(1);
    expect(state.recoveryCodes).toEqual(oldCodes);
  });

  it("returns 400 when 2FA is not enabled", async () => {
    state.settings.set("admin_2fa_enabled", "false");

    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP() });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not enabled/i);
    expect(state.recoveryCodes).toHaveLength(0);
  });

  it("returns 400 when the authenticator code is missing from body", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(state.recoveryCodes).toHaveLength(0);
  });

  it("returns 403 when the admin key header is absent", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/regenerate-codes")
      .send({ code: validTOTP() });

    expect(res.status).toBe(403);
    expect(state.recoveryCodes).toHaveLength(0);
  });
});
