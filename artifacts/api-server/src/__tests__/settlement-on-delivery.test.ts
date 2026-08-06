/**
 * Settlement-on-delivery — commission rate correctness tests.
 *
 * When an admin marks an order as "delivered", the route computes a
 * vendor settlement using `effectiveRateFromRules` from lib/commission.ts.
 * That function has three tiers: vendor-specific → category-specific → global.
 *
 * These tests verify that `commission`, `settlementTax`, and `netPayout`
 * stored in `vendorSettlementsTable` are correct for:
 *  1. A vendor-scoped commission rule (15%)
 *  2. A global commission rule (8%) with no vendor-specific rule
 *  3. The default rate (10%) when no active rules are present
 *
 * Uses in-memory mocks — no live database.
 * The commission module is *partially* mocked: `loadActiveCommissionRules`
 * is stubbed to return controlled rules while `effectiveRateFromRules` runs
 * its real implementation so the full resolution path is exercised.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── Mutable test state (hoisted so vi.mock factories can reference it) ──────
// Literal values used here — constants below are derived from state for DRY assertions.

const state = vi.hoisted(() => ({
  order: null as any,
  product: {
    id: "prod-settlement-uuid-1",
    vendorId: "vendor-settlement-uuid-1",
    category: "sarees",
  },
  vendor: {
    id: "vendor-settlement-uuid-1",
    ownerId: "vendor-settlement-owner-1",
  },
  settlements: [] as any[],
  notifications: [] as any[],
  notifIdCounter: 0,

  /** Rules returned by the mocked loadActiveCommissionRules */
  commissionRules: [] as Array<{
    scope: string;
    vendorId: string | null;
    category: string | null;
    rate: number;
    effectiveFrom?: null;
    effectiveTo?: null;
  }>,
}));

// Readable aliases used in test helpers and assertions
const ADMIN_KEY = "test-admin-key-settlement";
const USER_ID = "user-settlement-buyer";
const ORDER_ID = "order-settlement-uuid-1";
const PRODUCT_ID = "prod-settlement-uuid-1";
const VENDOR_ID = "vendor-settlement-uuid-1";
const PRODUCT_PRICE = 10_000;
const PRODUCT_QTY = 1;
const ORDER_SHIPPING = 199;

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    userId: USER_ID,
    status: "dispatched",
    statusHistory: [],
    items: [{ productId: PRODUCT_ID, name: "Banarasi Silk Saree", price: PRODUCT_PRICE, quantity: PRODUCT_QTY }],
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

  function selectFor(table: any) {
    switch (table?._t) {
      case "orders":
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => queryResult(() => state.order ? [state.order] : [])),
          })),
        };
      case "products":
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => queryResult(() => [state.product])),
          })),
        };
      case "vendors":
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => queryResult(() => [state.vendor])),
          })),
        };
      case "vendorSettlements":
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => queryResult(() => [])), // not yet settled
          })),
        };
      case "notificationPreferences":
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => queryResult(() => [])),
          })),
        };
      default:
        return {
          from: vi.fn(() => ({
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
              state.settlements.push({ ...vals });
            }
            if (table?._t === "notifications") {
              state.notifIdCounter++;
              state.notifications.push({
                id: `notif-${state.notifIdCounter}`,
                read: false,
                createdAt: new Date(),
                ...vals,
              });
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
  };
});

// ─── Commission module — partial mock ────────────────────────────────────────
// loadActiveCommissionRules is stubbed; effectiveRateFromRules uses the real impl.

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
    req.log = { error: vi.fn(), info: vi.fn() };
    next();
  });
  const { default: ordersRouter } = await import("../routes/orders");
  app.use("/api", ordersRouter);
  return app;
}

// ─── Helper: mark order delivered via admin status endpoint ───────────────────

