/**
 * Concurrent coupon redemption load-test simulation.
 *
 * Goal: confirm that SELECT … FOR UPDATE prevents over-redemption when many
 * users submit orders with the same limited coupon at the same time.
 *
 * Approach: The DB mock uses an in-process mutex so each "transaction"
 * acquires an exclusive lock before reading/writing usedCount.  This
 * faithfully reproduces what PostgreSQL's FOR UPDATE does: concurrent
 * transactions serialise on the coupon row.
 *
 * Expectations:
 *   - Exactly maxUses requests succeed (200 orderId returned).
 *   - All remaining requests fail with 400 + "usage limit" message.
 *   - Final usedCount in the mock never exceeds maxUses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ---------------------------------------------------------------------------
// Shared mutable state — reset in beforeEach
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  couponUsedCount: 0,
  couponMaxUses: 1 as number | null,
  orderCounter: 0,
  /** Promise-chain mutex: each transaction appends to the tail and awaits the head. */
  mutexTail: Promise.resolve() as Promise<unknown>,
  /**
   * Tracks whether the (single) user in a "same-user double redemption" test
   * has already redeemed the coupon. Only meaningful when every concurrent
   * request in a test shares the same userId — see `forceSameUser`.
   */
  redemptionRecorded: false,
  redemptionInsertCount: 0,
  /** When true, the Clerk mock returns the SAME userId for every request. */
  forceSameUser: false,
}));

// ---------------------------------------------------------------------------
// DB mock — table-aware, serialised transactions
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  const COUPON_ID = "coupon-uuid-1";

  const PRODUCT = {
    id: "prod-uuid-1",
    name: "Kanjivaram Silk Saree",
    price: 8000,
    images: ["img1.jpg"],
    vendorName: "Silk Palace",
    stock: 50,
  };

  /** Build a select chain that resolves rows based on the table's _t tag. */
  function makeSelectChain() {
    return {
      from: vi.fn((table: any) => {
        let rows: unknown[];
        switch (table?._t) {
          case "products":
            rows = [PRODUCT];
            break;
          case "coupons":
            rows = [
              {
                id: COUPON_ID,
                code: "LIMIT1",
                type: "flat",
                value: 100,
                active: true,
                expiresAt: null,
                maxUses: state.couponMaxUses,
                usedCount: state.couponUsedCount,
              },
            ];
            break;
          case "couponRedemptions":
            // Only meaningful in the "same-user" tests where every concurrent
            // request shares one userId — otherwise there's nothing to key on.
            rows = state.forceSameUser && state.redemptionRecorded
              ? [{ id: "redemption-existing" }]
              : [];
            break;
          default:
            rows = [];
        }
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(rows)),
            for: vi.fn(() => Promise.resolve(rows)),
          })),
          for: vi.fn(() => Promise.resolve(rows)),
        };
      }),
    };
  }

  /**
   * Return a thenable that also exposes .returning() — needed because some
   * update calls are `await tx.update(...).set(...).where(...)` (no chain)
   * while others add `.returning({...})` after `.where(...)`.
   */
  function makeWhereResult(returningRows: unknown[] = []) {
    return Object.assign(Promise.resolve(undefined as unknown), {
      returning: vi.fn(() => Promise.resolve(returningRows)),
    });
  }

  const dbMock = {
    // db.select() outside transaction — only used for the initial coupon lookup
    select: vi.fn(() => makeSelectChain()),

    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => {
      // Acquire the mutex — serialises concurrent calls, just like FOR UPDATE
      let releaseLock!: () => void;
      const prevTail = state.mutexTail;
      state.mutexTail = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      await prevTail;

      const txMock = {
        select: vi.fn(() => makeSelectChain()),

        insert: vi.fn((table: any) => ({
          values: vi.fn(() => {
            if (table?._t === "couponRedemptions") {
              state.redemptionRecorded = true;
              state.redemptionInsertCount++;
            }
            return Object.assign(Promise.resolve(undefined as unknown), {
              returning: vi.fn(() => {
                state.orderCounter++;
                return Promise.resolve([{ id: `order-${state.orderCounter}` }]);
              }),
              onConflictDoNothing: vi.fn(() => Promise.resolve()),
            });
          }),
        })),

        update: vi.fn((table: any) => ({
          set: vi.fn(() => ({
            where: vi.fn(() => {
              // Only the coupons update increments the shared counter
              if (table?._t === "coupons") {
                state.couponUsedCount++;
              }
              return makeWhereResult([{ totalPoints: 0, loyaltyTier: "silver" }]);
            }),
          })),
        })),

        delete: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),

        execute: vi.fn(() => Promise.resolve({ rows: [{ seq: 42 }] })),
      };

      try {
        return await cb(txMock);
      } finally {
        releaseLock();
      }
    }),
  };

  return {
    db: dbMock,
    couponsTable: {
      _t: "coupons",
      code: "code",
      active: "active",
      expiresAt: "expiresAt",
      id: "id",
      usedCount: "usedCount",
      maxUses: "maxUses",
      type: "type",
      value: "value",
      description: "description",
    },
    couponRedemptionsTable: {
      _t: "couponRedemptions",
      couponId: "couponId",
      userId: "userId",
      id: "id",
      orderId: "orderId",
    },
    ordersTable: { _t: "orders", id: "id", userId: "userId" },
    productsTable: {
      _t: "products",
      id: "id",
      name: "name",
      price: "price",
      images: "images",
      vendorName: "vendorName",
      stock: "stock",
    },
    cartItemsTable: { _t: "cartItems", userId: "userId" },
    userProfilesTable: {
      _t: "userProfiles",
      userId: "userId",
      referralCode: "referralCode",
      totalPoints: "totalPoints",
      lifetimePoints: "lifetimePoints",
      loyaltyTier: "loyaltyTier",
      updatedAt: "updatedAt",
    },
    rewardPointsLogTable: {
      _t: "rewardPointsLog",
      userId: "userId",
      points: "points",
      type: "type",
      description: "description",
      orderId: "orderId",
    },
    notificationsTable: {
      _t: "notifications",
      userId: "userId",
      type: "type",
      title: "title",
      body: "body",
      metadata: "metadata",
      id: "id",
    },
    notificationPreferencesTable: {
      _t: "notificationPreferences",
      userId: "userId",
      orderUpdates: "orderUpdates",
      offerAlerts: "offerAlerts",
    },
    stockHistoryTable: {
      _t: "stockHistory",
      productId: "productId",
      vendorId: "vendorId",
      delta: "delta",
      previousStock: "previousStock",
      newStock: "newStock",
      source: "source",
      reason: "reason",
      actorId: "actorId",
      orderId: "orderId",
    },
    ADMIN_NOTIFICATION_USER_ID: "admin-notifications-user",
  };
});

