/**
 * Settlement creation on order delivery — integration test.
 *
 * Goal: confirm that when an admin marks an order as "delivered", a
 * vendor_settlements row is created with correct productAmount, commission,
 * and netPayout values, and the record is surfaced by GET /seller/settlements.
 *
 * Math for the test fixture (price=10000, qty=2, no commission rules → 10% default):
 *   productAmount  = 10000 * 2 = 20000
 *   commissionRate = 0.10
 *   commission     = round(20000 * 0.10) = 2000
 *   shippingCharge = 0  (order.shipping is 0)
 *   settlementTax  = round(2000 * 0.18) = 360
 *   netPayout      = 20000 - 2000 - 0 - 360 = 17640
 *
 * Uses an in-memory @workspace/db mock — no live database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const ADMIN_KEY = "test-admin-key-settlement";
const VENDOR_OWNER_ID = "vendor-owner-settle-1";
const VENDOR_ID = "vendor-settle-uuid-1";
const ORDER_ID = "order-settle-uuid-1";
const PRODUCT_ID = "prod-settle-uuid-1";

const state = vi.hoisted(() => ({
  order: {
    id: "order-settle-uuid-1",
    userId: "user-buyer-settle-1",
    status: "confirmed" as string,
    statusHistory: [] as any[],
    items: [{ productId: "prod-settle-uuid-1", price: 10000, quantity: 2 }],
    shipping: 0,
    updatedAt: new Date(),
    deliveredAt: null as Date | null,
    cancelReason: null as string | null,
  },
  product: {
    id: "prod-settle-uuid-1",
    stock: 10,
    vendorId: "vendor-settle-uuid-1",
    category: "sarees",
  },
  vendor: {
    id: "vendor-settle-uuid-1",
    ownerId: "vendor-owner-settle-1",
    status: "active",
  },
  settlements: [] as any[],
  settlementIdCounter: 0,
  notifications: [] as any[],
  notifIdCounter: 0,
}));

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

  function makeSelectChain(getRows: () => unknown[]) {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => queryResult(getRows)),
      })),
    };
  }

  function selectFor(table: any) {
    switch (table?._t) {
      case "orders":
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => queryResult(() => [state.order])),
          })),
        };
      case "products":
        return makeSelectChain(() => [state.product]);
      case "vendors":
        return makeSelectChain(() => [state.vendor]);
      case "vendorSettlements":
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => {
              const chain: any = queryResult(() => state.settlements);
              chain.orderBy = vi.fn(() => queryResult(() => state.settlements));
              return chain;
            }),
          })),
        };
      case "commissionRules":
        return makeSelectChain(() => []);
      case "notificationPreferences":
        return makeSelectChain(() => []);
      case "notifications":
        return makeSelectChain(() => []);
      default:
        return makeSelectChain(() => []);
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
              state.settlementIdCounter++;
              state.settlements.push({
                id: `settle-${state.settlementIdCounter}`,
                createdAt: new Date(),
                ...vals,
              });
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
            return {
              returning: vi.fn(() => Promise.resolve([])),
              onConflictDoNothing: vi.fn(() => Promise.resolve()),
            };
          }),
        })),
        update: vi.fn((table: any) => ({
          set: vi.fn((vals: any) => ({
            where: vi.fn(() => {
              if (table?._t === "orders") {
                Object.assign(state.order, vals);
              }
              if (table?._t === "products") {
                // no-op for delivered (only cancelled restores stock)
              }
              return Promise.resolve(undefined);
            }),
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
      "shipping", "updatedAt", "deliveredAt", "cancelReason",
    ]),
    productsTable: tag("products", ["id", "stock", "vendorId", "category"]),
    vendorsTable: tag("vendors", ["id", "ownerId", "status"]),
    vendorSettlementsTable: tag("vendorSettlements", [
      "id", "vendorId", "orderId", "amount", "productAmount",
      "commission", "commissionRate", "shippingCharge", "settlementTax",
      "netPayout", "status", "type", "createdAt",
    ]),
    commissionRulesTable: tag("commissionRules", ["active", "scope", "vendorId", "category", "rate"]),
    cartItemsTable: tag("cartItems", ["userId"]),
    couponsTable: tag("coupons", ["id", "code"]),
    couponRedemptionsTable: tag("couponRedemptions", ["id"]),
    userProfilesTable: tag("userProfiles", ["userId"]),
    rewardPointsLogTable: tag("rewardPointsLog", ["userId"]),
    supportTicketsTable: tag("supportTickets", ["id"]),
    notificationsTable: tag("notifications", [
      "id", "userId", "vendorId", "type", "title", "body", "metadata", "read", "createdAt",
    ]),
    notificationPreferencesTable: tag("notificationPreferences", ["userId", "orderUpdates"]),
    stockHistoryTable: tag("stockHistory", [
      "id", "productId", "vendorId", "previousStock", "newStock", "source", "reason", "orderId",
    ]),
  };
});

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: VENDOR_OWNER_ID })),
  clerkClient: {},
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: unknown, next: () => void) => {
    req.log = { error: vi.fn(), info: vi.fn() };
    next();
  });
  const { default: ordersRouter } = await import("../routes/orders");
  const { default: sellerRouter } = await import("../routes/seller");
  app.use("/api", ordersRouter);
  app.use("/api", sellerRouter);
  return app;
}

describe("Settlement row created when an order is marked delivered", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.order = {
      id: ORDER_ID,
      userId: "user-buyer-settle-1",
      status: "confirmed",
      statusHistory: [],
      items: [{ productId: PRODUCT_ID, price: 10000, quantity: 2 }],
      shipping: 0,
      updatedAt: new Date(),
      deliveredAt: null,
      cancelReason: null,
    };
    state.product = { id: PRODUCT_ID, stock: 10, vendorId: VENDOR_ID, category: "sarees" };
    state.vendor = { id: VENDOR_ID, ownerId: VENDOR_OWNER_ID, status: "active" };
    state.settlements = [];
    state.settlementIdCounter = 0;
    state.notifications = [];
    state.notifIdCounter = 0;
    app = await buildApp();
  });

  it("creates a settlement with correct productAmount, commission, and netPayout when order is delivered", async () => {
    const statusRes = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "delivered" });

    expect(statusRes.status).toBe(200);

    expect(state.settlements).toHaveLength(1);

    const s = state.settlements[0];
    expect(s.vendorId).toBe(VENDOR_ID);
    expect(s.orderId).toBe(ORDER_ID);
    expect(s.type).toBe("order_settlement");

    // productAmount = 10000 * 2 = 20000
    expect(s.productAmount).toBe(20000);

    // commissionRate = 0.10 (default — no rules in mock)
    expect(s.commissionRate).toBe(0.10);

    // commission = round(20000 * 0.10) = 2000
    expect(s.commission).toBe(2000);

    // settlementTax = round(2000 * 0.18) = 360
    expect(s.settlementTax).toBe(360);

    // shippingCharge = 0 (order.shipping is 0)
    expect(s.shippingCharge).toBe(0);

    // netPayout = 20000 - 2000 - 0 - 360 = 17640
    expect(s.netPayout).toBe(17640);
    expect(s.amount).toBe(17640);

    // status inserted as "processing" (initial state for newly created settlements)
    expect(s.status).toBe("processing");
  });

  it("settlement row is returned by GET /seller/settlements for the vendor", async () => {
    const statusRes = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "delivered" });

    expect(statusRes.status).toBe(200);

    const settleRes = await request(app)
      .get("/api/seller/settlements")
      .set("Authorization", "Bearer fake");

    expect(settleRes.status).toBe(200);
    expect(settleRes.body.settlements).toHaveLength(1);

    const row = settleRes.body.settlements[0];
    expect(row.vendorId).toBe(VENDOR_ID);
    expect(row.orderId).toBe(ORDER_ID);
    expect(row.productAmount).toBe(20000);
    expect(row.commission).toBe(2000);
    expect(row.netPayout).toBe(17640);
    expect(row.status).toBe("processing");
    expect(row.type).toBe("order_settlement");
  });

  it("does not create a duplicate settlement if the order is delivered twice", async () => {
    const firstRes = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "delivered" });

    expect(firstRes.status).toBe(200);
    expect(state.settlements).toHaveLength(1);

    // Simulate attempting a second delivery status update (idempotency guard)
    const secondRes = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "delivered" });

    // Still only one settlement — the alreadySettled guard prevents duplication
    expect(state.settlements).toHaveLength(1);
  });

  it("does not create a settlement when the order is cancelled instead of delivered", async () => {
    const cancelRes = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "cancelled", note: "Out of stock" });

    expect(cancelRes.status).toBe(200);
    expect(state.settlements).toHaveLength(0);
  });
});
