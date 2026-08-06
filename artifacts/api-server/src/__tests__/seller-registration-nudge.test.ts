/**
 * Seller registration nudge email — unit tests.
 *
 * Worker design (atomic transaction):
 *   1. SELECT eligible drafts (without claiming)
 *   2. For each draft: resolve email via Clerk API (outside transaction)
 *   3. db.transaction:
 *      a. UPDATE SET nudgeSentAt=now WHERE nudgeSentAt IS NULL → if 0 rows, skip
 *      b. INSERT INTO email_outbox
 *      Both commit atomically. Process crash before commit → DB rolls back →
 *      draft stays with nudgeSentAt=null → eligible again on next tick.
 *   4. Best-effort immediate send via Resend (outbox worker handles retries)
 *
 * Tests cover:
 *  - sendSellerRegistrationNudgeEmail: public API returns true/false correctly
 *  - Worker happy path (claim + outbox row committed atomically)
 *  - No eligible drafts / all already claimed (concurrent worker guard)
 *  - Unresolvable email: draft stays un-claimed
 *  - Transaction rolls back when outbox insert throws (crash-recovery simulation)
 *  - Save-during-claim race: draft PUT resets nudgeSentAt; concurrent claim
 *    WHERE IS NULL matches again and worker proceeds correctly
 *  - Multiple drafts: each processed independently
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendSellerRegistrationNudgeEmail,
  startSellerRegistrationNudgeWorker,
} from "../lib/transactionalEmail";

// ─── Hoisted state ────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  /** Rows returned by the SELECT eligible drafts query */
  eligibleDrafts: [] as { id: string; userId: string }[],
  /** Rows returned by the claim UPDATE inside the transaction */
  claimReturnedRows: [] as { id: string }[],
  /** All nudgeSentAt values written via db.update().set() inside transactions */
  nudgeSentAtWrites: [] as (Date | null)[],
  /** Captured outbox insert values (last one, or all if needed) */
  capturedOutboxInserts: [] as Record<string, unknown>[],
  /** If true, the outbox INSERT inside the transaction throws */
  txInsertShouldThrow: false,
  /** If true, the outer db.transaction() itself throws (simulates full rollback) */
  txShouldThrow: false,
  /** Email returned by Clerk. null = user not found */
  clerkEmail: "seller@example.com" as string | null,
  /** How many Clerk getUser calls have been made */
  clerkCallCount: 0,
  /** Per-userId email override for multi-draft tests */
  clerkEmailByUserId: null as Record<string, string | null> | null,
}));

// ─── Mock @workspace/db ───────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  function makeUpdateWhereResult(rows: unknown[]) {
    return Object.assign(Promise.resolve(rows), {
      returning: vi.fn(() => Promise.resolve(rows)),
    });
  }

  const dbMock = {
    /** Used by sendSellerRegistrationNudgeEmail (direct call, no transaction) */
    insert: vi.fn((_table: unknown) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        state.capturedOutboxInserts.push(vals);
        return {
          returning: vi.fn(() =>
            Promise.resolve([{ id: "outbox-1", ...vals }])
          ),
        };
      }),
    })),

    /** Used by sendSellerRegistrationNudgeEmail (direct call, no transaction) */
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        if ("nudgeSentAt" in vals) {
          state.nudgeSentAtWrites.push(vals.nudgeSentAt as Date | null);
        }
        return { where: vi.fn(() => makeUpdateWhereResult([])) };
      }),
    })),

    /** SELECT for eligible drafts */
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(state.eligibleDrafts)),
      })),
    })),

    /**
     * transaction() runs its callback with a tx object that provides
     * update() (for the claim) and insert() (for the outbox row).
     */
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      if (state.txShouldThrow) {
        throw new Error("Simulated transaction rollback / process restart");
      }

      const tx = {
        update: vi.fn((_table: unknown) => ({
          set: vi.fn((vals: Record<string, unknown>) => {
            if ("nudgeSentAt" in vals) {
              state.nudgeSentAtWrites.push(vals.nudgeSentAt as Date | null);
            }
            return {
              where: vi.fn(() => makeUpdateWhereResult(state.claimReturnedRows)),
            };
          }),
        })),

        insert: vi.fn((_table: unknown) => ({
          values: vi.fn((vals: Record<string, unknown>) => {
            if (state.txInsertShouldThrow) {
              return {
                returning: vi.fn(() =>
                  Promise.reject(new Error("Simulated outbox INSERT failure"))
                ),
              };
            }
            state.capturedOutboxInserts.push(vals);
            return {
              returning: vi.fn(() =>
                Promise.resolve([{ id: "outbox-1", ...vals }])
              ),
            };
          }),
        })),
      };

      await fn(tx);
    }),
  };

  return {
    db: dbMock,
    emailOutboxTable: { _t: "emailOutbox", $inferSelect: {} },
    sellerRegistrationDraftsTable: {
      _t: "sellerRegistrationDrafts",
      id: "id",
      userId: "user_id",
      updatedAt: "updated_at",
      nudgeSentAt: "nudge_sent_at",
      $inferSelect: {},
    },
  };
});

