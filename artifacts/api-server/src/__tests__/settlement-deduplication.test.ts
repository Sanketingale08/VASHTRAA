/**
 * Settlement deduplication tests
 *
 * Two layers of protection prevent a vendor from being credited twice for the
 * same order:
 *
 *  1. Application pre-check — before inserting, the route queries
 *     vendorSettlementsTable for an existing (orderId, vendorId, type) row and
 *     skips the insert when one is found.
 *
 *  2. Database unique index — a partial UNIQUE INDEX on
 *     (order_id, vendor_id, type) WHERE order_id IS NOT NULL rejects any
 *     duplicate that slips past the application layer.
 *
 * This file tests both layers:
 *   A. Double-delivered endpoint calls — only ONE settlement row is ever
 *      written, because the pre-check detects the existing row on the second call.
 *   B. Bypassed pre-check — when the pre-check is disabled (simulating a
 *      reverted guard), the mock DB throws a PostgreSQL unique-violation error
 *      (code 23505). The route surfaces a 500 instead of silently double-crediting.
 *   C. Multi-vendor order — vendor-specific isolation is verified by using the
 *      drizzle condition string to match settled keys per vendor.
 *
 * Uses in-memory mocks only — no live database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── Mutable test state (hoisted so vi.mock factories can reference it) ──────

const state = vi.hoisted(() => ({
  order: null as any,
  product: {
    id: "prod-dedup-1",
    vendorId: "vendor-dedup-1",
    category: "sarees",
  },
  /** Override to an array for multi-product / multi-vendor scenarios. */
  products: null as any[] | null,

  /** Settlements stored so far (simulates a persistent table). */
  settlements: [] as any[],

  /**
   * Keys of already-settled combinations: `"${orderId}:${vendorId}:${type}"`.
   * Populated automatically by the INSERT mock. The SELECT mock inspects the
   * drizzle WHERE-condition string to find a matching key, giving genuine
   * per-vendor deduplication without needing to parse drizzle ASTs directly.
   */
  settledKeys: new Set<string>(),

  /**
   * When true the SELECT mock ignores settledKeys and always returns [] —
   * simulating the application pre-check being bypassed. Used in Suite B to
   * test the DB unique-constraint fallback.
   */
  disablePreCheck: false,

  /**
   * When true the settlement INSERT mock throws a PostgreSQL-style unique
   * violation error (code 23505) — simulating the DB constraint firing when
   * the application pre-check has been bypassed.
   */
  throwDuplicateOnSettlementInsert: false,

  notifications: [] as any[],
  notifIdCounter: 0,
  commissionRules: [] as any[],
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const ADMIN_KEY     = "test-admin-key-dedup";
const USER_ID       = "user-dedup-buyer";
const ORDER_ID      = "order-dedup-uuid-1";
const PRODUCT_ID    = "prod-dedup-1";
const VENDOR_ID     = "vendor-dedup-1";
const PRODUCT_PRICE = 8_000;
const PRODUCT_QTY   = 1;
const ORDER_SHIPPING = 199;

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    userId: USER_ID,
    status: "dispatched",
    statusHistory: [],
    items: [{ productId: PRODUCT_ID, name: "Kanjivaram Silk Saree", price: PRODUCT_PRICE, quantity: PRODUCT_QTY }],
    shipping: ORDER_SHIPPING,
    subtotal: PRODUCT_PRICE * PRODUCT_QTY,
    ...overrides,
  };
}

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  function queryResult(getRows: () => unknown[]): any {
    const rows = getRows();
    return {
      limit: vi.fn(() => queryResult(getRows)),
      for: vi.fn(() => queryResult(getRows)),
      orderBy: vi.fn(() => queryResult(getRows)),
      offset: vi.fn(() => queryResult(getRows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(rows).catch(fn),
    };
  }

  /**
   * Try to find a settled key whose orderId, vendorId, and type all appear in
   * the serialised drizzle WHERE-condition.  Drizzle SQL objects store
   * parameter values in Param wrappers that survive JSON serialisation, so
   * searching the stringified condition for the literal values is reliable
   * enough for mock purposes.
   */
  function matchSettledKey(condition: unknown): string | undefined {
    if (state.disablePreCheck) return undefined;
    try {
      const condStr = JSON.stringify(condition);
      return [...state.settledKeys].find((key) => {
        const [kOrderId, kVendorId, kType] = key.split("|");
        return (
          condStr.includes(kOrderId) &&
          condStr.includes(kVendorId) &&
          condStr.includes(kType)
        );
      });
    } catch {
      return undefined;
    }
  }

  function selectFor(table: any) {
    switch (table?._t) {
      case "orders":
        return {
          from: vi.fn((_t?: any) => ({
            where: vi.fn(() => queryResult(() => (state.order ? [state.order] : []))),
          })),
        };
      case "products":
        return {
          from: vi.fn((_t?: any) => ({
            where: vi.fn(() => queryResult(() => state.products ?? [state.product])),
          })),
        };
      case "vendors":
        return {
          from: vi.fn((_t?: any) => ({
            where: vi.fn(() => queryResult(() => [{ id: VENDOR_ID, ownerId: "owner-1" }])),
          })),
        };
      case "vendorSettlements":
        return {
          from: vi.fn((_t?: any) => ({
            where: vi.fn((condition) => {
              // Use the condition string to look up per-vendor settled keys.
              const matched = matchSettledKey(condition);
              return queryResult(() => (matched ? [{ id: "existing-settlement" }] : []));
            }),
          })),
        };
      case "notificationPreferences":
        return {
          from: vi.fn((_t?: any) => ({
            where: vi.fn(() => queryResult(() => [])),
          })),
        };
      default:
        return {
          from: vi.fn((_t?: any) => ({
            where: vi.fn(() => queryResult(() => [])),
          })),
        };
    }
  }

  const dbMock: any = {
    select: vi.fn((..._args: any[]) => ({
      from: vi.fn((table: any) => selectFor(table).from(table)),
    })),

    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => {
      const txMock: any = {
        select: vi.fn((..._args: any[]) => ({
          from: vi.fn((table: any) => selectFor(table).from(table)),
        })),

        insert: vi.fn((table: any) => ({
          values: vi.fn((vals: any) => {
            if (table?._t === "vendorSettlements") {
              // Simulate DB unique constraint rejection when configured.
              if (state.throwDuplicateOnSettlementInsert && state.settlements.length > 0) {
                const err: any = new Error(
                  'duplicate key value violates unique constraint "vendor_settlements_order_vendor_type_uniq"'
                );
                err.code = "23505"; // PostgreSQL unique_violation
                err.constraint = "vendor_settlements_order_vendor_type_uniq";
                return Promise.reject(err);
              }
              // Track in both the flat array and the key set.
              state.settlements.push({ ...vals });
              if (vals.orderId && vals.vendorId && vals.type) {
                state.settledKeys.add(`${vals.orderId}|${vals.vendorId}|${vals.type}`);
              }
              return Promise.resolve();
            }
            if (table?._t === "notifications") {
              state.notifIdCounter++;
              state.notifications.push({ id: `notif-${state.notifIdCounter}`, ...vals });
              return Promise.resolve();
            }
            return Promise.resolve();
          }),
        })),

        update: vi.fn((_table: any) => ({
          set: vi.fn((_vals: any) => ({
            where: vi.fn(() => ({
              returning: vi.fn(() => Promise.resolve([])),
              then: (resolve: any) => Promise.resolve(undefined).then(resolve),
            })),
          })),
        })),
      };
      return cb(txMock);
    }),
  };

  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: dbMock,
    ordersTable: tag("orders", [
      "id", "userId", "status", "statusHistory", "items",
      "shipping", "subtotal", "deliveredAt", "updatedAt",
      "cancelReason", "refundStatus",
    ]),
    productsTable: tag("products", ["id", "vendorId", "category", "stock"]),
    vendorsTable: tag("vendors", ["id", "ownerId", "name"]),
    vendorSettlementsTable: tag("vendorSettlements", [
      "id", "vendorId", "orderId", "type", "status",
      "amount", "productAmount", "commission", "commissionRate",
      "shippingCharge", "settlementTax", "netPayout",
    ]),
    cartItemsTable: tag("cartItems", ["userId"]),
    couponsTable: tag("coupons", ["id", "code"]),
    couponRedemptionsTable: tag("couponRedemptions", ["id"]),
    userProfilesTable: tag("userProfiles", ["userId"]),
    rewardPointsLogTable: tag("rewardPointsLog", ["userId"]),
    supportTicketsTable: tag("supportTickets", ["id"]),
    notificationsTable: tag("notifications", [
      "id", "userId", "vendorId", "type", "title", "body", "metadata", "read", "createdAt",
    ]),
    notificationPreferencesTable: tag("notificationPreferences", [
      "userId", "orderUpdates", "emailOrderUpdates",
    ]),
    stockHistoryTable: tag("stockHistory", [
      "id", "productId", "vendorId", "previousStock", "newStock", "source", "reason", "orderId",
    ]),
    commissionRulesTable: tag("commissionRules", [
      "id", "scope", "vendorId", "category", "rate", "active", "effectiveFrom", "effectiveTo",
    ]),
    eq: (a: any, b: any) => ({ [a]: b }),
    and: (...args: any[]) => args,
    inArray: (a: any, b: any) => ({ [a]: { $in: b } }),
    desc: (col: any) => col,
    sql: ((...args: any[]) => args) as any,
    gte: (a: any, b: any) => ({ [a]: { $gte: b } }),
    isMongoDbConnected: vi.fn(() => false),
  };
});

