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
import cryptoNode from "crypto";

/** Compute SHA-256 hex (same algorithm as the real sha256hex in isAdmin.ts) */
function realSha256(s: string): string {
  return cryptoNode.createHash("sha256").update(s).digest("hex");
}

// ─── hoisted mutable state ────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  /** admin_login_sessions keyed by sessionTokenHash */
  sessions: new Map<string, { revokedAt: Date | null; twoFactorVerified: boolean }>(),
  recoveryCodes: [] as any[],
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
        if (table._t === "admin_otp_challenges") {
          return {
            where: vi.fn((cond: any) => {
              const val = extractEqValue(cond);
              let ch: any;
              if (val) {
                ch = state.challenges.get(val);
                if (!ch) {
                  for (const c of state.challenges.values()) {
                    if (c.id === val) { ch = c; break; }
                  }
                }
              }
              return thenable(ch ? [ch] : []);
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
          if (table._t === "admin_otp_challenges") {
            const val = extractEqValue(cond);
            let ch: any;
            if (val) {
              ch = state.challenges.get(val);
              if (!ch) {
                for (const c of state.challenges.values()) {
                  if (c.id === val) { ch = c; break; }
                }
              }
              if (ch) Object.assign(ch, vals);
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
              if (state.challenges.has(val)) {
                state.challenges.delete(val);
              } else {
                for (const [type, ch] of state.challenges.entries()) {
                  if (ch.id === val) { state.challenges.delete(type); break; }
                }
              }
            }
          } else {
            // db.delete(adminOtpChallengesTable) with no .where() — clear all
            state.challenges.clear();
          }
        }
        return Promise.resolve();
      };
      return {
        where: vi.fn((cond: any) => doDelete(cond)),
        ...thenable(doDelete()),
      };
    }),
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

  return { db, siteSettingsTable, adminLoginSessionsTable, adminRecoveryCodesTable, adminOtpChallengesTable };
});

// ─── mock auditLog (fire-and-forget — do not let it reach real DB) ────────────

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  getIp: (_req: any) => "127.0.0.1",
}));

vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Resend and SMS mocks (route imports these; must be mocked before import) ─

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "mock-id" }) },
  })),
}));

vi.mock("../lib/sms", () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
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
  state.challenges.clear();
  state.idCounter = 0;

  // Ensure delivery env vars are present (routes check these)
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_FROM_NUMBER = "+15551234567";

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

// Known test OTPs for the lifecycle test (pre-computed real SHA-256 in the mock).
const EMAIL_OTP = "480921";
const SMS_OTP = "736054";

describe("Admin 2FA full lifecycle", () => {
  it("full 5-step enable → protected route gated → login → disable → gate lifted", async () => {
    // ── Step 1: setup/start ──────────────────────────────────────────────────
    const startRes = await request(app)
      .post("/api/admin/2fa/setup/start")
      .set("x-admin-key", ADMIN_KEY)
      .send({ accessKey: ADMIN_KEY });

    expect(startRes.status).toBe(200);
    const { manualKey: secret } = startRes.body as { manualKey: string };
    expect(secret).toBeTruthy();
    expect(state.settings.get("admin_2fa_secret_pending")).toBe(secret);

    // ── Step 2: setup/verify (TOTP) — advances stage, does NOT enable 2FA ────
    const setupCode = generateSync({ secret, strategy: "totp" });
    const verifyRes = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: setupCode });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toMatchObject({ ok: true, next: "email-otp" });
    expect(state.settings.get("admin_2fa_setup_stage")).toBe("totp_verified");
    expect(state.settings.get("admin_2fa_enabled")).toBeUndefined(); // NOT yet
    expect(state.sessions.size).toBe(0); // no session yet

    // ── Step 3: verify-email-otp (pre-seed challenge with known hash) ─────────
    // The route uses the real sha256hex so we compute the hash the same way.
    state.challenges.set("email", {
      id: "email-ch-lifecycle",
      type: "email",
      codeHash: realSha256(EMAIL_OTP),
      expiresAt: new Date(Date.now() + 300_000),
      attempts: 0,
      createdAt: new Date(Date.now() - 120_000),
    });

    const emailRes = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: EMAIL_OTP });

    expect(emailRes.status).toBe(200);
    expect(emailRes.body).toMatchObject({ ok: true, next: "sms-otp" });
    expect(state.settings.get("admin_2fa_setup_stage")).toBe("email_verified");
    expect(state.challenges.has("email")).toBe(false); // challenge consumed
    expect(state.settings.get("admin_2fa_enabled")).toBeUndefined(); // still not yet

    // ── Step 4: verify-sms-otp — enables 2FA, issues session ─────────────────
    state.challenges.set("sms", {
      id: "sms-ch-lifecycle",
      type: "sms",
      codeHash: realSha256(SMS_OTP),
      expiresAt: new Date(Date.now() + 300_000),
      attempts: 0,
      createdAt: new Date(Date.now() - 120_000),
    });

    const smsRes = await request(app)
      .post("/api/admin/2fa/setup/verify-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: SMS_OTP });

    expect(smsRes.status).toBe(200);
    const { tokenHash: setupToken } = smsRes.body as {
      ok: boolean;
      sessionId: string;
      tokenHash: string;
    };
    expect(setupToken).toBeTruthy();
    expect(state.settings.get("admin_2fa_enabled")).toBe("true"); // NOW enabled
    expect(state.settings.get("admin_2fa_secret")).toBe(secret);
    expect(state.settings.has("admin_2fa_setup_stage")).toBe(false); // cleaned up
    expect(state.settings.has("admin_2fa_secret_pending")).toBe(false);
    expect(state.challenges.has("sms")).toBe(false); // challenge consumed

    // ── Step 5: protected route passes with the issued session token ──────────
    const withToken = await request(app)
      .get("/api/admin/products")
      .set("x-admin-key", ADMIN_KEY)
      .set("x-admin-session-token", setupToken);

    expect(withToken.status).toBe(200);

    // ── Step 6: same route blocked when session token is omitted ─────────────
    const noToken = await request(app)
      .get("/api/admin/products")
      .set("x-admin-key", ADMIN_KEY);

    expect(noToken.status).toBe(403);
    expect(noToken.body.code).toBe("2FA_REQUIRED");

    // ── Step 7: login/verify — replays the login flow, issues a new session ──
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

    // ── Step 8: protected route passes with the new login session token ───────
    const withLoginToken = await request(app)
      .get("/api/admin/products")
      .set("x-admin-key", ADMIN_KEY)
      .set("x-admin-session-token", loginToken);

    expect(withLoginToken.status).toBe(200);

    // ── Step 9: disable — wrong TOTP is rejected ──────────────────────────────
    const badDisable = await request(app)
      .post("/api/admin/2fa/disable")
      .set("x-admin-key", ADMIN_KEY)
      .set("x-admin-session-token", loginToken)
      .send({ code: "000000" });

    expect(badDisable.status).toBe(403);
    expect(state.settings.get("admin_2fa_enabled")).toBe("true"); // still on

    // ── Step 10: disable with valid TOTP + valid session ──────────────────────
    const disableCode = generateSync({ secret, strategy: "totp" });
    const disableRes = await request(app)
      .post("/api/admin/2fa/disable")
      .set("x-admin-key", ADMIN_KEY)
      .set("x-admin-session-token", loginToken)
      .send({ code: disableCode });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body).toEqual({ ok: true });
    expect(state.settings.get("admin_2fa_enabled")).toBe("false");

    // ── Step 11: 2FA is off — protected route passes with key only ────────────
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
