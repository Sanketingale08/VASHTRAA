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
  /**
   * When non-null, overrides `product` for the products mock — use this
   * to inject multi-product / multi-vendor scenarios.
   */
  products: null as any[] | null,
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
            where: vi.fn(() => queryResult(() => state.products ?? [state.product])),
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
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
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
    state.products = null; // reset to single-product mode
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

// ─── Multi-vendor settlement tests ───────────────────────────────────────────

/**
 * Two-vendor order: one order whose items belong to two different vendors.
 * When marked as delivered the route must create exactly two settlement rows —
 * one per vendor — with productAmount and netPayout computed independently for
 * each vendor's share of the order.
 */

const VENDOR_A_ID = "vendor-multi-a";
const VENDOR_B_ID = "vendor-multi-b";
const PRODUCT_A_ID = "prod-multi-a";
const PRODUCT_B_ID = "prod-multi-b";
const PRICE_A = 6_000;
const PRICE_B = 4_000;
const QTY_A = 1;
const QTY_B = 1;
const MULTI_SHIPPING = 199;

function makeMultiVendorOrder() {
  return {
    id: ORDER_ID,
    userId: USER_ID,
    status: "dispatched",
    statusHistory: [],
    items: [
      { productId: PRODUCT_A_ID, name: "Kanjivaram Silk", price: PRICE_A, quantity: QTY_A },
      { productId: PRODUCT_B_ID, name: "Banarasi Cotton", price: PRICE_B, quantity: QTY_B },
    ],
    shipping: MULTI_SHIPPING,
    subtotal: PRICE_A * QTY_A + PRICE_B * QTY_B,
  };
}

describe("Settlement-on-delivery — multi-vendor orders", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.order = makeMultiVendorOrder();
    state.products = [
      { id: PRODUCT_A_ID, vendorId: VENDOR_A_ID, category: "sarees" },
      { id: PRODUCT_B_ID, vendorId: VENDOR_B_ID, category: "sarees" },
    ];
    state.settlements = [];
    state.notifications = [];
    state.notifIdCounter = 0;
    state.commissionRules = []; // default 10%
    app = await buildApp();
  });

  it("creates exactly two settlement rows — one per vendor", async () => {
    const res = await markDelivered(app);
    expect(res.status).toBe(200);
    expect(state.settlements).toHaveLength(2);
  });

  it("each settlement is associated with the correct vendor", async () => {
    await markDelivered(app);
    const vendorIds = state.settlements.map((s: any) => s.vendorId).sort();
    expect(vendorIds).toEqual([VENDOR_A_ID, VENDOR_B_ID].sort());
  });

  it("productAmount for each vendor matches only their own items", async () => {
    await markDelivered(app);

    const sA = state.settlements.find((s: any) => s.vendorId === VENDOR_A_ID);
    const sB = state.settlements.find((s: any) => s.vendorId === VENDOR_B_ID);

    expect(sA).toBeDefined();
    expect(sB).toBeDefined();
    expect(sA.productAmount).toBe(PRICE_A * QTY_A); // 6000
    expect(sB.productAmount).toBe(PRICE_B * QTY_B); // 4000
  });

  it("shipping is split proportionally to each vendor's productAmount", async () => {
    await markDelivered(app);

    const orderSubtotal = PRICE_A * QTY_A + PRICE_B * QTY_B; // 10000
    const sA = state.settlements.find((s: any) => s.vendorId === VENDOR_A_ID)!;
    const sB = state.settlements.find((s: any) => s.vendorId === VENDOR_B_ID)!;

    const expectedShippingA = Math.round(MULTI_SHIPPING * (PRICE_A * QTY_A) / orderSubtotal); // round(119.4) = 119
    const expectedShippingB = Math.round(MULTI_SHIPPING * (PRICE_B * QTY_B) / orderSubtotal); // round(79.6)  = 80

    expect(sA.shippingCharge).toBe(expectedShippingA);
    expect(sB.shippingCharge).toBe(expectedShippingB);
  });

  it("netPayout is computed correctly for each vendor at the default 10% commission", async () => {
    await markDelivered(app);

    const orderSubtotal = PRICE_A * QTY_A + PRICE_B * QTY_B; // 10000

    const sA = state.settlements.find((s: any) => s.vendorId === VENDOR_A_ID)!;
    const sB = state.settlements.find((s: any) => s.vendorId === VENDOR_B_ID)!;

    // Vendor A
    const commA = Math.round(PRICE_A * QTY_A * 0.10);                                    // 600
    const shipA = Math.round(MULTI_SHIPPING * (PRICE_A * QTY_A) / orderSubtotal);        // 119
    const taxA  = Math.round(commA * 0.18);                                               // 108
    const netA  = Math.max(0, PRICE_A * QTY_A - commA - shipA - taxA);                   // 5173

    expect(sA.commissionRate).toBe(0.10);
    expect(sA.commission).toBe(commA);
    expect(sA.settlementTax).toBe(taxA);
    expect(sA.netPayout).toBe(netA);

    // Vendor B
    const commB = Math.round(PRICE_B * QTY_B * 0.10);                                    // 400
    const shipB = Math.round(MULTI_SHIPPING * (PRICE_B * QTY_B) / orderSubtotal);        // 80
    const taxB  = Math.round(commB * 0.18);                                               // 72
    const netB  = Math.max(0, PRICE_B * QTY_B - commB - shipB - taxB);                   // 3448

    expect(sB.commissionRate).toBe(0.10);
    expect(sB.commission).toBe(commB);
    expect(sB.settlementTax).toBe(taxB);
    expect(sB.netPayout).toBe(netB);
  });

  it("vendor-specific commission rules are applied per-vendor independently", async () => {
    // Vendor A has a custom 20% rule; Vendor B falls back to default 10%
    state.commissionRules = [
      { scope: "vendor", vendorId: VENDOR_A_ID, category: null, rate: 0.20 },
    ];

    await markDelivered(app);

    const sA = state.settlements.find((s: any) => s.vendorId === VENDOR_A_ID)!;
    const sB = state.settlements.find((s: any) => s.vendorId === VENDOR_B_ID)!;

    expect(sA.commissionRate).toBe(0.20);
    expect(sB.commissionRate).toBe(0.10);
  });
});