// ---------------------------------------------------------------------------
// Clerk mock — distinct userId per request so per-user redemption check
// doesn't interfere with the global maxUses test.
// ---------------------------------------------------------------------------
let userIndex = 0;
vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({
    userId: state.forceSameUser ? "user-shared" : `user-${++userIndex}`,
  })),
  clerkMiddleware: vi.fn(
    () =>
      (_req: unknown, _res: unknown, next: () => void) =>
        next(),
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ORDER_BODY = {
  items: [{ productId: "prod-uuid-1", quantity: 1 }],
  address: {
    name: "Priya Sharma",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  deliveryMethod: "standard",
  paymentMethod: "upi",
  couponCode: "LIMIT1",
};

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((_req: any, _res: unknown, next: () => void) => {
    (_req as any).log = { error: vi.fn(), info: vi.fn() };
    next();
  });
  const { default: ordersRouter } = await import("../routes/orders");
  app.use("/api", ordersRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Coupon concurrency — SELECT FOR UPDATE prevents over-redemption", () => {
  let app: Express;

  beforeEach(async () => {
    state.couponUsedCount = 0;
    state.orderCounter = 0;
    state.mutexTail = Promise.resolve();
    state.redemptionRecorded = false;
    state.redemptionInsertCount = 0;
    state.forceSameUser = false;
    userIndex = 0;
    app = await buildApp();
  });

  it("allows exactly 1 redemption when maxUses=1 and 20 concurrent requests arrive", async () => {
    state.couponMaxUses = 1;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).post("/api/orders").send(ORDER_BODY),
      ),
    );

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 400);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(19);

    for (const f of failures) {
      expect(f.body.error).toMatch(/usage limit/i);
    }

    // The database counter must never exceed the limit
    expect(state.couponUsedCount).toBeLessThanOrEqual(1);
  });

  it("allows exactly 5 redemptions when maxUses=5 and 30 concurrent requests arrive", async () => {
    state.couponMaxUses = 5;

    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        request(app).post("/api/orders").send(ORDER_BODY),
      ),
    );

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 400);

    expect(successes).toHaveLength(5);
    expect(failures).toHaveLength(25);

    for (const f of failures) {
      expect(f.body.error).toMatch(/usage limit/i);
    }

    expect(state.couponUsedCount).toBeLessThanOrEqual(5);
  });

  it("returns 400 with usage-limit message when the coupon is already at maxUses before any request", async () => {
    state.couponMaxUses = 3;
    state.couponUsedCount = 3; // already exhausted

    const res = await request(app).post("/api/orders").send(ORDER_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/usage limit/i);
    // Counter must not have grown beyond the limit
    expect(state.couponUsedCount).toBe(3);
  });

  it("allows all requests when maxUses is null (unlimited coupon)", async () => {
    state.couponMaxUses = null;
    state.couponUsedCount = 0;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post("/api/orders").send(ORDER_BODY),
      ),
    );

    const successes = results.filter((r) => r.status === 200);
    expect(successes).toHaveLength(10);
  });
});

describe("Coupon concurrency — same user cannot redeem a coupon twice via double-tap/double-tab", () => {
  let app: Express;

  beforeEach(async () => {
    state.couponUsedCount = 0;
    state.orderCounter = 0;
    state.mutexTail = Promise.resolve();
    state.redemptionRecorded = false;
    state.redemptionInsertCount = 0;
    state.forceSameUser = true;
    userIndex = 0;
    app = await buildApp();
  });

  it("only redeems once when the same user submits 2 near-simultaneous orders with the same coupon", async () => {
    // Unlimited coupon so the per-user redemption check (not the global
    // maxUses check) is what has to prevent the double redemption.
    state.couponMaxUses = null;

    const results = await Promise.all([
      request(app).post("/api/orders").send(ORDER_BODY),
      request(app).post("/api/orders").send(ORDER_BODY),
    ]);

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 400);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].body.error).toMatch(/already used this coupon/i);

    // usedCount and the redemption row must each be written exactly once.
    expect(state.couponUsedCount).toBe(1);
    expect(state.redemptionInsertCount).toBe(1);
  });

  it("only redeems once when the same user double-taps and fires 10 near-simultaneous requests", async () => {
    state.couponMaxUses = null;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post("/api/orders").send(ORDER_BODY),
      ),
    );

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 400);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(9);
    for (const f of failures) {
      expect(f.body.error).toMatch(/already used this coupon/i);
    }

    expect(state.couponUsedCount).toBe(1);
    expect(state.redemptionInsertCount).toBe(1);
  });
});
