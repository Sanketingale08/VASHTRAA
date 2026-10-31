/**
 * GET /seller/settlements — payout summary totals
 *
 * Verifies that the endpoint correctly aggregates:
 *  - totalPending  : sum of netPayout for status in ['pending', 'processing', 'approved']
 *  - totalPaid     : sum of netPayout for status in ['paid', 'completed']
 *  - totalEarnedThisMonth : sum of netPayout for settlements whose createdAt falls
 *                           within the current calendar month
 *
 * Uses in-memory mocks — no live database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── Mutable test state ───────────────────────────────────────────────────────

const VENDOR_ID = "vendor-settlements-test-1";
const OWNER_ID  = "owner-settlements-test-1";

const state = vi.hoisted(() => ({
  settlements: [] as any[],
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  function queryResult(getRows: () => unknown[]): any {
    const obj: any = {
      where:   vi.fn(() => obj),
      orderBy: vi.fn(() => obj),
      limit:   vi.fn(() => obj),
      offset:  vi.fn(() => obj),
      for:     vi.fn(() => obj),
      then:    (resolve: any, reject: any) => Promise.resolve(getRows()).then(resolve, reject),
      catch:   (fn: any) => Promise.resolve(getRows()).catch(fn),
    };
    return obj;
  }

  const dbMock: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        if (table?._t === "vendorSettlements") {
          return queryResult(() => state.settlements);
        }
        if (table?._t === "vendors") {
          return queryResult(() => [
            { id: VENDOR_ID, ownerId: OWNER_ID, status: "active", name: "Test Vendor" },
          ]);
        }
        return queryResult(() => []);
      }),
    })),
    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb({})),
  };

  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: dbMock,
    vendorSettlementsTable: tag("vendorSettlements", [
      "id", "vendorId", "orderId", "type", "status",
      "amount", "productAmount", "commission", "commissionRate",
      "shippingCharge", "settlementTax", "netPayout", "createdAt",
    ]),
    vendorsTable: tag("vendors", ["id", "ownerId", "status", "name"]),
    ordersTable:  tag("orders",  ["id", "userId"]),
    productsTable: tag("products", ["id", "vendorId"]),
    isMongoDbConnected: vi.fn(() => false),
  };
});

// ─── Vendor auth mock — bypass middleware DB + Clerk lookups entirely ─────────

vi.mock("../middlewares/requireVendorAuth", () => ({
  requireVendorAuth: (req: any, _res: any, next: () => void) => {
    req.vendorId = VENDOR_ID;
    req.vendor   = { id: VENDOR_ID, ownerId: OWNER_ID, status: "active", name: "Test Vendor" };
    next();
  },
}));

// ─── Auth mock (still needed by other imports in the route chain) ─────────────

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// ─── Other dependency mocks ───────────────────────────────────────────────────

vi.mock("../lib/transactionalEmail", () => ({
  sendTransactionalEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/stockHistory", () => ({
  recordStockChange: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/orderNotifications", () => ({
  insertOrderStatusNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/commission", () => ({
  loadActiveCommissionRules: vi.fn(() => Promise.resolve([])),
  effectiveRateFromRules: vi.fn(() => 0.10),
}));

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: unknown, next: () => void) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  const { default: sellerRouter } = await import("../routes/seller");
  app.use("/api", sellerRouter);
  return app;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function thisMonth(dayOffset = 0): string {
  const d = new Date();
  d.setDate(1 + dayOffset);
  return d.toISOString();
}

function lastMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  d.setDate(15);
  return d.toISOString();
}

function makeSettlement(overrides: Record<string, unknown> = {}) {
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    vendorId: VENDOR_ID,
    orderId: "order-test-1",
    type: "settlement",
    status: "pending",
    amount: 5000,
    productAmount: 5000,
    commission: 500,
    commissionRate: 0.10,
    shippingCharge: 99,
    settlementTax: 90,
    netPayout: 4311,
    createdAt: thisMonth(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /seller/settlements — payout summary totals", () => {
  let app: Express;

  beforeEach(async () => {
    state.settlements = [];
    app = await buildApp();
  });

  // ── 1. totalPending counts pending, processing, and approved ─────────────

  it("totalPending sums netPayout for pending, processing, and approved settlements", async () => {
    state.settlements = [
      makeSettlement({ status: "pending",    netPayout: 1000 }),
      makeSettlement({ status: "processing", netPayout: 2000 }),
      makeSettlement({ status: "approved",   netPayout: 500  }),
      makeSettlement({ status: "paid",       netPayout: 9999 }), // must NOT be counted
    ];

    const res = await request(app).get("/api/seller/settlements");
    expect(res.status).toBe(200);
    expect(res.body.summary.totalPending).toBe(3500);
  });

  // ── 2. totalPaid counts paid and completed ────────────────────────────────

  it("totalPaid sums netPayout for paid and completed settlements", async () => {
    state.settlements = [
      makeSettlement({ status: "paid",      netPayout: 4000 }),
      makeSettlement({ status: "completed", netPayout: 1500 }),
      makeSettlement({ status: "pending",   netPayout: 8888 }), // must NOT be counted
    ];

    const res = await request(app).get("/api/seller/settlements");
    expect(res.status).toBe(200);
    expect(res.body.summary.totalPaid).toBe(5500);
  });

  // ── 3. totalEarnedThisMonth excludes last-month settlements ───────────────

  it("totalEarnedThisMonth only counts settlements created in the current calendar month", async () => {
    state.settlements = [
      makeSettlement({ netPayout: 3000, createdAt: thisMonth()    }),
      makeSettlement({ netPayout: 7000, createdAt: thisMonth(5)   }),
      makeSettlement({ netPayout: 9999, createdAt: lastMonth()    }), // must NOT be counted
    ];

    const res = await request(app).get("/api/seller/settlements");
    expect(res.status).toBe(200);
    expect(res.body.summary.totalEarnedThisMonth).toBe(10000);
  });

  // ── 4. All three totals work correctly together ───────────────────────────

  it("computes all three summary fields correctly from a mixed set of settlements", async () => {
    // This month, various statuses
    const thisMonthPending    = makeSettlement({ status: "pending",    netPayout: 1200, createdAt: thisMonth()  });
    const thisMonthProcessing = makeSettlement({ status: "processing", netPayout: 800,  createdAt: thisMonth()  });
    const thisMonthPaid       = makeSettlement({ status: "paid",       netPayout: 5000, createdAt: thisMonth()  });
    const thisMonthCompleted  = makeSettlement({ status: "completed",  netPayout: 2500, createdAt: thisMonth()  });
    // Last month
    const lastMonthPaid       = makeSettlement({ status: "paid",       netPayout: 999,  createdAt: lastMonth()  });
    const lastMonthPending    = makeSettlement({ status: "pending",    netPayout: 333,  createdAt: lastMonth()  });

    state.settlements = [
      thisMonthPending,
      thisMonthProcessing,
      thisMonthPaid,
      thisMonthCompleted,
      lastMonthPaid,
      lastMonthPending,
    ];

    const res = await request(app).get("/api/seller/settlements");
    expect(res.status).toBe(200);

    const { summary } = res.body;

    // totalEarnedThisMonth: all four this-month records
    expect(summary.totalEarnedThisMonth).toBe(1200 + 800 + 5000 + 2500);

    // totalPending: pending + processing across all months
    expect(summary.totalPending).toBe(1200 + 800 + 333);

    // totalPaid: paid + completed across all months
    expect(summary.totalPaid).toBe(5000 + 2500 + 999);
  });

  // ── 5. Falls back to `amount` when netPayout is null ─────────────────────

  it("uses `amount` as fallback when netPayout is null or undefined", async () => {
    state.settlements = [
      makeSettlement({ status: "pending", netPayout: null,      amount: 4000 }),
      makeSettlement({ status: "pending", netPayout: undefined,  amount: 1000 }),
    ];

    const res = await request(app).get("/api/seller/settlements");
    expect(res.status).toBe(200);
    expect(res.body.summary.totalPending).toBe(5000);
  });

  // ── 6. Empty result returns zero totals ───────────────────────────────────

  it("returns zero totals when the vendor has no settlements", async () => {
    state.settlements = [];

    const res = await request(app).get("/api/seller/settlements");
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      totalEarnedThisMonth: 0,
      totalPending: 0,
      totalPaid: 0,
    });
  });
});