// ─── Commission partial mock ───────────────────────────────────────────────────

vi.mock("../lib/commission", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/commission")>();
  return {
    ...actual,
    loadActiveCommissionRules: vi.fn(() => Promise.resolve(state.commissionRules)),
  };
});

// ─── Other dependency mocks ───────────────────────────────────────────────────

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: USER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendTransactionalEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/stockHistory", () => ({
  recordStockChange: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn(() => Promise.resolve()),
}));

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: unknown, next: () => void) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  const { default: ordersRouter } = await import("../routes/orders");
  app.use("/api", ordersRouter);
  return app;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function markDelivered(app: Express) {
  return request(app)
    .post(`/api/orders/${ORDER_ID}/status`)
    .set("x-admin-key", ADMIN_KEY)
    .send({ status: "delivered" });
}

function resetState() {
  state.order = makeOrder();
  state.products = null;
  state.settlements = [];
  state.settledKeys = new Set();
  state.notifications = [];
  state.notifIdCounter = 0;
  state.commissionRules = [];
  state.disablePreCheck = false;
  state.throwDuplicateOnSettlementInsert = false;
}

// ─── Suite A: Application-level pre-check ────────────────────────────────────

describe("Settlement deduplication — application pre-check", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    resetState();
    app = await buildApp();
  });

  it("creates exactly one settlement row when the order is first marked delivered", async () => {
    const res = await markDelivered(app);

    expect(res.status).toBe(200);
    expect(state.settlements).toHaveLength(1);
    expect(state.settlements[0]).toMatchObject({
      vendorId: VENDOR_ID,
      orderId: ORDER_ID,
      type: "order_settlement",
    });
  });

  it("does NOT create a second settlement when the same order is marked delivered again", async () => {
    // First delivery: settlement written and key added to settledKeys
    const first = await markDelivered(app);
    expect(first.status).toBe(200);
    expect(state.settlements).toHaveLength(1);

    // The settledKey set is now populated; second delivery should see it
    state.order = makeOrder({ status: "delivered" });

    const second = await markDelivered(app);
    expect(second.status).toBe(200);

    // Still exactly one settlement — no double-credit
    expect(state.settlements).toHaveLength(1);
  });

  it("settlement row carries all three unique-index key fields", async () => {
    await markDelivered(app);

    const s = state.settlements[0];
    // All three fields that form the unique index key must be non-null strings
    expect(typeof s.orderId).toBe("string");
    expect(s.orderId).toBe(ORDER_ID);
    expect(typeof s.vendorId).toBe("string");
    expect(s.vendorId).toBe(VENDOR_ID);
    expect(s.type).toBe("order_settlement");
  });

  it("the settled-key set is populated after first delivery (enables the pre-check on retry)", async () => {
    expect(state.settledKeys.size).toBe(0);

    await markDelivered(app);

    expect(state.settledKeys.size).toBe(1);
    expect(state.settledKeys.has(`${ORDER_ID}|${VENDOR_ID}|order_settlement`)).toBe(true);
  });

  it("calling delivered three times still yields exactly one settlement", async () => {
    for (let i = 0; i < 3; i++) {
      state.order = makeOrder();
      await markDelivered(app);
    }
    expect(state.settlements).toHaveLength(1);
  });
});