async function markDelivered(app: Express) {
  return request(app)
    .post(`/api/orders/${ORDER_ID}/status`)
    .set("x-admin-key", ADMIN_KEY)
    .send({ status: "delivered" });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Settlement-on-delivery — commission rate correctness", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.order = makeOrder();
    state.settlements = [];
    state.notifications = [];
    state.notifIdCounter = 0;
    state.commissionRules = [];
    app = await buildApp();
  });

  // ── 1. Vendor-scoped rule at 15% ─────────────────────────────────────────

  it("uses a vendor-scoped rule (15%) when it matches the order vendor", async () => {
    state.commissionRules = [
      { scope: "vendor", vendorId: VENDOR_ID, category: null, rate: 0.15 },
    ];

    const res = await markDelivered(app);
    expect(res.status).toBe(200);

    expect(state.settlements).toHaveLength(1);
    const s = state.settlements[0];

    // Verify the correct rate was picked
    expect(s.commissionRate).toBe(0.15);

    // productAmount = 10000 * 1 = 10000
    const productAmount = PRODUCT_PRICE * PRODUCT_QTY;
    const expectedCommission = Math.round(productAmount * 0.15);   // 1500
    const expectedShipping = Math.round(ORDER_SHIPPING * productAmount / productAmount); // 199
    const expectedSettlementTax = Math.round(expectedCommission * 0.18); // 270
    const expectedNetPayout = productAmount - expectedCommission - expectedShipping - expectedSettlementTax; // 8031

    expect(s.productAmount).toBe(productAmount);
    expect(s.commission).toBe(expectedCommission);
    expect(s.shippingCharge).toBe(expectedShipping);
    expect(s.settlementTax).toBe(expectedSettlementTax);
    expect(s.netPayout).toBe(expectedNetPayout);
  });

  it("vendor-scoped rule: commission is larger at 15% than the default 10%", async () => {
    state.commissionRules = [
      { scope: "vendor", vendorId: VENDOR_ID, category: null, rate: 0.15 },
    ];

    await markDelivered(app);
    const s = state.settlements[0];

    const productAmount = PRODUCT_PRICE * PRODUCT_QTY;
    const defaultCommission = Math.round(productAmount * 0.10); // 1000
    expect(s.commission).toBeGreaterThan(defaultCommission);
    expect(s.netPayout).toBeLessThan(productAmount - defaultCommission);
  });

  // ── 2. Global-scoped rule at 8% ───────────────────────────────────────────

  it("falls back to a global rule (8%) when no vendor- or category-scoped rule exists", async () => {
    state.commissionRules = [
      { scope: "global", vendorId: null, category: null, rate: 0.08 },
    ];

    const res = await markDelivered(app);
    expect(res.status).toBe(200);

    expect(state.settlements).toHaveLength(1);
    const s = state.settlements[0];

    expect(s.commissionRate).toBe(0.08);

    const productAmount = PRODUCT_PRICE * PRODUCT_QTY;
    const expectedCommission = Math.round(productAmount * 0.08);   // 800
    const expectedSettlementTax = Math.round(expectedCommission * 0.18); // 144
    const expectedShipping = ORDER_SHIPPING; // 199 (single vendor = full shipping)
    const expectedNetPayout = productAmount - expectedCommission - expectedShipping - expectedSettlementTax; // 8857

    expect(s.productAmount).toBe(productAmount);
    expect(s.commission).toBe(expectedCommission);
    expect(s.settlementTax).toBe(expectedSettlementTax);
    expect(s.shippingCharge).toBe(expectedShipping);
    expect(s.netPayout).toBe(expectedNetPayout);
  });

  it("global rule: lower rate (8%) yields a higher netPayout than vendor rule (15%)", async () => {
    // Settle with global 8%
    state.commissionRules = [{ scope: "global", vendorId: null, category: null, rate: 0.08 }];
    await markDelivered(app);
    const globalPayout = state.settlements[0].netPayout;

    // Reset and settle with vendor 15%
    state.settlements = [];
    state.order = makeOrder();
    state.commissionRules = [{ scope: "vendor", vendorId: VENDOR_ID, category: null, rate: 0.15 }];
    await markDelivered(app);
    const vendorPayout = state.settlements[0].netPayout;

    expect(globalPayout).toBeGreaterThan(vendorPayout);
  });

  // ── 3. Vendor rule takes precedence over a global rule ────────────────────

  it("vendor-scoped rule takes precedence over a global rule", async () => {
    state.commissionRules = [
      { scope: "global", vendorId: null, category: null, rate: 0.08 },
      { scope: "vendor", vendorId: VENDOR_ID, category: null, rate: 0.15 },
    ];

    await markDelivered(app);
    const s = state.settlements[0];

    // Vendor rule (0.15) must win over global (0.08)
    expect(s.commissionRate).toBe(0.15);
    expect(s.commission).toBe(Math.round(PRODUCT_PRICE * PRODUCT_QTY * 0.15));
  });

  // ── 4. Default rate when no rules are present ─────────────────────────────

  it("falls back to the 10% default when no active commission rules exist", async () => {
    state.commissionRules = []; // empty — real effectiveRateFromRules returns DEFAULT_COMMISSION_RATE

    const res = await markDelivered(app);
    expect(res.status).toBe(200);

    expect(state.settlements).toHaveLength(1);
    const s = state.settlements[0];

    expect(s.commissionRate).toBe(0.10);

    const productAmount = PRODUCT_PRICE * PRODUCT_QTY;
    const expectedCommission = Math.round(productAmount * 0.10);   // 1000
    const expectedSettlementTax = Math.round(expectedCommission * 0.18); // 180
    const expectedShipping = ORDER_SHIPPING; // 199
    const expectedNetPayout = productAmount - expectedCommission - expectedShipping - expectedSettlementTax; // 8621

    expect(s.commission).toBe(expectedCommission);
    expect(s.settlementTax).toBe(expectedSettlementTax);
    expect(s.shippingCharge).toBe(expectedShipping);
    expect(s.netPayout).toBe(expectedNetPayout);
  });

  // ── 5. Settlement tax is always 18% of commission ─────────────────────────

  it("settlementTax is always 18% of commission regardless of which rule is active", async () => {
    const rateScenarios = [
      [{ scope: "vendor", vendorId: VENDOR_ID, category: null, rate: 0.05 }],
      [{ scope: "global", vendorId: null, category: null, rate: 0.12 }],
      [],
    ];

    for (const rules of rateScenarios) {
      state.settlements = [];
      state.order = makeOrder();
      state.commissionRules = rules as any;
      await markDelivered(app);

      const s = state.settlements[0];
      expect(s.settlementTax).toBe(Math.round(s.commission * 0.18));
    }
  });

  // ── 6. netPayout is never negative ───────────────────────────────────────

  it("netPayout is at least 0 even for a very high commission rate", async () => {
    state.commissionRules = [
      { scope: "vendor", vendorId: VENDOR_ID, category: null, rate: 0.99 },
    ];

    const res = await markDelivered(app);
    expect(res.status).toBe(200);

    const s = state.settlements[0];
    expect(s.netPayout).toBeGreaterThanOrEqual(0);
  });

});
