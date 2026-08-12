/**
 * Refund method validation — API-level unit tests.
 *
 * Verifies that POST /orders/:id/refund returns 400 with a descriptive error
 * message whenever the `method` field is absent, empty, or not one of the
 * accepted values ("original_payment" | "store_credit").  This guards against
 * clients that bypass the front-end JS validation (e.g. direct curl calls).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const USER_ID = "user-refund-val-001";
const ORDER_ID = "order-refund-val-001";

const state = vi.hoisted(() => ({
  order: {
    id: "order-refund-val-001",
    userId: "user-refund-val-001",
    status: "cancelled" as string,
    refundStatus: null as string | null,
    refundMethod: null as string | null,
    statusHistory: [] as any[],
    items: [{ productId: "prod-val-001", name: "Kanjivaram Silk Saree", quantity: 1 }],
    address: { name: "Test", line1: "1 Main St", city: "Chennai", state: "Tamil Nadu", pincode: "600001" },
    total: 8500,
    updatedAt: new Date("2025-07-01"),
    createdAt: new Date("2025-07-01"),
    returnReason: null,
    deliveredAt: null,
    cancelReason: "Changed my mind",
  },
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
        return makeSelectChain(() => [{ id: "prod-val-001", vendorId: null }]);
      case "vendors":
        return makeSelectChain(() => []);
      case "notificationPreferences":
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
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([])),
            onConflictDoNothing: vi.fn(() => Promise.resolve()),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn((vals: any) => ({
            where: vi.fn(() => {
              Object.assign(state.order, vals);
              return {
                returning: vi.fn(() => Promise.resolve([state.order])),
                then: (resolve: any) => Promise.resolve(undefined).then(resolve),
              };
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
      "id", "userId", "status", "refundStatus", "refundMethod",
      "refundProcessedAt", "refundReference", "refundIdempotencyKey",
      "statusHistory", "items", "address", "total", "updatedAt",
      "createdAt", "returnReason", "deliveredAt", "cancelReason",
    ]),
    productsTable: tag("products", ["id", "stock", "vendorId", "name", "price", "images", "vendorName", "lowStockThreshold"]),
    vendorsTable: tag("vendors", ["id", "ownerId", "name"]),
    cartItemsTable: tag("cartItems", ["userId"]),
    couponsTable: tag("coupons", ["id", "code"]),
    couponRedemptionsTable: tag("couponRedemptions", ["id"]),
    userProfilesTable: tag("userProfiles", ["userId"]),
    rewardPointsLogTable: tag("rewardPointsLog", ["userId"]),
    supportTicketsTable: tag("supportTickets", ["id"]),
    vendorSettlementsTable: tag("vendorSettlements", ["id"]),
    notificationsTable: tag("notifications", [
      "id", "userId", "vendorId", "type", "title", "body", "metadata", "read", "createdAt",
    ]),
    notificationPreferencesTable: tag("notificationPreferences", ["userId", "orderUpdates", "offerAlerts"]),
    stockHistoryTable: tag("stockHistory", [
      "id", "productId", "vendorId", "previousStock", "newStock", "source", "reason", "orderId",
    ]),
    savedPaymentMethodsTable: tag("savedPaymentMethods", ["id", "userId", "type"]),
  };
});

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: USER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendTransactionalEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/commission", () => ({
  loadActiveCommissionRules: vi.fn(() => Promise.resolve([])),
  effectiveRateFromRules: vi.fn(() => 0.1),
}));

vi.mock("../lib/stockHistory", () => ({
  recordStockChange: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  getIp: vi.fn(() => "127.0.0.1"),
}));

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

describe("POST /orders/:id/refund — server-side method validation", () => {
  let app: Express;

  beforeEach(async () => {
    state.order = {
      id: ORDER_ID,
      userId: USER_ID,
      status: "cancelled",
      refundStatus: null,
      refundMethod: null,
      statusHistory: [],
      items: [{ productId: "prod-val-001", name: "Kanjivaram Silk Saree", quantity: 1 }],
      address: { name: "Test", line1: "1 Main St", city: "Chennai", state: "Tamil Nadu", pincode: "600001" },
      total: 8500,
      updatedAt: new Date("2025-07-01"),
      createdAt: new Date("2025-07-01"),
      returnReason: null,
      deliveredAt: null,
      cancelReason: "Changed my mind",
    };
    app = await buildApp();
  });

  it("returns 400 when body is completely empty", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/refund`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/original_payment|store_credit/i);
  });

  it("returns 400 when method field is missing from body", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/refund`)
      .send({ reason: "something else" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/original_payment|store_credit/i);
  });

  it("returns 400 when method is an empty string", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/refund`)
      .send({ method: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/original_payment|store_credit/i);
  });

  it("returns 400 when method is an unrecognised value", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/refund`)
      .send({ method: "bank_transfer" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/original_payment|store_credit/i);
  });

  it("returns 400 when method is null", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/refund`)
      .send({ method: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/original_payment|store_credit/i);
  });

  it("accepts 'original_payment' as a valid method", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/refund`)
      .send({ method: "original_payment" });

    // 200 means the guard passed; downstream logic runs against the mocked db
    expect(res.status).toBe(200);
  });

  it("accepts 'store_credit' as a valid method", async () => {
    state.order.refundStatus = null; // reset for second call
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/refund`)
      .send({ method: "store_credit" });

    expect(res.status).toBe(200);
  });
});
