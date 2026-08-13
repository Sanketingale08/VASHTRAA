/**
 * Admin 2FA setup flow gate tests
 *
 * Confirms that every shortcut through the 5-step setup is blocked:
 *  1. verify-email-otp or verify-sms-otp without the right preceding stage → 400 WRONG_STAGE
 *  2. verify-email-otp or verify-sms-otp without a challenge issued       → 400 NO_CHALLENGE
 *  3. Replaying an already-consumed email OTP                              → 400 NO_CHALLENGE (deleted on success)
 *  4. Expired OTP                                                          → 400 OTP_EXPIRED
 *  5. Sixth attempt after 5 failures                                       → 400 TOO_MANY_ATTEMPTS, challenge invalidated
 *  6. Resend within 60 seconds                                             → 429 RESEND_COOLDOWN with secondsRemaining
 *  7. admin_2fa_enabled stays false after TOTP-only verify
 *  8. setup/start wipes any stale challenges from a previous abandoned flow
 *  9. Missing admin_email → send-email-otp returns 400 EMAIL_NOT_CONFIGURED
 * 10. Missing admin_mobile → send-sms-otp returns 400 MOBILE_NOT_CONFIGURED
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { generateSync } from "otplib";
import admin2faRouter from "../routes/admin2fa";

const ADMIN_KEY = "gate-test-admin-key";
process.env.ADMIN_API_KEY = ADMIN_KEY;

// ─── hoisted mutable state ────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  sessions: [] as any[],
  recoveryCodes: [] as any[],
  /** OTP challenges keyed by type ("email" | "sms") */
  challenges: new Map<string, {
    id: string;
    type: string;
    codeHash: string;
    expiresAt: Date;
    attempts: number;
    createdAt: Date;
  }>(),
  idCounter: 0,
}));

// ─── @workspace/db mock ───────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const siteSettingsTable: any = { _t: "site_settings", key: "key_col", value: "value_col", updatedAt: "updated_at" };
  const adminLoginSessionsTable: any = { _t: "admin_login_sessions", id: "id", sessionTokenHash: "session_token_hash", twoFactorVerified: "two_factor_verified" };
  const adminRecoveryCodesTable: any = { _t: "admin_recovery_codes", id: "rc_id", codeHash: "code_hash", used: "used", usedAt: "used_at" };
  const adminOtpChallengesTable: any = { _t: "admin_otp_challenges", id: "id", type: "type_col", codeHash: "code_hash", expiresAt: "expires_at", attempts: "attempts", createdAt: "created_at" };

  /** Extract literal value from eq(col, value) — lives at queryChunks[3] */
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

  /** Find a challenge by type key OR by id value */
  function findChallenge(val: string | null) {
    if (!val) return undefined;
    if (state.challenges.has(val)) return state.challenges.get(val);
    for (const ch of state.challenges.values()) {
      if (ch.id === val) return ch;
    }
    return undefined;
  }

  /** Delete a challenge by type key OR by id value */
  function deleteChallenge(val: string | null) {
    if (!val) return;
    if (state.challenges.has(val)) { state.challenges.delete(val); return; }
    for (const [type, ch] of state.challenges.entries()) {
      if (ch.id === val) { state.challenges.delete(type); return; }
    }
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
        if (table._t === "admin_otp_challenges") {
          return {
            where: vi.fn((cond: any) => {
              const val = extractEqValue(cond);
              const ch = findChallenge(val);
              return queryResult(ch ? [ch] : []);
            }),
          };
        }
        if (table._t === "admin_login_sessions") {
          return { where: vi.fn(() => queryResult([])) };
        }
        if (table._t === "admin_recovery_codes") {
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
              const rows = Array.isArray(vals) ? vals : [vals];
              for (const row of rows) {
                if (row.key) state.settings.set(row.key, row.value ?? "");
              }
              return Promise.resolve();
            }),
          };
        }
        if (table._t === "admin_otp_challenges") {
          const v = Array.isArray(vals) ? vals[0] : vals;
          const id = `otp-${++state.idCounter}`;
          state.challenges.set(v.type, { id, createdAt: new Date(), ...v });
          return Promise.resolve();
        }
        if (table._t === "admin_login_sessions") {
          const id = `session-${++state.idCounter}`;
          state.sessions.push({ id, ...vals });
          return { returning: vi.fn(() => Promise.resolve([{ id }])) };
        }
        if (table._t === "admin_recovery_codes") {
          const rows = Array.isArray(vals) ? vals : [vals];
          for (const r of rows) {
            state.recoveryCodes.push({ id: `rc-${++state.idCounter}`, codeHash: r.codeHash, used: false, usedAt: null });
          }
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

  db.transaction = vi.fn((fn: any) => fn(db));

  return { db, siteSettingsTable, adminLoginSessionsTable, adminRecoveryCodesTable, adminOtpChallengesTable };
});

