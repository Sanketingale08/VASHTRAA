/**
 * Settlement zero-price warning test.
 *
 * When an order is marked "delivered" but all items for a vendor group have a
 * zero or missing price, the route must:
 *   1. Skip creating a settlement record for that vendor (existing behaviour).
 *   2. Emit a `req.log.warn` call with the order ID and vendor ID so the
 *      failure is never silent.
 *
 * Uses in-memory mocks — no live database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── Mutable test state ───────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  order: null as any,
  product: {
    id: "prod-zero-price-1",
    vendorId: "vendor-zero-price-1",
    category: "sarees",
  },
  settlements: [] as any[],
  /** Captured req.log.warn calls */
  warnCalls: [] as Array<{ obj: unknown; msg: string }>,
}));

const ADMIN_KEY = "test-admin-key-zero-price";
const USER_ID = "user-zero-price-buyer";
const ORDER_ID = "order-zero-price-uuid-1";
const PRODUCT_ID = "prod-zero-price-1";
const VENDOR_ID = "vendor-zero-price-1";

function makeZeroPriceOrder() {
  return {
    id: ORDER_ID,
    userId: USER_ID,
    status: "dispatched",
    statusHistory: [],
    // price is 0 — simulates a stored order missing its price field
    items: [{ productId: PRODUCT_ID, name: "Banarasi Silk Saree", price: 0, quantity: 1 }],
    shipping: 199,
    subtotal: 0,
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
      case "vendorSettlements":
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => queryResult(() => [])),
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

vi.mock("../lib/commission", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/commission")>();
  return {
    ...actual,
    loadActiveCommissionRules: vi.fn(() => Promise.resolve([])),
  };
});

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
    req.log = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn((obj: unknown, msg: string) => {
        state.warnCalls.push({ obj, msg });
      }),
    };
    next();
  });
  const { default: ordersRouter } = await import("../routes/orders");
  app.use("/api", ordersRouter);
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Settlement-on-delivery — zero/missing price warning", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.order = makeZeroPriceOrder();
    state.settlements = [];
    state.warnCalls = [];
    app = await buildApp();
  });

  it("emits a warn log when all items for a vendor group have price 0", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);

    // The warn must have fired at least once
    expect(state.warnCalls.length).toBeGreaterThanOrEqual(1);

    const call = state.warnCalls[0];
    expect(call.msg).toMatch(/skipping settlement/i);

    // The warn payload must include the order ID and vendor ID
    expect((call.obj as any).orderId).toBe(ORDER_ID);
    expect((call.obj as any).vendorId).toBe(VENDOR_ID);
  });

  it("does NOT create a settlement record when price is 0", async () => {
    await request(app)
      .post(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "delivered" });

    expect(state.settlements).toHaveLength(0);
  });

  it("emits no warning when the item has a valid non-zero price", async () => {
    // Override order to have a real price
    state.order = {
      ...makeZeroPriceOrder(),
      items: [{ productId: PRODUCT_ID, name: "Banarasi Silk Saree", price: 5000, quantity: 1 }],
      subtotal: 5000,
    };

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);
    expect(state.warnCalls).toHaveLength(0);
    // And a settlement IS created
    expect(state.settlements).toHaveLength(1);
  });
});