// ─── Suite B: Database unique constraint as safety net ────────────────────────

describe("Settlement deduplication — DB unique constraint fallback", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    resetState();
    app = await buildApp();
  });

  it("first settlement insert succeeds when no duplicate exists", async () => {
    const res = await markDelivered(app);
    expect(res.status).toBe(200);
    expect(state.settlements).toHaveLength(1);
  });

  it("returns 500 when the DB unique constraint fires on a duplicate insert", async () => {
    // First delivery: succeeds normally
    const first = await markDelivered(app);
    expect(first.status).toBe(200);
    expect(state.settlements).toHaveLength(1);

    // Simulate the pre-check being bypassed AND the DB rejecting the duplicate
    state.disablePreCheck = true;
    state.throwDuplicateOnSettlementInsert = true;
    state.order = makeOrder({ status: "dispatched" });

    const second = await markDelivered(app);
    expect(second.status).toBe(500);
  });

  it("does not silently double-credit the vendor when the DB throws 23505", async () => {
    // First delivery: one settlement stored
    await markDelivered(app);
    const countAfterFirst = state.settlements.length;

    // Bypass pre-check, configure constraint error
    state.disablePreCheck = true;
    state.throwDuplicateOnSettlementInsert = true;
    state.order = makeOrder({ status: "dispatched" });

    // Second attempt rejected by DB constraint; transaction rolls back
    await markDelivered(app);

    expect(state.settlements).toHaveLength(countAfterFirst);
  });

  it("DB unique constraint error carries the correct PostgreSQL error code (23505)", async () => {
    // Verify the mock reproduces the real PostgreSQL unique_violation code so
    // that the error contract is explicit and not accidentally silenced.
    let caughtError: any = null;

    const { db } = await import("@workspace/db");
    const originalTx = (db as any).transaction;
    (db as any).transaction = vi.fn(async (cb: any) => {
      try {
        return await originalTx(cb);
      } catch (err: any) {
        caughtError = err;
        throw err;
      }
    });

    // Pre-seed one settlement and enable the DB throw
    state.settlements.push({ orderId: ORDER_ID, vendorId: VENDOR_ID, type: "order_settlement" });
    state.disablePreCheck = true;
    state.throwDuplicateOnSettlementInsert = true;

    const res = await markDelivered(app);

    (db as any).transaction = originalTx;

    expect(res.status).toBe(500);
    expect(caughtError?.code).toBe("23505");
    expect(caughtError?.constraint).toBe("vendor_settlements_order_vendor_type_uniq");
  });
});

