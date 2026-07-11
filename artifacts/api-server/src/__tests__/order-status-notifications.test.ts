/**
 * Order status -> notification bell integration test.
 *
 * Goal: confirm the end-to-end path that the "shipped"/"delivered"/"cancelled"
 * bell icons depend on: admin advances an order's status, a notification row
 * is inserted for the order's owner, the unread-count endpoint increments,
 * and the notifications list endpoint returns the correct type/title/body.
 *
 * This exercises the real orders.ts and notifications.ts route handlers
 * against an in-memory @workspace/db mock — no mocking of the notification
 * insertion logic itself, so a regression in insertOrderStatusNotification
 * or the status-update transaction would fail this test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const ADMIN_KEY = "test-admin-key";
const USER_ID = "user-buyer-1";
const ORDER_ID = "order-uuid-1";
const PRODUCT_ID = "prod-uuid-1";
const VENDOR_ID = "vendor-uuid-1";

const state = vi.hoisted(() => ({
  order: {
    id: "order-uuid-1",
    userId: "user-buyer-1",
    status: "confirmed",
    statusHistory: [] as any[],
    items: [{ productId: "prod-uuid-1", name: "Kanjivaram Silk Saree", quantity: 1 }],
  },
  product: {
    id: "prod-uuid-1",
    stock: 10,
    vendorId: "vendor-uuid-1",
  },
  vendor: {
    id: "vendor-uuid-1",
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
        return makeSelectChain(() => [state.order]);
      case "products":
        return makeSelectChain(() => [state.product]);
      case "vendors":
        return makeSelectChain(() => [state.vendor]);
      case "notificationPreferences":
        return makeSelectChain(() => []); // no row -> defaults to enabled
      case "notifications": {
        // Handles both unread-count (count aggregate) and list queries.
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
              // sql<count> aggregate result shape
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
              if (table?._t === "products") {
                state.product.stock += 0; // stock math not asserted here
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
    ordersTable: tag("orders", ["id", "userId", "status", "statusHistory", "items", "updatedAt", "deliveredAt", "cancelReason"]),
    productsTable: tag("products", ["id", "stock", "vendorId"]),
    vendorsTable: tag("vendors", ["id", "ownerId"]),
    cartItemsTable: tag("cartItems", ["userId"]),
    couponsTable: tag("coupons", ["id", "code"]),
    couponRedemptionsTable: tag("couponRedemptions", ["id"]),
    userProfilesTable: tag("userProfiles", ["userId"]),
    rewardPointsLogTable: tag("rewardPointsLog", ["userId"]),
    supportTicketsTable: tag("supportTickets", ["id"]),
    notificationsTable: tag("notifications", ["id", "userId", "vendorId", "type", "title", "body", "metadata", "read", "createdAt"]),
    notificationPreferencesTable: tag("notificationPreferences", ["userId", "orderUpdates"]),
    stockHistoryTable: tag("stockHistory", ["id", "productId", "vendorId", "previousStock", "newStock", "source", "reason", "orderId"]),
  };
});

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: USER_ID })),
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
  const { default: notificationsRouter } = await import("../routes/notifications");
  app.use("/api", ordersRouter);
  app.use("/api", notificationsRouter);
  return app;
}

describe("Order status updates reach the notification bell", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.order = {
      id: ORDER_ID,
      userId: USER_ID,
      status: "confirmed",
      statusHistory: [],
      items: [{ productId: PRODUCT_ID, name: "Kanjivaram Silk Saree", quantity: 1 }],
    };
    state.product = { id: PRODUCT_ID, stock: 10, vendorId: VENDOR_ID };
    state.vendor = { id: VENDOR_ID, ownerId: "vendor-owner-1" };
    state.notifications = [];
    state.notifIdCounter = 0;
    app = await buildApp();
  });

  it("inserts an order_shipped notification and increments the bell count when an order is dispatched", async () => {
    const before = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", "Bearer fake");
    expect(before.body.count).toBe(0);

    const statusRes = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "dispatched" });
    expect(statusRes.status).toBe(200);

    const after = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", "Bearer fake");
    expect(after.body.count).toBe(1);

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer fake");
    expect(list.status).toBe(200);
    const notif = list.body.notifications.find((n: any) => n.type === "order_shipped");
    expect(notif).toBeTruthy();
    expect(notif.title).toBe("Order shipped");
    expect(notif.body).toMatch(/dispatched/i);
    expect(notif.userId).toBe(USER_ID);
  });

  it("inserts an order_delivered notification when an order is marked delivered", async () => {
    const statusRes = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "delivered" });
    expect(statusRes.status).toBe(200);

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer fake");
    const notif = list.body.notifications.find((n: any) => n.type === "order_delivered");
    expect(notif).toBeTruthy();
    expect(notif.title).toBe("Order delivered");
    expect(notif.body).toMatch(/delivered/i);

    const count = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", "Bearer fake");
    expect(count.body.count).toBe(1);
  });

  it("inserts an order_cancelled notification when an order is cancelled", async () => {
    const statusRes = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "cancelled", note: "Out of stock" });
    expect(statusRes.status).toBe(200);

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer fake");
    const notif = list.body.notifications.find((n: any) => n.type === "order_cancelled");
    expect(notif).toBeTruthy();
    expect(notif.title).toBe("Order cancelled");
    expect(notif.body).toMatch(/cancelled/i);

    const count = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", "Bearer fake");
    expect(count.body.count).toBe(1);
  });

  it("rejects status updates without a valid admin key so notifications cannot be forged", async () => {
    const res = await request(app)
      .patch(`/api/orders/${ORDER_ID}/status`)
      .send({ status: "dispatched" });
    expect(res.status).toBe(403);
    expect(state.notifications).toHaveLength(0);
  });
});