// ─── isAdmin / sha256hex mocks ────────────────────────────────────────────────
// sha256hex is mocked as identity-prefix so OTP values are trivially recoverable
// in tests: sha256hex("123456") === "sha256:123456"

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (req: any, res: any, next: any) => {
    if (req.headers["x-admin-key"] === ADMIN_KEY) return next();
    return res.status(403).json({ error: "Forbidden" });
  },
  sha256hex: (s: string) => `sha256:${s}`,
  clearAdmin2faCache: vi.fn(),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  getIp: (_req: any) => "127.0.0.1",
}));

vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Resend and SMS mocks ─────────────────────────────────────────────────────
// vi.hoisted is required because vi.mock factories are hoisted above const declarations.

const { mockResendSend, mockSendSms } = vi.hoisted(() => ({
  mockResendSend: vi.fn().mockResolvedValue({ id: "mock-email-id" }),
  mockSendSms: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function (this: any) {
    this.emails = { send: mockResendSend };
  }),
}));

vi.mock("../lib/sms", () => ({
  sendSms: (...args: any[]) => mockSendSms(...args),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_SECRET = "YWYP33KQWTRJA3R3GRBZJH3O3KRMIRPR";

function validTOTP(secret = TEST_SECRET): string {
  return generateSync({ secret, strategy: "totp" });
}

/** Build a future date N seconds from now */
function futureDate(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

/** Build a past date N seconds ago */
function pastDate(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

/** Seed an email challenge with the given props */
function seedEmailChallenge(overrides: Partial<{
  id: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}> = {}) {
  state.challenges.set("email", {
    id: "email-ch-1",
    type: "email",
    codeHash: "sha256:correct-otp",
    expiresAt: futureDate(300),
    attempts: 0,
    createdAt: pastDate(120), // 2 min ago — past cooldown by default
    ...overrides,
  });
}

/** Seed an SMS challenge with the given props */
function seedSmsChallenge(overrides: Partial<{
  id: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}> = {}) {
  state.challenges.set("sms", {
    id: "sms-ch-1",
    type: "sms",
    codeHash: "sha256:correct-sms-otp",
    expiresAt: futureDate(300),
    attempts: 0,
    createdAt: pastDate(120),
    ...overrides,
  });
}

// ─── Test setup ──────────────────────────────────────────────────────────────

let app: Express;

beforeEach(() => {
  vi.clearAllMocks();
  state.settings.clear();
  state.sessions.length = 0;
  state.recoveryCodes.length = 0;
  state.challenges.clear();
  state.idCounter = 0;

  // Make delivery services available by default; individual tests can delete these.
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_FROM_NUMBER = "+15551234567";

  mockResendSend.mockResolvedValue({ id: "mock-email-id" });
  mockSendSms.mockResolvedValue(undefined);

  app = express();
  app.use(express.json());
  app.use("/api", admin2faRouter);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Stage gate on verify endpoints — wrong stage → WRONG_STAGE
// ─────────────────────────────────────────────────────────────────────────────

describe("verify-email-otp stage gate", () => {
  it("returns 400 WRONG_STAGE when no setup stage is set (TOTP not verified)", async () => {
    // Simulates calling verify-email-otp without going through setup/verify first
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WRONG_STAGE");
  });

  it("returns 400 WRONG_STAGE when stage is email_verified (email OTP already done)", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    seedEmailChallenge(); // challenge exists but stage is past

    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "correct-otp" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WRONG_STAGE");
    expect(state.settings.get("admin_2fa_setup_stage")).toBe("email_verified"); // unchanged
  });
});

describe("verify-sms-otp stage gate", () => {
  it("returns 400 WRONG_STAGE when no setup stage is set (email OTP not verified)", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "654321" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WRONG_STAGE");
  });

  it("returns 400 WRONG_STAGE when stage is totp_verified (email OTP not yet done)", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    state.settings.set("admin_2fa_secret_pending", TEST_SECRET);
    seedSmsChallenge(); // challenge exists but stage is wrong

    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "correct-sms-otp" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WRONG_STAGE");
    expect(state.settings.get("admin_2fa_enabled")).toBeUndefined(); // 2FA not enabled
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. NO_CHALLENGE when no challenge has been issued
// ─────────────────────────────────────────────────────────────────────────────

describe("verify-email-otp gate: NO_CHALLENGE", () => {
  beforeEach(() => {
    // Stage is correct — we are testing the missing challenge, not the stage
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
  });

  it("returns 400 NO_CHALLENGE when there is no email challenge in the database", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_CHALLENGE");
    expect(state.settings.get("admin_2fa_setup_stage")).toBe("totp_verified"); // unchanged
  });
});

describe("verify-sms-otp gate: NO_CHALLENGE", () => {
  beforeEach(() => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_2fa_secret_pending", TEST_SECRET);
  });

  it("returns 400 NO_CHALLENGE when there is no SMS challenge in the database", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "654321" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_CHALLENGE");
    expect(state.settings.get("admin_2fa_enabled")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. OTP replay prevention: challenge deleted on first successful verify
// ─────────────────────────────────────────────────────────────────────────────

describe("OTP replay prevention: challenge is deleted on first successful verify", () => {
  it("returns 200 on first verify-email-otp then 400 WRONG_STAGE or NO_CHALLENGE on replay", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    seedEmailChallenge({ codeHash: "sha256:correct-otp" });

    // First call — correct OTP, should succeed (stage advances to email_verified)
    const first = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "correct-otp" }); // sha256hex("correct-otp") = "sha256:correct-otp" ✓

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(state.settings.get("admin_2fa_setup_stage")).toBe("email_verified");
    expect(state.challenges.has("email")).toBe(false); // challenge consumed

    // Replay — challenge gone, and stage is now "email_verified" not "totp_verified"
    const replay = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "correct-otp" });

    expect(replay.status).toBe(400);
    // Stage is now "email_verified", so the stage gate fires first
    expect(["NO_CHALLENGE", "WRONG_STAGE"]).toContain(replay.body.code);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Expired OTP → 400 OTP_EXPIRED
// ─────────────────────────────────────────────────────────────────────────────

describe("OTP expiry gate: OTP_EXPIRED when past the 5-minute window", () => {
  it("returns 400 OTP_EXPIRED for an email OTP whose expiresAt is in the past", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    seedEmailChallenge({ expiresAt: pastDate(1) }); // expired 1 second ago

    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "correct-otp" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_EXPIRED");
    // Challenge must be removed after expiry detection
    expect(state.challenges.has("email")).toBe(false);
  });

  it("returns 400 OTP_EXPIRED for an SMS OTP whose expiresAt is in the past", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_2fa_secret_pending", TEST_SECRET);
    seedSmsChallenge({ expiresAt: pastDate(30) }); // expired 30 seconds ago

    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "correct-sms-otp" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OTP_EXPIRED");
    expect(state.challenges.has("sms")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Sixth attempt after 5 failures → 400 TOO_MANY_ATTEMPTS, challenge gone
// ─────────────────────────────────────────────────────────────────────────────

describe("Attempt limit gate: TOO_MANY_ATTEMPTS on the sixth attempt", () => {
  it("blocks the 6th email OTP attempt and invalidates the challenge", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    seedEmailChallenge({ attempts: 0 }); // start fresh

    // Attempts 1–5: wrong OTP → OTP_INVALID (or TOO_MANY_ATTEMPTS on the 5th as attempts reaches 5 and newAttempts becomes 5)
    for (let i = 1; i <= 4; i++) {
      const res = await request(app)
        .post("/api/admin/2fa/setup/verify-email-otp")
        .set("x-admin-key", ADMIN_KEY)
        .send({ otp: "wrong-otp" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("OTP_INVALID");
      expect(state.challenges.has("email")).toBe(true);
    }

    // 5th attempt — attempts goes 4 → 5, returns OTP_INVALID
    const fifth = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "wrong-otp" });
    expect(fifth.status).toBe(400);
    expect(fifth.body.code).toBe("OTP_INVALID");
    expect(state.challenges.has("email")).toBe(true);
    expect(state.challenges.get("email")?.attempts).toBe(5);

    // 6th attempt — attempts=5 ≥ 5 → TOO_MANY_ATTEMPTS, challenge deleted
    const blocked = await request(app)
      .post("/api/admin/2fa/setup/verify-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "another-wrong-otp" });

    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(state.challenges.has("email")).toBe(false); // challenge invalidated
  });

  it("blocks the 6th SMS OTP attempt and invalidates the challenge", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_2fa_secret_pending", TEST_SECRET);
    // Pre-seed with 5 attempts already accumulated
    seedSmsChallenge({ attempts: 5 });

    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "any-otp" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(state.challenges.has("sms")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Resend within 60 seconds → 429 RESEND_COOLDOWN with secondsRemaining
// ─────────────────────────────────────────────────────────────────────────────

describe("Resend cooldown gate: RESEND_COOLDOWN within 60 seconds", () => {
  it("returns 429 RESEND_COOLDOWN with secondsRemaining when email was sent < 60s ago", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    state.settings.set("admin_email", "admin@example.com");
    // Seed an existing email challenge created 30 seconds ago → ~30s remaining in cooldown
    seedEmailChallenge({ createdAt: pastDate(30) });

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RESEND_COOLDOWN");
    expect(typeof res.body.secondsRemaining).toBe("number");
    expect(res.body.secondsRemaining).toBeGreaterThan(0);
    expect(res.body.secondsRemaining).toBeLessThanOrEqual(30);
    // No new email should be sent during cooldown
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("returns 429 RESEND_COOLDOWN with secondsRemaining when SMS was sent < 60s ago", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_mobile", "+919876543210");
    // 10 seconds into cooldown → ~50 seconds remaining
    seedSmsChallenge({ createdAt: pastDate(10) });

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RESEND_COOLDOWN");
    expect(res.body.secondsRemaining).toBeGreaterThan(0);
    expect(res.body.secondsRemaining).toBeLessThanOrEqual(50);
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it("allows resend after 60 seconds have elapsed (email)", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    state.settings.set("admin_email", "admin@example.com");
    // 61 seconds ago — cooldown has expired
    seedEmailChallenge({ createdAt: pastDate(61) });

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockResendSend).toHaveBeenCalledOnce();
    // A fresh challenge must replace the old one
    expect(state.challenges.get("email")?.createdAt.getTime()).toBeGreaterThan(pastDate(5).getTime());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. admin_2fa_enabled remains false after TOTP verify alone
// ─────────────────────────────────────────────────────────────────────────────

describe("TOTP verify alone does NOT enable 2FA", () => {
  it("sets stage to totp_verified but leaves admin_2fa_enabled unset", async () => {
    state.settings.set("admin_2fa_secret_pending", TEST_SECRET);

    const res = await request(app)
      .post("/api/admin/2fa/setup/verify")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: validTOTP(TEST_SECRET) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, next: "email-otp" });

    // 2FA must NOT be enabled yet
    expect(state.settings.get("admin_2fa_enabled")).toBeUndefined();
    // Stage must reflect that TOTP was verified
    expect(state.settings.get("admin_2fa_setup_stage")).toBe("totp_verified");
    // No session issued at this stage
    expect(state.sessions.length).toBe(0);
  });

  it("only enables 2FA after the full SMS OTP verification succeeds", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_2fa_secret_pending", TEST_SECRET);
    seedSmsChallenge({ codeHash: "sha256:final-otp" });

    expect(state.settings.get("admin_2fa_enabled")).toBeUndefined();

    const res = await request(app)
      .post("/api/admin/2fa/setup/verify-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ otp: "final-otp" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tokenHash).toBeTruthy();

    // Now 2FA must be enabled
    expect(state.settings.get("admin_2fa_enabled")).toBe("true");
    expect(state.settings.get("admin_2fa_secret")).toBe(TEST_SECRET);
    // Stage and pending secret must be cleaned up
    expect(state.settings.has("admin_2fa_setup_stage")).toBe(false);
    expect(state.settings.has("admin_2fa_secret_pending")).toBe(false);
    // A verified session must have been created
    expect(state.sessions.length).toBe(1);
    expect(state.sessions[0].twoFactorVerified).toBe(true);
    // SMS challenge must be deleted
    expect(state.challenges.has("sms")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. setup/start clears stale challenges from a previous abandoned flow
// ─────────────────────────────────────────────────────────────────────────────

describe("setup/start clears stale OTP challenges", () => {
  it("deletes any leftover email/sms challenges when a new setup begins", async () => {
    // Simulate an abandoned setup that left challenges behind
    seedEmailChallenge({ codeHash: "sha256:old-email-otp" });
    seedSmsChallenge({ codeHash: "sha256:old-sms-otp" });
    state.settings.set("admin_2fa_setup_stage", "email_verified"); // leftover stage

    expect(state.challenges.size).toBe(2);

    const res = await request(app)
      .post("/api/admin/2fa/setup/start")
      .set("x-admin-key", ADMIN_KEY)
      .send({ accessKey: ADMIN_KEY });

    expect(res.status).toBe(200);

    // All old challenges must be cleared
    expect(state.challenges.size).toBe(0);
    // Setup stage must be reset
    expect(state.settings.has("admin_2fa_setup_stage")).toBe(false);
    // A fresh pending secret must be stored
    expect(state.settings.has("admin_2fa_secret_pending")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Missing admin_email → 400 EMAIL_NOT_CONFIGURED
// ─────────────────────────────────────────────────────────────────────────────

describe("send-email-otp: delivery failure rollback", () => {
  it("rolls back the challenge when Resend returns a non-throw error result", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    state.settings.set("admin_email", "admin@example.com");
    // Resend can return { data: null, error: {...} } without throwing
    mockResendSend.mockResolvedValueOnce({ data: null, error: { message: "API key invalid", name: "validation_error" } });

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("EMAIL_DELIVERY_FAILED");
    // Challenge must be rolled back so the caller can retry cleanly
    expect(state.challenges.has("email")).toBe(false);
    expect(mockResendSend).toHaveBeenCalledOnce();
  });

  it("rolls back the challenge when Resend throws (network error, etc.)", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    state.settings.set("admin_email", "admin@example.com");
    mockResendSend.mockRejectedValueOnce(new Error("Network timeout"));

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(500);
    // Challenge must be rolled back — caller must not be blocked by a 60s cooldown
    expect(state.challenges.has("email")).toBe(false);
  });
});

describe("send-sms-otp: delivery failure rollback", () => {
  it("rolls back the challenge when sendSms throws (Twilio error, network error, etc.)", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_mobile", "+919876543210");
    mockSendSms.mockRejectedValueOnce(new Error("Twilio API error: 401"));

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(500);
    // Challenge must be rolled back — caller must not be blocked by a 60s cooldown
    expect(state.challenges.has("sms")).toBe(false);
  });
});

describe("send-email-otp: delivery-configuration gates", () => {
  it("returns 400 EMAIL_NOT_CONFIGURED when admin_email is not set in site settings", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    // admin_email deliberately NOT seeded

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMAIL_NOT_CONFIGURED");
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("returns 500 EMAIL_SERVICE_UNAVAILABLE when RESEND_API_KEY is missing", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    state.settings.set("admin_email", "admin@example.com");
    delete process.env.RESEND_API_KEY;

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("EMAIL_SERVICE_UNAVAILABLE");
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("sends email OTP to admin_email and returns ok: true when all configured", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    state.settings.set("admin_email", "admin@example.com");

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockResendSend).toHaveBeenCalledOnce();
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.to).toBe("admin@example.com");
    expect(callArgs.subject).toMatch(/2FA/i);
    // OTP challenge must be stored
    expect(state.challenges.has("email")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Missing admin_mobile → 400 MOBILE_NOT_CONFIGURED
// ─────────────────────────────────────────────────────────────────────────────

describe("send-sms-otp: delivery-configuration gates", () => {
  it("returns 400 MOBILE_NOT_CONFIGURED when admin_mobile is not set in site settings", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    // admin_mobile deliberately NOT seeded

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MOBILE_NOT_CONFIGURED");
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it("returns 500 SMS_SERVICE_UNAVAILABLE when Twilio credentials are missing", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_mobile", "+919876543210");
    delete process.env.TWILIO_ACCOUNT_SID;

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("SMS_SERVICE_UNAVAILABLE");
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it("sends SMS OTP to admin_mobile and returns ok: true when all configured", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_mobile", "+919876543210");

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSendSms).toHaveBeenCalledOnce();
    const [toNumber, body] = mockSendSms.mock.calls[0];
    expect(toNumber).toBe("+919876543210");
    expect(body).toMatch(/2FA/i);
    // OTP challenge must be stored
    expect(state.challenges.has("sms")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional: send-email-otp and send-sms-otp stage gates (wrong stage)
// ─────────────────────────────────────────────────────────────────────────────

describe("send-email-otp stage gate", () => {
  it("returns 400 WRONG_STAGE when TOTP has not been verified yet", async () => {
    state.settings.set("admin_email", "admin@example.com");
    // No stage set
    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WRONG_STAGE");
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("returns 400 WRONG_STAGE when email is already verified (wrong stage)", async () => {
    state.settings.set("admin_2fa_setup_stage", "email_verified");
    state.settings.set("admin_email", "admin@example.com");

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-email-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WRONG_STAGE");
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});

describe("send-sms-otp stage gate", () => {
  it("returns 400 WRONG_STAGE when email OTP has not been verified yet", async () => {
    state.settings.set("admin_2fa_setup_stage", "totp_verified");
    state.settings.set("admin_mobile", "+919876543210");

    const res = await request(app)
      .post("/api/admin/2fa/setup/send-sms-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WRONG_STAGE");
    expect(mockSendSms).not.toHaveBeenCalled();
  });
});