// ─── Suite C: Multi-vendor order deduplication ───────────────────────────────

const VENDOR_A = "vendor-dedup-a";
const VENDOR_B = "vendor-dedup-b";
const PROD_A   = "prod-dedup-a";
const PROD_B   = "prod-dedup-b";

function makeMultiVendorOrder() {
  return {
    id: ORDER_ID,
    userId: USER_ID,
    status: "dispatched",
    statusHistory: [],
    items: [
      { productId: PROD_A, name: "Banarasi Silk",    price: 6_000, quantity: 1 },
      { productId: PROD_B, name: "Kanjivaram Cotton", price: 4_000, quantity: 1 },
    ],
    shipping: ORDER_SHIPPING,
    subtotal: 10_000,
  };
}

describe("Settlement deduplication — multi-vendor orders", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    resetState();
    state.order = makeMultiVendorOrder();
    state.products = [
      { id: PROD_A, vendorId: VENDOR_A, category: "sarees" },
      { id: PROD_B, vendorId: VENDOR_B, category: "sarees" },
    ];
    app = await buildApp();
  });

  it("creates exactly two settlements — one per vendor — on first delivery", async () => {
    const res = await markDelivered(app);
    expect(res.status).toBe(200);
    expect(state.settlements).toHaveLength(2);

    const vendorIds = state.settlements.map((s: any) => s.vendorId).sort();
    expect(vendorIds).toEqual([VENDOR_A, VENDOR_B].sort());
  });

  it("populates a settled key for each vendor after first delivery", async () => {
    await markDelivered(app);

    expect(state.settledKeys.has(`${ORDER_ID}|${VENDOR_A}|order_settlement`)).toBe(true);
    expect(state.settledKeys.has(`${ORDER_ID}|${VENDOR_B}|order_settlement`)).toBe(true);
  });

  it("does NOT add extra settlements when the same multi-vendor order is delivered again", async () => {
    // First call: 2 settlements written, both keys added to settledKeys
    await markDelivered(app);
    expect(state.settlements).toHaveLength(2);

    // Second call: per-vendor pre-check finds each key → both inserts skipped
    state.order = makeMultiVendorOrder();
    const second = await markDelivered(app);
    expect(second.status).toBe(200);
    expect(state.settlements).toHaveLength(2); // unchanged
  });

  it("pre-check is vendor-specific: settling vendor A does not block vendor B", async () => {
    // Pre-seed only vendor A as settled
    state.settlements.push({ orderId: ORDER_ID, vendorId: VENDOR_A, type: "order_settlement" });
    state.settledKeys.add(`${ORDER_ID}|${VENDOR_A}|order_settlement`);

    // Deliver — vendor A pre-check should skip; vendor B should be inserted
    state.order = makeMultiVendorOrder();
    const res = await markDelivered(app);
    expect(res.status).toBe(200);

    // Vendor B settlement must have been added; vendor A must not have doubled
    const vendorBRows = state.settlements.filter((s: any) => s.vendorId === VENDOR_B);
    const vendorARows = state.settlements.filter((s: any) => s.vendorId === VENDOR_A);
    expect(vendorBRows).toHaveLength(1);
    expect(vendorARows).toHaveLength(1); // still only the pre-seeded row
  });
});
