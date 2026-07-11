/**
 * Refund payout flow — end-to-end integration test.
 *
 * Covers the full three-step lifecycle:
 *   1. Customer requests a refund (POST /orders/:id/refund)
 *   2. Admin approves the pending refund (POST /admin/orders/:id/refund → decision: "approved")
 *   3. Admin marks payout done (POST /admin/orders/:id/refund/process)
 *
 * Verifies:
 *  - Each step transitions refundStatus correctly.
 *  - Notifications are inserted for the customer at each step.
 *  - The admin Returns panel endpoint (GET /admin/returns) surfaces
 *    refund fields so the UI can display processed status + timestamp.
 *  - Guard rails: wrong status transitions are rejected with 400.
 *  - The admin key gate rejects unauthenticated callers.
 *
 * Uses an in-memory db mock — no live database or email sending.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const ADMIN_KEY = "test-admin-key-refund";
const USER_ID = "user-buyer-refund";
const ORDER_ID = "order-refund-uuid-1";
const PRODUCT_ID = "prod-refund-uuid-1";
const VENDOR_ID = "vendor-refund-uuid-1";

const state = vi.hoisted(() => ({
  order: {
    id: "order-refund-uuid-1",
    userId: "user-buyer-refund",
    status: "cancelled" as string,
    refundStatus: null as string | null,
    refundMethod: null as string | null,
    refundProcessedAt: null as Date | null,
    refundReference: null as string | null,
    statusHistory: [] as any[],
    items: [{ productId: "prod-refund-uuid-1", name: "Banarasi Silk Saree", quantity: 1 }],
    address: { name: "Test Customer", line1: "12 Main St", city: "Mumbai", state: "Maharashtra", pincode: "400001" },
    total: 1500000,
    updatedAt: new Date("2025-01-01"),
    createdAt: new Date("2025-01-01"),
    returnReason: null as string | null,
  },
  product: {
    id: "prod-refund-uuid-1",
    stock: 5,
    vendorId: "vendor-refund-uuid-1",
  },
  vendor: {
    id: "vendor-refund-uuid-1",
    ownerId: "vendor-owner-1",
  },
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
            where: vi.fn(() => {
              const chain: any = queryResult(() => [state.order]);
              chain.orderBy = vi.fn(() => queryResult(() => [state.order]));
              return chain;
            }),
          })),
        };
      case "products":
        return makeSelectChain(() => [state.product]);
      case "vendors":
        return makeSelectChain(() => [state.vendor]);
      case "notificationPreferences":
        return makeSelectChain(() => []);
      case "notifications": {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => {
              const userNotifs = state.notifications.filter((n) => n.userId === USER_ID);
              const unread = userNotifs.filter((n) => !n.read);
              const chain: any = {
                orderBy: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    offset: vi.fn(() => Promise.resolve(userNotifs)),
                  })),
                })),
                limit: vi.fn(() => Promise.resolve(userNotifs)),
              };
              chain.then = (resolve: any) => resolve([{ count: unread.length, total: userNotifs.length }]);
              return chain;
            }),
          })),
        };
      }
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
      "refundProcessedAt", "refundReference", "statusHistory", "items",
      "address", "total", "updatedAt", "createdAt", "returnReason",
      "deliveredAt", "cancelReason",
    ]),
    productsTable: tag("products", ["id", "stock", "vendorId"]),
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
    notificationPreferencesTable: tag("notificationPreferences", ["userId", "orderUpdates"]),
    stockHistoryTable: tag("stockHistory", [
      "id", "productId", "vendorId", "previousStock", "newStock", "source", "reason", "orderId",
    ]),
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

describe("Refund payout flow — approve → process", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.order = {
      id: ORDER_ID,
      userId: USER_ID,
      status: "cancelled",
      refundStatus: "pending",
      refundMethod: "original_payment",
      refundProcessedAt: null,
      refundReference: null,
      statusHistory: [],
      items: [{ productId: PRODUCT_ID, name: "Banarasi Silk Saree", quantity: 1 }],
      address: { name: "Test Customer", line1: "12 Main St", city: "Mumbai", state: "Maharashtra", pincode: "400001" },
      total: 1500000,
      updatedAt: new Date("2025-01-01"),
      createdAt: new Date("2025-01-01"),
      returnReason: null,
    };
    state.product = { id: PRODUCT_ID, stock: 5, vendorId: VENDOR_ID };
    state.vendor = { id: VENDOR_ID, ownerId: "vendor-owner-1" };
    state.notifications = [];
    state.notifIdCounter = 0;
    app = await buildApp();
  });

  it("admin can approve a pending refund and response returns updated order", async () => {
    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ decision: "approved", note: "Looks valid" });

    expect(res.status).toBe(200);
    expect(res.body.order).toBeTruthy();
    expect(res.body.order.refundStatus).toBe("approved");
  });

  it("approving a refund inserts a refund_approved notification for the customer", async () => {
    await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ decision: "approved" });

    const approvedNotif = state.notifications.find((n) => n.type === "refund_approved");
    expect(approvedNotif).toBeTruthy();
    expect(approvedNotif.userId).toBe(USER_ID);
    expect(approvedNotif.title).toBe("Refund approved");
    expect(approvedNotif.body).toMatch(/approved/i);
  });

  it("admin can mark an approved refund as processed with a reference number", async () => {
    state.order.refundStatus = "approved";

    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund/process`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reference: "TXN-REF-2025-001" });

    expect(res.status).toBe(200);
    expect(res.body.order).toBeTruthy();
    expect(res.body.order.refundStatus).toBe("processed");
    expect(res.body.order.refundReference).toBe("TXN-REF-2025-001");
    expect(res.body.order.refundProcessedAt).toBeTruthy();
  });

  it("processing a refund inserts a refund_processed notification for the customer", async () => {
    state.order.refundStatus = "approved";

    await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund/process`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reference: "TXN-REF-2025-001" });

    const processedNotif = state.notifications.find((n) => n.type === "refund_processed");
    expect(processedNotif).toBeTruthy();
    expect(processedNotif.userId).toBe(USER_ID);
    expect(processedNotif.title).toBe("Refund processed");
    expect(processedNotif.body).toMatch(/paid out/i);
    expect(processedNotif.body).toContain("TXN-REF-2025-001");
  });

  it("full approve → process sequence transitions refundStatus correctly", async () => {
    expect(state.order.refundStatus).toBe("pending");

    const approveRes = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ decision: "approved" });
    expect(approveRes.status).toBe(200);
    expect(state.order.refundStatus).toBe("approved");

    const processRes = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund/process`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reference: "NEFT-2025-XYZ" });
    expect(processRes.status).toBe(200);
    expect(state.order.refundStatus).toBe("processed");
    expect(state.order.refundReference).toBe("NEFT-2025-XYZ");
    expect(state.order.refundProcessedAt).toBeTruthy();

    const approvedNotif = state.notifications.find((n) => n.type === "refund_approved");
    const processedNotif = state.notifications.find((n) => n.type === "refund_processed");
    expect(approvedNotif).toBeTruthy();
    expect(processedNotif).toBeTruthy();
  });

  it("admin can reject a pending refund and customer is notified", async () => {
    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ decision: "rejected", note: "Outside return window" });

    expect(res.status).toBe(200);
    expect(state.order.refundStatus).toBe("rejected");

    const rejectedNotif = state.notifications.find((n) => n.type === "refund_rejected");
    expect(rejectedNotif).toBeTruthy();
    expect(rejectedNotif.userId).toBe(USER_ID);
    expect(rejectedNotif.title).toBe("Refund rejected");
  });

  it("GET /admin/returns lists the order with its refund fields", async () => {
    state.order.refundStatus = "processed";
    state.order.refundProcessedAt = new Date("2025-06-15T10:00:00Z");
    state.order.refundReference = "REF-DONE-001";

    const res = await request(app)
      .get("/api/admin/returns")
      .set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    const o = res.body.orders[0];
    expect(o.refundStatus).toBe("processed");
    expect(o.refundReference).toBe("REF-DONE-001");
    expect(o.refundProcessedAt).toBeTruthy();
  });
});

describe("Refund payout flow — guard rails", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.order = {
      id: ORDER_ID,
      userId: USER_ID,
      status: "cancelled",
      refundStatus: "pending",
      refundMethod: "original_payment",
      refundProcessedAt: null,
      refundReference: null,
      statusHistory: [],
      items: [{ productId: PRODUCT_ID, name: "Banarasi Silk Saree", quantity: 1 }],
      address: { name: "Test Customer", line1: "12 Main St", city: "Mumbai", state: "Maharashtra", pincode: "400001" },
      total: 1500000,
      updatedAt: new Date("2025-01-01"),
      createdAt: new Date("2025-01-01"),
      returnReason: null,
    };
    state.notifications = [];
    state.notifIdCounter = 0;
    app = await buildApp();
  });

  it("rejects process attempt on a pending (not yet approved) refund with 400", async () => {
    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund/process`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reference: "EARLY-ATTEMPT" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approved/i);
    expect(state.notifications).toHaveLength(0);
  });

  it("rejects approve attempt on an already-approved refund with 400", async () => {
    state.order.refundStatus = "approved";

    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ decision: "approved" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending/i);
  });

  it("rejects approve attempt on an already-processed refund with 400", async () => {
    state.order.refundStatus = "processed";

    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ decision: "approved" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending/i);
  });

  it("rejects approve without a valid admin key with 403", async () => {
    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund`)
      .send({ decision: "approved" });

    expect(res.status).toBe(403);
    expect(state.notifications).toHaveLength(0);
  });

  it("rejects process without a valid admin key with 403", async () => {
    state.order.refundStatus = "approved";

    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund/process`)
      .send({ reference: "SNEAKY" });

    expect(res.status).toBe(403);
    expect(state.notifications).toHaveLength(0);
  });

  it("rejects approve with an invalid decision value with 400", async () => {
    const res = await request(app)
      .post(`/api/admin/orders/${ORDER_ID}/refund`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ decision: "maybe" });

    expect(res.status).toBe(400);
  });

  it("rejects GET /admin/returns without admin key with 403", async () => {
    const res = await request(app).get("/api/admin/returns");
    expect(res.status).toBe(403);
  });
});
