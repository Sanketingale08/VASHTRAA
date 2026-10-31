import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { PAYMENT_METHODS } from "@workspace/api-zod";

const state = vi.hoisted(() => ({
  txSelectQueue: [] as Record<string, unknown>[][],
  txInsertReturning: [{ id: "order-uuid-123" }] as Record<string, unknown>[],
}));

vi.mock("@workspace/db", () => {
  let txSelectCallCount = 0;

  const makeChain = (rows: Record<string, unknown>[]) => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(rows)),
        for: vi.fn(() => Promise.resolve(rows)),
      })),
      for: vi.fn(() => Promise.resolve(rows)),
    })),
  });

  function makeWhereResult(resolveVal: unknown = undefined, returningRows: unknown[] = []) {
    return Object.assign(Promise.resolve(resolveVal), {
      returning: vi.fn(() => Promise.resolve(returningRows)),
    });
  }

  const txMock = {
    select: vi.fn(() => {
      const rows = state.txSelectQueue[txSelectCallCount++] ?? [];
      return makeChain(rows);
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(state.txInsertReturning)),
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() =>
          makeWhereResult(undefined, [{ totalPoints: 0, loyaltyTier: "silver" }]),
        ),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    execute: vi.fn(() => Promise.resolve({ rows: [{ seq: 42 }] })),
    _resetCallCount: () => {
      txSelectCallCount = 0;
    },
  };

  const dbMock = {
    select: vi.fn(() => makeChain([])),
    transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => {
      txMock._resetCallCount();
      return cb(txMock);
    }),
  };

  return {
    db: dbMock,
    getNextSequenceValue: vi.fn(() => Promise.resolve(42)),
    mongoOrders: { insert: vi.fn(async (doc) => doc) },
    mongoProducts: { findById: vi.fn(() => Promise.resolve(PRODUCT)), decrementStock: vi.fn(() => Promise.resolve({ stock: 4 })) },
    couponsTable: { _t: "coupons", code: "code" },
    couponRedemptionsTable: { _t: "couponRedemptions" },
    ordersTable: { _t: "orders", id: "id", userId: "userId" },
    productsTable: { _t: "products", id: "id", name: "name", price: "price", images: "images", vendorName: "vendorName", stock: "stock" },
    cartItemsTable: { _t: "cartItems", userId: "userId" },
    userProfilesTable: { _t: "userProfiles", userId: "userId", referralCode: "referralCode", totalPoints: "totalPoints", lifetimePoints: "lifetimePoints", loyaltyTier: "loyaltyTier", updatedAt: "updatedAt" },
    rewardPointsLogTable: { _t: "rewardPointsLog", userId: "userId", points: "points", type: "type", description: "description", orderId: "orderId" },
    notificationsTable: { _t: "notifications", userId: "userId", type: "type", title: "title", body: "body", metadata: "metadata", id: "id" },
    notificationPreferencesTable: { _t: "notificationPreferences", userId: "userId", orderUpdates: "orderUpdates", offerAlerts: "offerAlerts" },
    stockHistoryTable: { _t: "stockHistory", productId: "productId", delta: "delta", previousStock: "previousStock", newStock: "newStock", source: "source", reason: "reason", orderId: "orderId", vendorId: "vendorId", actorId: "actorId" },
    vendorsTable: { _t: "vendors", id: "id", ownerId: "ownerId" },
    vendorSettlementsTable: { _t: "vendorSettlements", id: "id" },
    supportTicketsTable: { _t: "supportTickets", id: "id", userId: "userId" },
  };
});

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: "user-test-123" })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((_req: any, _res: unknown, next: () => void) => {
    (_req as any).log = { error: vi.fn(), info: vi.fn() };
    next();
  });
  const { default: ordersRouter } = await import("../routes/orders");
  app.use("/api", ordersRouter);
  return app;
}

const PRODUCT = {
  id: "prod-uuid-1",
  name: "Kanjivaram Silk Saree",
  price: 8000,
  images: ["img1.jpg"],
  vendorName: "Silk Palace",
  stock: 5,
};

const BASE_ORDER_BODY = {
  items: [{ productId: PRODUCT.id, quantity: 1 }],
  address: {
    name: "Priya Sharma",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  deliveryMethod: "standard",
};

describe("POST /api/orders payment method validation", () => {
  let app: Express;

  beforeEach(async () => {
    app = await buildApp();
    state.txSelectQueue = [];
    state.txInsertReturning = [{ id: "order-uuid-123" }];
  });

  it.each(PAYMENT_METHODS)("accepts %s as a valid payment method", async (paymentMethod) => {
    state.txSelectQueue = [[PRODUCT], []];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...BASE_ORDER_BODY, paymentMethod });

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBeDefined();
  });

  it("rejects payment methods not present in the shared allow-list, e.g. paypal", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ ...BASE_ORDER_BODY, paymentMethod: "paypal" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid payment method/i);
  });

  it("mobile app's 'card' payment option is honored end-to-end (regression)", async () => {
    state.txSelectQueue = [[PRODUCT], []];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...BASE_ORDER_BODY, paymentMethod: "card" });

    expect(res.status).toBe(200);
  });
});
