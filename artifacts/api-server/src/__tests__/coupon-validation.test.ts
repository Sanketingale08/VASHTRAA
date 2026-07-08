import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const state = vi.hoisted(() => ({
  dbSelectRows: [] as Record<string, unknown>[],
  txSelectQueue: [] as Record<string, unknown>[][],
  txInsertReturning: [{ id: "order-uuid-123" }] as Record<string, unknown>[],
  capturedInsertValues: null as Record<string, unknown> | null,
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
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if ((table as Record<string, unknown>)._t === "orders") {
          state.capturedInsertValues = vals;
        }
        return {
          returning: vi.fn(() => Promise.resolve(state.txInsertReturning)),
          onConflictDoNothing: vi.fn(() => Promise.resolve()),
        };
      }),
    })),
    update: vi.fn((_table: unknown) => ({
      set: vi.fn(() => ({
        where: vi.fn(() =>
          makeWhereResult(undefined, [{ totalPoints: 0, loyaltyTier: "silver" }]),
        ),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    _resetCallCount: () => {
      txSelectCallCount = 0;
    },
  };

  const dbMock = {
    select: vi.fn(() => makeChain(state.dbSelectRows)),
    transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => {
      txMock._resetCallCount();
      return cb(txMock);
    }),
  };

  return {
    db: dbMock,
    couponsTable: { _t: "coupons", code: "code", active: "active", expiresAt: "expiresAt", id: "id", usedCount: "usedCount", maxUses: "maxUses", type: "type", value: "value", description: "description" },
    couponRedemptionsTable: { _t: "couponRedemptions", couponId: "couponId", userId: "userId", id: "id", orderId: "orderId" },
    ordersTable: { _t: "orders", id: "id", userId: "userId" },
    productsTable: { _t: "products", id: "id", name: "name", price: "price", images: "images", vendorName: "vendorName", stock: "stock" },
    cartItemsTable: { _t: "cartItems", userId: "userId" },
    userProfilesTable: { _t: "userProfiles", userId: "userId", referralCode: "referralCode", totalPoints: "totalPoints", lifetimePoints: "lifetimePoints", loyaltyTier: "loyaltyTier", updatedAt: "updatedAt" },
    rewardPointsLogTable: { _t: "rewardPointsLog", userId: "userId", points: "points", type: "type", description: "description", orderId: "orderId" },
    notificationsTable: { _t: "notifications", userId: "userId", type: "type", title: "title", body: "body", metadata: "metadata", id: "id" },
    notificationPreferencesTable: { _t: "notificationPreferences", userId: "userId", orderUpdates: "orderUpdates", offerAlerts: "offerAlerts" },
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
  const { default: couponsRouter } = await import("../routes/coupons");
  const { default: ordersRouter } = await import("../routes/orders");
  app.use("/api", couponsRouter);
  app.use("/api", ordersRouter);
  return app;
}

const VALID_COUPON = {
  id: "coupon-uuid-1",
  code: "SAVE10",
  type: "percent" as const,
  value: 10,
  description: "10% off",
  active: true,
  expiresAt: null,
  maxUses: null,
  usedCount: 0,
};

const PRODUCT = {
  id: "prod-uuid-1",
  name: "Kanjivaram Silk Saree",
  price: 8000,
  images: ["img1.jpg"],
  vendorName: "Silk Palace",
  stock: 5,
};

const VALID_ORDER_BODY = {
  items: [{ productId: PRODUCT.id, quantity: 1 }],
  address: {
    name: "Priya Sharma",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  deliveryMethod: "standard",
  paymentMethod: "upi",
};

describe("GET /api/coupons/validate", () => {
  let app: Express;

  beforeEach(async () => {
    app = await buildApp();
    state.dbSelectRows = [];
    state.txSelectQueue = [];
    state.capturedInsertValues = null;
  });

  it("returns 200 with coupon data for a valid active coupon", async () => {
    state.dbSelectRows = [VALID_COUPON];

    const res = await request(app).get("/api/coupons/validate?code=SAVE10");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      code: "SAVE10",
      type: "percent",
      value: 10,
    });
  });

  it("returns 400 when coupon is deactivated by the merchant", async () => {
    state.dbSelectRows = [{ ...VALID_COUPON, active: false }];

    const res = await request(app).get("/api/coupons/validate?code=SAVE10");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no longer active/i);
  });

  it("returns 400 when coupon is expired", async () => {
    state.dbSelectRows = [
      { ...VALID_COUPON, expiresAt: new Date("2020-01-01T00:00:00Z") },
    ];

    const res = await request(app).get("/api/coupons/validate?code=SAVE10");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("returns 404 for an unknown coupon code", async () => {
    state.dbSelectRows = [];

    const res = await request(app).get("/api/coupons/validate?code=NOSUCH");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/invalid coupon/i);
  });
});

describe("POST /api/orders coupon handling", () => {
  let app: Express;

  beforeEach(async () => {
    app = await buildApp();
    state.dbSelectRows = [];
    state.txSelectQueue = [];
    state.capturedInsertValues = null;
    state.txInsertReturning = [{ id: "order-uuid-123" }];
  });

  it("applies the discount when a valid coupon is submitted", async () => {
    state.dbSelectRows = [VALID_COUPON];
    state.txSelectQueue = [
      [PRODUCT],
      [{ usedCount: 0, maxUses: null }],
      [],
    ];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "SAVE10" });

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe("order-uuid-123");
    expect(state.capturedInsertValues).not.toBeNull();
    expect((state.capturedInsertValues as any).discount).toBeGreaterThan(0);
    expect((state.capturedInsertValues as any).couponCode).toBe("SAVE10");
  });

  it("creates the order without discount when the coupon is deactivated", async () => {
    state.dbSelectRows = [{ ...VALID_COUPON, active: false }];
    state.txSelectQueue = [[PRODUCT]];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "SAVE10" });

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe("order-uuid-123");
    expect((state.capturedInsertValues as any).discount).toBe(0);
    expect((state.capturedInsertValues as any).couponCode).toBeNull();
  });

  it("creates the order without discount when the coupon is expired", async () => {
    state.dbSelectRows = [
      { ...VALID_COUPON, expiresAt: new Date("2020-01-01T00:00:00Z") },
    ];
    state.txSelectQueue = [[PRODUCT]];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "SAVE10" });

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe("order-uuid-123");
    expect((state.capturedInsertValues as any).discount).toBe(0);
    expect((state.capturedInsertValues as any).couponCode).toBeNull();
  });

  it("creates the order without discount for an unknown coupon code", async () => {
    state.dbSelectRows = [];
    state.txSelectQueue = [[PRODUCT]];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "FAKE99" });

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe("order-uuid-123");
    expect((state.capturedInsertValues as any).discount).toBe(0);
    expect((state.capturedInsertValues as any).couponCode).toBeNull();
  });
});
