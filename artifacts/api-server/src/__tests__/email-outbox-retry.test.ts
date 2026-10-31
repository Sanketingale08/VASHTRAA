/**
 * Tests for POST /admin/email-outbox/:id/retry
 *
 * Verifies:
 * - 200: dead entry is reset to pending with cleared attempt counter
 * - 409: non-dead entries (sent, pending, failed) are rejected
 * - 404: unknown entry returns not found
 * - 401: missing admin key is rejected
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── hoisted state ───────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  // selectRows: first call returns the entry lookup; second call (if any) is unused
  selectRows: [] as Record<string, unknown>[],
  // updated rows returned by .returning()
  updateReturning: [] as Record<string, unknown>[],
  // capture what was passed to .set()
  capturedSetValues: null as Record<string, unknown> | null,
}));

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  let selectCallCount = 0;

  const makeSelectChain = (rows: Record<string, unknown>[]) => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(rows)),
    })),
  });

  const dbMock = {
    select: vi.fn((_fields?: unknown) => {
      // return the pre-configured rows for the current call index
      const rows = selectCallCount === 0 ? state.selectRows : [];
      selectCallCount++;
      return makeSelectChain(rows);
    }),
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        state.capturedSetValues = vals;
        return {
          where: vi.fn(() => Promise.resolve()),
        };
      }),
    })),
  };

  // reset call counter between tests
  (dbMock as any).__resetCallCount = () => {
    selectCallCount = 0;
  };

  return {
    db: dbMock,
    emailOutboxTable: {
      id: "id",
      status: "status",
      attempts: "attempts",
      lastAttemptAt: "lastAttemptAt",
      nextRetryAt: "nextRetryAt",
      errorMessage: "errorMessage",
    },
    notificationsTable: {
      id: "id",
      userId: "userId",
      type: "type",
      title: "title",
      body: "body",
      read: "read",
      createdAt: "createdAt",
    },
    ADMIN_NOTIFICATION_USER_ID: "admin",
  };
});

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: null })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// drizzle operators — used in the route but not exercised in these unit tests
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => `eq`),
  and: vi.fn((...args: unknown[]) => args.join("&")),
  desc: vi.fn((col: unknown) => col),
  sql: vi.fn((parts: TemplateStringsArray, ...vals: unknown[]) => parts.join("") + vals.join("")),
  inArray: vi.fn(() => `inArray`),
  ilike: vi.fn(() => `ilike`),
  or: vi.fn(() => `or`),
  gte: vi.fn(() => `gte`),
  lte: vi.fn(() => `lte`),
}));

// ─── app factory ─────────────────────────────────────────────────────────────

const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "dev-admin-key";

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((_req: any, _res: unknown, next: () => void) => {
    (_req as any).log = { error: vi.fn(), info: vi.fn() };
    next();
  });
  const { default: adminNotifRouter } = await import("../routes/adminNotifications");
  app.use("/api", adminNotifRouter);
  return app;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("POST /api/admin/email-outbox/:id/retry", () => {
  let app: Express;

  beforeEach(async () => {
    vi.resetModules();
    state.selectRows = [];
    state.updateReturning = [];
    state.capturedSetValues = null;

    // re-import after resetModules so db mock starts fresh
    const { db } = await import("@workspace/db");
    (db as any).__resetCallCount?.();

    app = await buildApp();
  });

  it("returns 403 when admin key is missing", async () => {
    const res = await request(app)
      .post("/api/admin/email-outbox/some-id/retry")
      .expect(403);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 when the outbox entry does not exist", async () => {
    state.selectRows = []; // no rows → entry not found
    const res = await request(app)
      .post("/api/admin/email-outbox/nonexistent-id/retry")
      .set("x-admin-key", ADMIN_KEY)
      .expect(404);
    expect(res.body.error).toBe("Outbox entry not found");
  });

  it("returns 409 when the entry status is 'sent'", async () => {
    state.selectRows = [{ id: "outbox-1", status: "sent" }];
    const res = await request(app)
      .post("/api/admin/email-outbox/outbox-1/retry")
      .set("x-admin-key", ADMIN_KEY)
      .expect(409);
    expect(res.body.error).toBe("not_retryable");
    expect(res.body.message).toContain("sent");
  });

  it("returns 409 when the entry status is 'pending'", async () => {
    state.selectRows = [{ id: "outbox-2", status: "pending" }];
    const res = await request(app)
      .post("/api/admin/email-outbox/outbox-2/retry")
      .set("x-admin-key", ADMIN_KEY)
      .expect(409);
    expect(res.body.error).toBe("not_retryable");
    expect(res.body.message).toContain("pending");
  });

  it("returns 409 when the entry status is 'failed'", async () => {
    state.selectRows = [{ id: "outbox-3", status: "failed" }];
    const res = await request(app)
      .post("/api/admin/email-outbox/outbox-3/retry")
      .set("x-admin-key", ADMIN_KEY)
      .expect(409);
    expect(res.body.error).toBe("not_retryable");
    expect(res.body.message).toContain("failed");
  });

  it("resets a dead entry to pending and clears the attempt counter", async () => {
    state.selectRows = [{ id: "outbox-dead", status: "dead" }];
    const res = await request(app)
      .post("/api/admin/email-outbox/outbox-dead/retry")
      .set("x-admin-key", ADMIN_KEY)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.outboxId).toBe("outbox-dead");

    // Verify the update was called with the correct reset values
    expect(state.capturedSetValues).toMatchObject({
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      errorMessage: null,
    });
    // nextRetryAt should be set to a Date (immediate re-queue)
    expect(state.capturedSetValues?.nextRetryAt).toBeInstanceOf(Date);
  });
});
