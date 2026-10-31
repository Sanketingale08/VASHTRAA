import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const state = vi.hoisted(() => {
  const VENDOR_UUID = "123e4567-e89b-12d3-a456-426614174000";
  const VENDOR_CODE = "VEND-YEOLA-01";
  const SELLER_ID = "SELLER_999";
  const OWNER_ID = "user_clerk_123";
  const SHOP_NAME = "Yeola Paithani Heritage";

  return {
    VENDOR_UUID,
    VENDOR_CODE,
    SELLER_ID,
    OWNER_ID,
    SHOP_NAME,
    settlements: [] as any[],
    vendors: [
      {
        id: VENDOR_UUID,
        vendorId: VENDOR_CODE,
        sellerId: SELLER_ID,
        ownerId: OWNER_ID,
        name: "Sanket Weaves",
        shopName: SHOP_NAME,
        sellerName: "Sanket Weaves",
        status: "approved",
      },
    ],
  };
});

const { VENDOR_UUID, VENDOR_CODE, SELLER_ID, OWNER_ID, SHOP_NAME } = state;

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
        if (table?._t === "vendorSettlements") {
          return queryResult(() => state.settlements);
        }
        if (table?._t === "vendors") {
          return queryResult(() => state.vendors);
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
    mongoSellers: {
      findMany: vi.fn(async () => state.vendors),
      findById: vi.fn(async (id: string) => {
        return state.vendors.find(
          (v) =>
            v.id === id ||
            v.vendorId === id ||
            v.sellerId === id ||
            v.ownerId === id
        ) || null;
      }),
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
    },
    mongoGeneric: {
      getCollection: vi.fn(() => ({
        find: vi.fn(() => ({
          sort: vi.fn(() => ({
            toArray: vi.fn(async () => state.settlements),
          })),
          toArray: vi.fn(async () => state.settlements),
        })),
        findOne: vi.fn(async () => null),
      })),
    },
    isMongoDbConnected: vi.fn(() => true),
    vendorSettlementsTable: tag("vendorSettlements", [
      "id", "vendorId", "orderId", "type", "status",
      "amount", "productAmount", "commission", "commissionRate",
      "shippingCharge", "settlementTax", "netPayout", "createdAt",
    ]),
    vendorsTable: tag("vendors", ["id", "ownerId", "status", "name", "shopName", "sellerId"]),
    ordersTable: tag("orders", ["id", "userId"]),
    productsTable: tag("products", ["id", "vendorId"]),
    commissionRulesTable: tag("commissionRules", ["id", "active"]),
    inArray: vi.fn((col, vals) => ({ col, vals })),
    eq: vi.fn((a, b) => ({ a, b })),
    desc: vi.fn((c) => c),
    and: vi.fn((...args) => args),
  };
});

vi.mock("../middlewares/requireVendorAuth", () => ({
  requireVendorAuth: (req: any, _res: any, next: () => void) => {
    // Authenticated seller has vendorId set to vendor code VEND-YEOLA-01
    req.vendorId = VENDOR_CODE;
    req.sellerId = SELLER_ID;
    req.userId = OWNER_ID;
    req.vendor = state.vendors[0];
    next();
  },
}));

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (req: any, _res: any, next: () => void) => {
    req.adminId = "admin-test";
    next();
  },
}));

vi.mock("../lib/commission", () => ({
  loadActiveCommissionRules: vi.fn(() => Promise.resolve([])),
  effectiveRateFromRules: vi.fn(() => 0.10),
  DEFAULT_COMMISSION_RATE: 0.10,
  getEffectiveCommissionRate: vi.fn(() => 0.10),
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendTransactionalEmail: vi.fn(() => Promise.resolve()),
  sendVendorPayoutApprovedEmail: vi.fn(() => Promise.resolve()),
  sendVendorPayoutRequestApprovedEmail: vi.fn(() => Promise.resolve()),
  sendVendorPayoutRejectedEmail: vi.fn(() => Promise.resolve()),
}));

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: unknown, next: () => void) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  const { default: sellerRouter } = await import("../routes/seller");
  const { default: finRouter } = await import("../routes/financialManagement");
  app.use("/api", sellerRouter);
  app.use("/api", finRouter);
  return app;
}

describe("Seller to Admin Settlement Mapping & Alias Resolution", () => {
  let app: Express;

  beforeEach(async () => {
    state.settlements = [
      {
        id: "settle-1",
        vendorId: VENDOR_UUID, // recorded under Postgres UUID
        orderId: "order-101",
        type: "order_settlement",
        status: "pending",
        amount: 2500,
        netPayout: 2200,
        createdAt: new Date().toISOString(),
      },
      {
        id: "settle-2",
        vendorId: VENDOR_CODE, // recorded under vendor code
        orderId: "order-102",
        type: "order_settlement",
        status: "paid",
        amount: 3000,
        netPayout: 2700,
        createdAt: new Date().toISOString(),
      },
      {
        id: "settle-3",
        vendorId: SELLER_ID, // recorded under sellerId
        orderId: "order-103",
        type: "order_settlement",
        status: "approved",
        amount: 1500,
        netPayout: 1350,
        createdAt: new Date().toISOString(),
      },
    ];
    app = await buildApp();
  });

  it("seller settlements endpoint retrieves settlements recorded under all vendor aliases", async () => {
    const res = await request(app).get("/api/seller/settlements");
    expect(res.status).toBe(200);
    // All 3 settlements should be found regardless of whether vendorId, vendor code, or sellerId was stored
    expect(res.body.total).toBe(3);
    expect(res.body.settlements).toHaveLength(3);
    expect(res.body.summary.totalPaid).toBe(2700);
    expect(res.body.summary.totalPending).toBe(2200 + 1350);
  });

  it("seller payouts endpoint aggregates settlements across all vendor aliases", async () => {
    const res = await request(app).get("/api/seller/payouts");
    expect(res.status).toBe(200);
    expect(res.body.payouts).toHaveLength(3);
    expect(res.body.lifetimeEarnings).toBe(2700);
    expect(res.body.pendingBalance).toBe(2200 + 1350);
  });

  it("admin settlements list correctly resolves vendorName, shopName, and sellerId across aliases", async () => {
    const res = await request(app).get("/api/admin/financial/settlements");
    expect(res.status).toBe(200);
    expect(res.body.settlements).toHaveLength(3);
    for (const item of res.body.settlements) {
      expect(item.vendorName).toBe(SHOP_NAME);
      expect(item.shopName).toBe(SHOP_NAME);
      expect(item.sellerId).toBe(SELLER_ID);
    }
  });

  it("admin settlements list filters accurately when queried by vendor UUID or vendor code", async () => {
    const resByCode = await request(app).get(`/api/admin/financial/settlements?vendorId=${VENDOR_CODE}`);
    expect(resByCode.status).toBe(200);
    expect(resByCode.body.settlements).toHaveLength(3);

    const resByUuid = await request(app).get(`/api/admin/financial/settlements?vendorId=${VENDOR_UUID}`);
    expect(resByUuid.status).toBe(200);
    expect(resByUuid.body.settlements).toHaveLength(3);
  });

  it("admin financial ledger maps vendorName and filters by seller alias", async () => {
    const res = await request(app).get(`/api/admin/financials/ledger?seller=${VENDOR_CODE}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(3);
    for (const row of res.body.ledger) {
      expect(row.vendorName).toBe(SHOP_NAME);
      expect(row.sellerId).toBe(SELLER_ID);
    }
  });
});
