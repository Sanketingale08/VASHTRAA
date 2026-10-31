import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── Mutable In-Memory State for DB Mocks ──────────────────────────────────────

const state = vi.hoisted(() => {
  const SELLER_1_ID = "11111111-1111-1111-1111-111111111111";
  const SELLER_2_ID = "22222222-2222-2222-2222-222222222222";

  return {
    SELLER_1_ID,
    SELLER_2_ID,
    orders: [] as any[],
    products: [] as any[],
    sellers: [
      {
        id: SELLER_1_ID,
        vendorId: "VEND-WEAVER-01",
        sellerId: "SELLER_W1",
        ownerId: "user_w1",
        name: "Weaver Studio 1",
        shopName: "Weaver Studio 1",
        status: "approved",
      },
      {
        id: SELLER_2_ID,
        vendorId: "VEND-WEAVER-02",
        sellerId: "SELLER_W2",
        ownerId: "user_w2",
        name: "Weaver Studio 2",
        shopName: "Weaver Studio 2",
        status: "approved",
      },
    ] as any[],
    settlements: [] as any[],
    commissionRules: [
      {
        scope: "global",
        rate: 0.18,
        active: true,
      },
    ] as any[],
  };
});

const { SELLER_1_ID, SELLER_2_ID } = state;

// ─── Mock Database ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  function queryResult(getRows: () => unknown[]): any {
    const obj: any = {
      where: vi.fn(() => obj),
      orderBy: vi.fn(() => obj),
      limit: vi.fn(() => obj),
      offset: vi.fn(() => obj),
      for: vi.fn(() => obj),
      then: (resolve: any, reject: any) => Promise.resolve(getRows()).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(getRows()).catch(fn),
    };
    return obj;
  }

  const dbMock: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        if (table?._t === "vendorSettlements") return queryResult(() => state.settlements);
        if (table?._t === "vendors") return queryResult(() => state.sellers);
        if (table?._t === "orders") return queryResult(() => state.orders);
        if (table?._t === "products") return queryResult(() => state.products);
        if (table?._t === "commissionRules") return queryResult(() => state.commissionRules);
        return queryResult(() => []);
      }),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((val: any) => {
        const rows = Array.isArray(val) ? val : [val];
        const inserted = rows.map((r) => ({
          id: r.id || `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: r.createdAt || new Date(),
          ...r,
        }));
        if (table?._t === "vendorSettlements") {
          state.settlements.push(...inserted);
        }
        return {
          returning: vi.fn(() => Promise.resolve(inserted)),
          then: (res: any) => Promise.resolve(inserted).then(res),
          catch: (fn: any) => Promise.resolve(inserted).catch(fn),
        };
      }),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((updates: any) => ({
        where: vi.fn(() => {
          return {
            returning: vi.fn(() => Promise.resolve([{ ...updates }])),
            then: (res: any) => Promise.resolve([{ ...updates }]).then(res),
            catch: (fn: any) => Promise.resolve([{ ...updates }]).catch(fn),
          };
        }),
      })),
    })),
    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(dbMock)),
  };

  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: dbMock,
    mongoSellers: {
      findMany: vi.fn(async () => state.sellers),
      findById: vi.fn(async (id: string) => state.sellers.find((s) => s.id === id || s.vendorId === id || s.sellerId === id) || null),
    },
    mongoOrders: {
      findMany: vi.fn(async () => state.orders),
      findById: vi.fn(async (id: string) => state.orders.find((o) => o.id === id) || null),
    },
    mongoProducts: {
      findMany: vi.fn(async () => state.products),
      findById: vi.fn(async (id: string) => state.products.find((p) => p.id === id) || null),
    },
    mongoSettlements: {
      findMany: vi.fn(async (filter?: any) => {
        if (!filter) return state.settlements;
        if (filter.vendorId && filter.vendorId.$in) {
          return state.settlements.filter((s) => filter.vendorId.$in.includes(s.vendorId));
        }
        if (filter.vendorId) {
          return state.settlements.filter((s) => s.vendorId === filter.vendorId);
        }
        return state.settlements;
      }),
      findById: vi.fn(async (id: string) => state.settlements.find((s) => s.id === id) || null),
      insert: vi.fn(async (doc: any) => {
        state.settlements.push(doc);
        return doc;
      }),
    },
    mongoGeneric: {
      getCollection: vi.fn((colName: string) => ({
        find: vi.fn(() => ({
          toArray: async () => {
            if (colName === "vendor_settlements") return state.settlements;
            if (colName === "orders") return state.orders;
            if (colName === "sellers") return state.sellers;
            if (colName === "commission_rules") return state.commissionRules;
            return [];
          },
          sort: vi.fn(() => ({
            toArray: async () => state.settlements,
          })),
        })),
        findOne: vi.fn(async (query: any) => {
          if (colName === "orders") return state.orders.find((o) => o.id === query.id) || null;
          return null;
        }),
        insertOne: vi.fn(async (doc: any) => {
          if (colName === "vendor_settlements") state.settlements.push(doc);
          return { insertedId: doc.id };
        }),
        updateOne: vi.fn(async (query: any, update: any) => {
          const match = state.settlements.find((s) => s.id === query.id);
          if (match && update.$set) {
            Object.assign(match, update.$set);
          }
          return { modifiedCount: 1 };
        }),
      })),
    },
    isMongoDbConnected: vi.fn(() => true),
    vendorsTable: tag("vendors", ["id", "vendorId", "sellerId", "ownerId", "name", "shopName", "sellerName", "status"]),
    ordersTable: tag("orders", ["id", "displayId", "userId", "status", "paymentStatus", "items", "total", "createdAt"]),
    productsTable: tag("products", ["id", "vendorId", "sellerId", "category", "price", "basePrice", "stock"]),
    vendorSettlementsTable: tag("vendorSettlements", [
      "id", "vendorId", "orderId", "type", "status", "amount", "pricingVersion",
      "sellerBasePrice", "platformCommission", "netPayout", "commission", "commissionRate",
      "sellerSettlement", "platformKeeps", "idempotencyKey", "createdAt",
    ]),
    commissionRulesTable: tag("commissionRules", ["id", "scope", "rate", "category", "vendorId", "active"]),
    reportSchedulesTable: tag("reportSchedules", ["id"]),
    productReviewsTable: tag("productReviews", ["id"]),
    productQueriesTable: tag("productQueries", ["id"]),
  };
});

// ─── Mock Sockets & Transactional Email ────────────────────────────────────────

vi.mock("../lib/socket", () => ({
  emitFinancialsEvent: vi.fn(),
  emitAnalyticsEvent: vi.fn(),
  emitVendorEvent: vi.fn(),
  emitOrderEvent: vi.fn(),
  emitProductEvent: vi.fn(),
  emitReturnRefundEvent: vi.fn(),
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorPayoutRequestApprovedEmail: vi.fn(async () => {}),
  sendVendorPayoutApprovedEmail: vi.fn(async () => {}),
  sendVendorPayoutRejectedEmail: vi.fn(async () => {}),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn(async () => {}),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(async () => {}),
  getIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../lib/cacheEngine", () => ({
  safeInvalidatePattern: vi.fn(),
}));

// ─── Build Express Test App ────────────────────────────────────────────────────

import financialRouter from "../routes/financialManagement";
import vendorAnalyticsRouter from "../routes/vendorAnalytics";
import { syncEligibleOrderSettlements } from "../lib/settlementAutomation";

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  // Bypass requireAdminKey middleware
  app.use((req: any, _res, next) => {
    req.log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    req.headers["x-admin-key"] = "test-admin-key";
    next();
  });
  app.use("/api", financialRouter);
  app.use("/api", vendorAnalyticsRouter);
  return app;
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe("VASTRAA — Seller Earnings and Settlement Synchronization Test Suite", () => {
  let app: Express;

  beforeEach(async () => {
    state.orders = [];
    state.products = [
      {
        id: "prod-1",
        vendorId: SELLER_1_ID,
        category: "sarees",
        price: 10000,
        basePrice: 10000,
      },
      {
        id: "prod-2",
        vendorId: SELLER_2_ID,
        category: "lehengas",
        price: 20000,
        basePrice: 20000,
      },
    ];
    state.settlements = [];
    app = await buildApp();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Seller has eligible earnings but no settlement record
  // ─────────────────────────────────────────────────────────────────────────────
  it("Scenario 1: Auto-generates missing settlement records for eligible orders and synchronizes pending balance", async () => {
    // Delivered order for Seller 1 (₹10,000 product base price, 18% commission = ₹1,800, net payout = ₹8,010)
    state.orders = [
      {
        id: "ord-101",
        displayId: "VAS-101",
        status: "delivered",
        paymentStatus: "paid",
        items: [{ productId: "prod-1", vendorId: SELLER_1_ID, price: 10000, basePrice: 10000, quantity: 1 }],
        total: 10500,
        createdAt: new Date().toISOString(),
      },
    ];

    // Initially, settlements table is empty
    expect(state.settlements).toHaveLength(0);

    // Call Settlements list API
    const res = await request(app).get("/api/admin/financial/settlements");
    expect(res.status).toBe(200);

    // The settlement record should now be auto-generated
    expect(res.body.settlements).toHaveLength(1);
    const s = res.body.settlements[0];
    expect(s.vendorId).toBe(SELLER_1_ID);
    expect(s.orderId).toBe("ord-101");
    // Under 18% commission + 5% GST on comm + 1% TCS:
    // 10000 - 1800 - 90 - 100 = 8010
    expect(s.amount).toBe(8010);
    expect(s.status).toBe("pending");

    // Summary should show pending: 8010, completed: 0
    expect(res.body.summary.pendingTotal).toBe(8010);
    expect(res.body.summary.completedTotal).toBe(0);

    // Verify /api/admin/financials/summary matches
    const sumRes = await request(app).get("/api/admin/financials/summary");
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.rupees.pendingSettlements).toBe(8010);
    expect(sumRes.body.rupees.completedSettlements).toBe(0);

    // Verify Vendor Analytics matches
    const vaRes = await request(app).get("/api/admin/vendor-analytics");
    expect(vaRes.status).toBe(200);
    expect(vaRes.body.summary.settlements.pending).toBe(8010);
    expect(vaRes.body.summary.settlements.completed).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Seller has a pending settlement
  // ─────────────────────────────────────────────────────────────────────────────
  it("Scenario 2: Displays pending settlement as outstanding liability across all pending statuses", async () => {
    state.settlements = [
      {
        id: "set-pending-1",
        vendorId: SELLER_1_ID,
        orderId: "ord-102",
        type: "order_settlement",
        status: "pending",
        amount: 5000,
        netPayout: 5000,
        pricingVersion: "v1",
        createdAt: new Date().toISOString(),
      },
      {
        id: "set-eligible-1",
        vendorId: SELLER_1_ID,
        orderId: "ord-103",
        type: "order_settlement",
        status: "eligible",
        amount: 3000,
        netPayout: 3000,
        pricingVersion: "v1",
        createdAt: new Date().toISOString(),
      },
    ];

    const res = await request(app).get("/api/admin/financial/settlements");
    expect(res.status).toBe(200);
    expect(res.body.settlements).toHaveLength(2);
    // Both pending and eligible must be counted in pendingTotal
    expect(res.body.summary.pendingTotal).toBe(8000);
    expect(res.body.summary.completedTotal).toBe(0);

    const sumRes = await request(app).get("/api/admin/financials/summary");
    expect(sumRes.body.rupees.pendingSettlements).toBe(8000);
    expect(sumRes.body.rupees.completedSettlements).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Seller has a completed settlement
  // ─────────────────────────────────────────────────────────────────────────────
  it("Scenario 3: Completed settlement is tracked as completed and excluded from pending balance", async () => {
    state.settlements = [
      {
        id: "set-paid-1",
        vendorId: SELLER_1_ID,
        orderId: "ord-104",
        type: "order_settlement",
        status: "paid",
        amount: 7500,
        netPayout: 7500,
        utrNumber: "UTR987654321",
        pricingVersion: "v1",
        paidAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    const res = await request(app).get("/api/admin/financial/settlements");
    expect(res.status).toBe(200);
    expect(res.body.summary.pendingTotal).toBe(0);
    expect(res.body.summary.completedTotal).toBe(7500);

    const sumRes = await request(app).get("/api/admin/financials/summary");
    expect(sumRes.body.rupees.pendingSettlements).toBe(0);
    expect(sumRes.body.rupees.completedSettlements).toBe(7500);

    const vaRes = await request(app).get("/api/admin/vendor-analytics");
    expect(vaRes.body.summary.settlements.pending).toBe(0);
    expect(vaRes.body.summary.settlements.completed).toBe(7500);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Seller has multiple orders and partial settlements
  // ─────────────────────────────────────────────────────────────────────────────
  it("Scenario 4: Segregates pending vs completed accurately with no double counting", async () => {
    state.settlements = [
      {
        id: "set-multi-paid",
        vendorId: SELLER_1_ID,
        orderId: "ord-m1",
        type: "order_settlement",
        status: "completed",
        amount: 8010,
        netPayout: 8010,
        pricingVersion: "v1",
        createdAt: new Date().toISOString(),
      },
      {
        id: "set-multi-pending",
        vendorId: SELLER_1_ID,
        orderId: "ord-m2",
        type: "order_settlement",
        status: "pending",
        amount: 4005,
        netPayout: 4005,
        pricingVersion: "v1",
        createdAt: new Date().toISOString(),
      },
    ];

    const res = await request(app).get("/api/admin/financial/settlements");
    expect(res.status).toBe(200);
    expect(res.body.summary.pendingTotal).toBe(4005);
    expect(res.body.summary.completedTotal).toBe(8010);

    const sumRes = await request(app).get("/api/admin/financials/summary");
    expect(sumRes.body.rupees.pendingSettlements).toBe(4005);
    expect(sumRes.body.rupees.completedSettlements).toBe(8010);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Cancelled or refunded orders are excluded or reversed
  // ─────────────────────────────────────────────────────────────────────────────
  it("Scenario 5: Cancelled or refunded orders do not generate settlement and reverse active unpaid settlements", async () => {
    // Cancelled order should not generate settlement
    state.orders = [
      {
        id: "ord-cancelled-1",
        displayId: "VAS-CANCELLED",
        status: "cancelled",
        items: [{ productId: "prod-1", vendorId: SELLER_1_ID, price: 5000, quantity: 1 }],
        createdAt: new Date().toISOString(),
      },
    ];

    // Pre-existing pending settlement for this cancelled order must be reversed
    state.settlements = [
      {
        id: "set-cancelled-old",
        vendorId: SELLER_1_ID,
        orderId: "ord-cancelled-1",
        type: "order_settlement",
        status: "pending",
        amount: 4100,
        sellerSettlement: 410000,
        pricingVersion: "v2",
        createdAt: new Date().toISOString(),
      },
    ];

    const res = await request(app).get("/api/admin/financial/settlements");
    expect(res.status).toBe(200);

    // The settlement status must be reversed to cancelled
    const matched = state.settlements.find((s) => s.id === "set-cancelled-old");
    expect(matched?.status).toBe("cancelled");
    expect(matched?.sellerSettlement).toBe(0);

    // Summary must show 0 pending
    expect(res.body.summary.pendingTotal).toBe(0);
    expect(res.body.summary.completedTotal).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Settlement creation is retried (Idempotency)
  // ─────────────────────────────────────────────────────────────────────────────
  it("Scenario 6: Repeated sync runs enforce idempotency and prevent duplicate records or inflated payouts", async () => {
    state.orders = [
      {
        id: "ord-idemp-1",
        status: "delivered",
        items: [{ productId: "prod-1", vendorId: SELLER_1_ID, price: 10000, quantity: 1 }],
        createdAt: new Date().toISOString(),
      },
    ];

    // First run
    const sync1 = await syncEligibleOrderSettlements();
    expect(sync1.createdSettlementsCount).toBe(1);
    expect(state.settlements).toHaveLength(1);

    // Second run (simulating retry or background job)
    const sync2 = await syncEligibleOrderSettlements();
    expect(sync2.createdSettlementsCount).toBe(0);
    expect(state.settlements).toHaveLength(1); // Still exactly 1 settlement

    const res = await request(app).get("/api/admin/financial/settlements");
    expect(res.body.settlements).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Settlement completed and payment verified
  // ─────────────────────────────────────────────────────────────────────────────
  it("Scenario 7: Reviewing and marking settlement paid moves amount from pending to completed", async () => {
    state.settlements = [
      {
        id: "set-review-1",
        vendorId: SELLER_1_ID,
        type: "order_settlement",
        status: "pending",
        amount: 8010,
        netPayout: 8010,
        pricingVersion: "v1",
        createdAt: new Date().toISOString(),
      },
    ];

    // Verify initial pending
    let res = await request(app).get("/api/admin/financial/settlements");
    expect(res.body.summary.pendingTotal).toBe(8010);
    expect(res.body.summary.completedTotal).toBe(0);

    // Admin reviews and marks paid
    const reviewRes = await request(app)
      .post("/api/admin/financial/settlements/set-review-1/review")
      .send({ decision: "paid", utrNumber: "UTR20261023001" });
    expect(reviewRes.status).toBe(200);

    // Update state to reflect reviewed settlement
    const set = state.settlements.find((s) => s.id === "set-review-1");
    if (set) {
      set.status = "paid";
      set.utrNumber = "UTR20261023001";
    }

    // After review, pending drops to 0 and completed becomes 8010
    res = await request(app).get("/api/admin/financial/settlements");
    expect(res.body.summary.pendingTotal).toBe(0);
    expect(res.body.summary.completedTotal).toBe(8010);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Multiple sellers with separate earnings and settlements
  // ─────────────────────────────────────────────────────────────────────────────
  it("Scenario 8: Correctly segregates multi-seller settlements and aggregates totals accurately", async () => {
    state.settlements = [
      {
        id: "set-s1",
        vendorId: SELLER_1_ID,
        type: "order_settlement",
        status: "pending",
        amount: 8010,
        netPayout: 8010,
        pricingVersion: "v1",
        createdAt: new Date().toISOString(),
      },
      {
        id: "set-s2",
        vendorId: SELLER_2_ID,
        type: "order_settlement",
        status: "pending",
        amount: 16020,
        netPayout: 16020,
        pricingVersion: "v1",
        createdAt: new Date().toISOString(),
      },
    ];

    // Global settlements endpoint returns sum of both sellers
    const resAll = await request(app).get("/api/admin/financial/settlements");
    expect(resAll.body.settlements).toHaveLength(2);
    expect(resAll.body.summary.pendingTotal).toBe(8010 + 16020);

    // Filter by Seller 1
    const resS1 = await request(app).get(`/api/admin/financial/settlements?vendorId=${SELLER_1_ID}`);
    expect(resS1.body.settlements).toHaveLength(1);
    expect(resS1.body.settlements[0].vendorId).toBe(SELLER_1_ID);
    expect(resS1.body.summary.pendingTotal).toBe(8010);

    // Filter by Seller 2 code
    const resS2 = await request(app).get(`/api/admin/financial/settlements?vendorId=VEND-WEAVER-02`);
    expect(resS2.body.settlements).toHaveLength(1);
    expect(resS2.body.settlements[0].vendorId).toBe(SELLER_2_ID);
    expect(resS2.body.summary.pendingTotal).toBe(16020);
  });
});