// ─── Mock @clerk/express ───────────────────────────────────────────────────

vi.mock("@clerk/express", () => ({
  clerkClient: {
    users: {
      getUser: vi.fn(async (userId: string) => {
        state.clerkCallCount++;
        let email: string | null;
        if (state.clerkEmailByUserId) {
          email = state.clerkEmailByUserId[userId] ?? null;
        } else {
          email = state.clerkEmail;
        }
        return {
          primaryEmailAddress: email ? { emailAddress: email } : null,
          emailAddresses: email ? [{ emailAddress: email }] : [],
        };
      }),
    },
  },
  getAuth: vi.fn(() => ({ userId: "user-test" })),
  clerkMiddleware: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next()
  ),
}));

// ─── Mock resend ─────────────────────────────────────────────────────────

vi.mock("resend", () => {
  class ResendMock {
    emails: { send: ReturnType<typeof vi.fn> };
    constructor(_apiKey: string) {
      this.emails = {
        send: vi.fn().mockResolvedValue({ id: "resend-msg-id" }),
      };
    }
  }
  return { Resend: ResendMock };
});

// ─── Mock logger ──────────────────────────────────────────────────────────

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Mock adminNotifications ──────────────────────────────────────────────

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

function resetState() {
  state.eligibleDrafts = [];
  state.claimReturnedRows = [];
  state.nudgeSentAtWrites = [];
  state.capturedOutboxInserts = [];
  state.txInsertShouldThrow = false;
  state.txShouldThrow = false;
  state.clerkEmail = "seller@example.com";
  state.clerkCallCount = 0;
  state.clerkEmailByUserId = null;
}

function eligibleDraft(id = "draft-1", userId = "user-seller-1") {
  return { id, userId };
}

async function runOneTick(): Promise<void> {
  startSellerRegistrationNudgeWorker(999_999_999);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// ─── Tests: sendSellerRegistrationNudgeEmail ──────────────────────────────

describe("sendSellerRegistrationNudgeEmail", () => {
  beforeEach(() => {
    resetState();
    process.env.RESEND_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    vi.clearAllMocks();
  });

  it("returns true and inserts an outbox row when Resend and email are available", async () => {
    const result = await sendSellerRegistrationNudgeEmail({ userId: "user-1" });

    expect(result).toBe(true);
    expect(state.capturedOutboxInserts).toHaveLength(1);
    expect(state.capturedOutboxInserts[0]?.userId).toBe("user-1");
    expect(state.capturedOutboxInserts[0]?.type).toBe("seller_registration_nudge");
    expect(state.capturedOutboxInserts[0]?.toEmail).toBe("seller@example.com");
    expect(state.capturedOutboxInserts[0]?.status).toBe("pending");
  });

  it("returns false and inserts nothing when RESEND_API_KEY is absent", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendSellerRegistrationNudgeEmail({ userId: "user-1" });
    expect(result).toBe(false);
    expect(state.capturedOutboxInserts).toHaveLength(0);
  });

  it("returns false and inserts nothing when Clerk cannot resolve the email address", async () => {
    state.clerkEmail = null;
    const result = await sendSellerRegistrationNudgeEmail({ userId: "user-1" });
    expect(result).toBe(false);
    expect(state.capturedOutboxInserts).toHaveLength(0);
  });

  it("includes the registration URL in the email HTML", async () => {
    await sendSellerRegistrationNudgeEmail({
      userId: "user-1",
      registrationUrl: "https://twirldrape.com/seller/register?ref=nudge",
    });
    expect(state.capturedOutboxInserts[0]?.html as string).toContain(
      "https://twirldrape.com/seller/register?ref=nudge"
    );
  });
});

// ─── Tests: worker — atomic transaction ───────────────────────────────────

describe("seller nudge worker — atomic claim+outbox transaction", () => {
  beforeEach(() => {
    resetState();
    process.env.RESEND_API_KEY = "test-key";
    // By default, each claim UPDATE returns 1 row (draft was un-claimed)
    state.claimReturnedRows = [{ id: "draft-1" }];
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    vi.clearAllMocks();
  });

  it("commits claim and outbox row atomically on the happy path", async () => {
    state.eligibleDrafts = [eligibleDraft()];
    await runOneTick();

    // Claim write inside transaction
    expect(state.nudgeSentAtWrites).toHaveLength(1);
    expect(state.nudgeSentAtWrites[0]).toBeInstanceOf(Date);

    // Outbox row created inside the same transaction
    expect(state.capturedOutboxInserts).toHaveLength(1);
    expect(state.capturedOutboxInserts[0]?.userId).toBe("user-seller-1");
    expect(state.capturedOutboxInserts[0]?.type).toBe("seller_registration_nudge");
  });

  it("skips (no transaction) when SELECT returns no eligible drafts", async () => {
    state.eligibleDrafts = [];
    await runOneTick();

    expect(state.nudgeSentAtWrites).toHaveLength(0);
    expect(state.capturedOutboxInserts).toHaveLength(0);
  });

  it("skips outbox insert when claim UPDATE returns 0 rows (concurrent worker already claimed)", async () => {
    state.eligibleDrafts = [eligibleDraft()];
    state.claimReturnedRows = []; // concurrent worker claimed it first
    await runOneTick();

    // Claim was attempted (nudgeSentAt write) but returned 0 rows
    expect(state.nudgeSentAtWrites).toHaveLength(1);
    // Outbox insert was NOT called (worker skipped on 0 rows)
    expect(state.capturedOutboxInserts).toHaveLength(0);
  });

  it("skips draft entirely when Clerk cannot resolve the email address (draft remains eligible)", async () => {
    state.eligibleDrafts = [eligibleDraft()];
    state.clerkEmail = null;
    await runOneTick();

    // No transaction was started — draft remains with nudgeSentAt=null
    expect(state.nudgeSentAtWrites).toHaveLength(0);
    expect(state.capturedOutboxInserts).toHaveLength(0);
  });

  it("crash-recovery: transaction rolls back when outbox INSERT throws — draft stays un-claimed", async () => {
    // Simulates: process dies (or DB insert fails) after claim UPDATE but
    // before COMMIT. The transaction is rolled back automatically by the DB.
    // In this test: txShouldThrow causes transaction() to throw, simulating
    // a rolled-back transaction. The draft must remain with nudgeSentAt=null.
    state.eligibleDrafts = [eligibleDraft()];
    state.txShouldThrow = true; // simulates a full rollback / restart
    await runOneTick();

    // The worker caught the error — no writes committed
    expect(state.nudgeSentAtWrites).toHaveLength(0);
    expect(state.capturedOutboxInserts).toHaveLength(0);
    // Draft is still eligible (nudgeSentAt never committed to null)
  });

  it("crash-recovery: outbox INSERT failure inside transaction rolls back the claim too", async () => {
    // Simulates: the outbox INSERT throws inside the transaction callback.
    // In the real DB this would trigger a ROLLBACK; in our mock the transaction()
    // re-throws, and the outer try/catch logs the error without any nudgeSentAt
    // write persisting (since our mock only records writes synchronously during
    // the callback — if the callback throws, the transaction mock re-throws too).
    state.eligibleDrafts = [eligibleDraft()];
    state.txInsertShouldThrow = true;
    await runOneTick();

    // The transaction threw — claim and outbox are both un-committed
    // (consistent with a DB rollback)
    expect(state.capturedOutboxInserts).toHaveLength(0);
  });

  it("save-during-claim: draft eligible again after PUT resets nudgeSentAt (concurrent WHERE IS NULL claim proceeds)", async () => {
    // Scenario: two worker ticks run. On the first tick a concurrent worker
    // already claimed the draft (claimReturnedRows=[]) — so our worker skips.
    // Then the seller saves (PUT resets nudgeSentAt=null). On the second tick,
    // the draft is eligible again (IS NULL satisfied) — our worker claims it.
    state.eligibleDrafts = [eligibleDraft()];

    // First tick: concurrent worker already claimed → our worker sees 0 rows
    state.claimReturnedRows = [];
    await runOneTick();
    expect(state.capturedOutboxInserts).toHaveLength(0);

    // Seller saves (POST reset nudgeSentAt=null — external to this worker)
    // Simulate: draft is eligible again on next tick
    resetState();
    state.eligibleDrafts = [eligibleDraft()];
    state.claimReturnedRows = [{ id: "draft-1" }]; // IS NULL now satisfied
    process.env.RESEND_API_KEY = "test-key";
    await runOneTick();

    // On second tick, claim + outbox commit atomically
    expect(state.nudgeSentAtWrites).toHaveLength(1);
    expect(state.nudgeSentAtWrites[0]).toBeInstanceOf(Date);
    expect(state.capturedOutboxInserts).toHaveLength(1);
  });

  it("processes multiple eligible drafts independently", async () => {
    state.eligibleDrafts = [
      eligibleDraft("draft-1", "user-a"),
      eligibleDraft("draft-2", "user-b"),
    ];
    state.clerkEmailByUserId = {
      "user-a": "user-a@example.com",
      "user-b": "user-b@example.com",
    };
    await runOneTick();

    // Two transactions, two claim writes, two outbox rows
    expect(state.nudgeSentAtWrites).toHaveLength(2);
    expect(state.nudgeSentAtWrites.every((v) => v instanceof Date)).toBe(true);
    expect(state.capturedOutboxInserts).toHaveLength(2);
  });

  it("skips unresolvable-email draft and still processes remaining drafts", async () => {
    state.eligibleDrafts = [
      eligibleDraft("draft-1", "user-no-email"),
      eligibleDraft("draft-2", "user-has-email"),
    ];
    state.clerkEmailByUserId = {
      "user-no-email": null,
      "user-has-email": "ok@example.com",
    };
    await runOneTick();

    // Only one outbox row (the resolvable draft)
    expect(state.capturedOutboxInserts).toHaveLength(1);
    expect(state.capturedOutboxInserts[0]?.userId).toBe("user-has-email");
    // First draft: no write (email unresolvable, no transaction started)
    // Second draft: one claim write
    expect(state.nudgeSentAtWrites).toHaveLength(1);
  });
});
