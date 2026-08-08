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
    execute: vi.fn(() => Promise.resolve({ rows: [{ seq: 42 }] })),
    _resetCallCount: () => {
      txSelectCallCount = 0;
    },
  };

  const dbMock = {
    select: vi.fn(() => makeChain(state.dbSelectRows)),
    insert: vi.fn((_table: unknown) => ({
      values: vi.fn((vals: Record<string, unknown>) => ({
        returning: vi.fn(() =>
          Promise.resolve([{ id: "coupon-uuid-new", createdAt: new Date(), usedCount: 0, ...vals }]),
        ),
      })),
    })),
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((vals: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve(
              state.dbSelectRows[0]
                ? [{ ...state.dbSelectRows[0], ...vals }]
                : [],
            ),
          ),
        })),
      })),
    })),
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
    stockHistoryTable: { _t: "stockHistory", productId: "productId", change: "change", reason: "reason", orderId: "orderId" },
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

const ADMIN_KEY = "test-admin-key-123";

describe("Admin coupon endpoints — authentication", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    app = await buildApp();
    state.dbSelectRows = [];
    state.txSelectQueue = [];
  });

  it("returns 403 for GET /api/admin/coupons with missing x-admin-key", async () => {
    const res = await request(app).get("/api/admin/coupons");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);
  });

  it("returns 403 for GET /api/admin/coupons with wrong x-admin-key", async () => {
    const res = await request(app)
      .get("/api/admin/coupons")
      .set("x-admin-key", "wrong-key");
    expect(res.status).toBe(403);
  });

  it("returns 403 for POST /api/admin/coupons with missing x-admin-key", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .send({ code: "NEW10", type: "percent", value: 10 });
    expect(res.status).toBe(403);
  });

  it("returns 403 for POST /api/admin/coupons with wrong x-admin-key", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", "wrong-key")
      .send({ code: "NEW10", type: "percent", value: 10 });
    expect(res.status).toBe(403);
  });

  it("returns 403 for PUT /api/admin/coupons/:id with missing x-admin-key", async () => {
    const res = await request(app)
      .put("/api/admin/coupons/coupon-uuid-1")
      .send({ maxUses: 20 });
    expect(res.status).toBe(403);
  });

  it("returns 403 for PUT /api/admin/coupons/:id with wrong x-admin-key", async () => {
    const res = await request(app)
      .put("/api/admin/coupons/coupon-uuid-1")
      .set("x-admin-key", "wrong-key")
      .send({ maxUses: 20 });
    expect(res.status).toBe(403);
  });

  it("returns 403 for DELETE /api/admin/coupons/:id with missing x-admin-key", async () => {
    const res = await request(app).delete("/api/admin/coupons/coupon-uuid-1");
    expect(res.status).toBe(403);
  });

  it("returns 403 for DELETE /api/admin/coupons/:id with wrong x-admin-key", async () => {
    const res = await request(app)
      .delete("/api/admin/coupons/coupon-uuid-1")
      .set("x-admin-key", "wrong-key");
    expect(res.status).toBe(403);
  });

  it("returns 403 for all admin endpoints when ADMIN_API_KEY is not configured on the server", async () => {
    delete process.env.ADMIN_API_KEY;
    const res = await request(app)
      .get("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/coupons — validation", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    app = await buildApp();
    state.dbSelectRows = [];
    state.txSelectQueue = [];
  });

  it("returns 400 when code is missing", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY)
      .send({ type: "percent", value: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/code is required/i);
  });

  it("returns 400 when code is an empty string", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "   ", type: "percent", value: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/code is required/i);
  });

  it("returns 400 when type is invalid", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "NEW10", type: "bogus", value: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type must be/i);
  });

  it("returns 400 when value is not a number", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "NEW10", type: "percent", value: "ten" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/value must be/i);
  });

  it("returns 400 when value is zero or negative", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "NEW10", type: "percent", value: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/value must be/i);
  });

  it("returns 400 when maxUses is less than 1", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "NEW10", type: "percent", value: 10, maxUses: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maxUses must be a positive integer/i);
  });

  it("returns 400 when maxUses is not an integer", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "NEW10", type: "percent", value: 10, maxUses: 2.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maxUses must be a positive integer/i);
  });

  it("returns 409 when the coupon code already exists", async () => {
    const { db } = await import("@workspace/db");
    (db.insert as any).mockImplementationOnce(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => {
          const err: any = new Error("duplicate key");
          err.code = "23505";
          return Promise.reject(err);
        }),
      })),
    }));

    const res = await request(app)
      .post("/api/admin/coupons")
      .set("x-admin-key", ADMIN_KEY)
      .send({ code: "SAVE10", type: "percent", value: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });
});

describe("PUT /api/admin/coupons/:id — validation", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    app = await buildApp();
    state.dbSelectRows = [];
    state.txSelectQueue = [];
  });

  it("returns 404 when the coupon does not exist", async () => {
    state.dbSelectRows = [];

    const res = await request(app)
      .put("/api/admin/coupons/unknown-id")
      .set("x-admin-key", ADMIN_KEY)
      .send({ maxUses: 20 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("updates maxUses for an existing coupon", async () => {
    state.dbSelectRows = [VALID_COUPON];
    const { db } = await import("@workspace/db");
    (db.update as any).mockImplementationOnce(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([{ ...VALID_COUPON, maxUses: 20 }]),
          ),
        })),
      })),
    }));

    const res = await request(app)
      .put(`/api/admin/coupons/${VALID_COUPON.id}`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ maxUses: 20 });

    expect(res.status).toBe(200);
    expect(res.body.coupon.maxUses).toBe(20);
  });

  it("returns 400 when maxUses is invalid on update", async () => {
    state.dbSelectRows = [VALID_COUPON];

    const res = await request(app)
      .put(`/api/admin/coupons/${VALID_COUPON.id}`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ maxUses: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maxUses must be a positive integer/i);
  });

  it("returns 400 when type is invalid on update", async () => {
    state.dbSelectRows = [VALID_COUPON];

    const res = await request(app)
      .put(`/api/admin/coupons/${VALID_COUPON.id}`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ type: "invalid-type" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type must be/i);
  });
});

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

  it("rejects the order with 400 when the coupon is deactivated", async () => {
    state.dbSelectRows = [{ ...VALID_COUPON, active: false }];
    state.txSelectQueue = [[PRODUCT]];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "SAVE10" });

    expect(res.status).toBe(400);
    expect(res.body.couponInvalid).toBe(true);
    expect(state.capturedInsertValues).toBeNull();
  });

  it("rejects the order with 400 when the coupon is expired", async () => {
    state.dbSelectRows = [
      { ...VALID_COUPON, expiresAt: new Date("2020-01-01T00:00:00Z") },
    ];
    state.txSelectQueue = [[PRODUCT]];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "SAVE10" });

    expect(res.status).toBe(400);
    expect(res.body.couponInvalid).toBe(true);
    expect(state.capturedInsertValues).toBeNull();
  });

  it("rejects the order with 400 for an unknown coupon code", async () => {
    state.dbSelectRows = [];
    state.txSelectQueue = [[PRODUCT]];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "FAKE99" });

    expect(res.status).toBe(400);
    expect(res.body.couponInvalid).toBe(true);
    expect(state.capturedInsertValues).toBeNull();
  });

  it("rejects the order with 400 when coupon has reached its maxUses limit", async () => {
    state.dbSelectRows = [{ ...VALID_COUPON, maxUses: 5, usedCount: 5 }];
    state.txSelectQueue = [
      [PRODUCT],
      [{ usedCount: 5, maxUses: 5 }],
    ];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "SAVE10" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/usage limit/i);
    expect(state.capturedInsertValues).toBeNull();
  });

  it("rejects the order with 400 when the same user tries to redeem the same coupon twice", async () => {
    state.dbSelectRows = [VALID_COUPON];
    state.txSelectQueue = [
      [PRODUCT],
      [{ usedCount: 1, maxUses: null }],
      [{ id: "existing-redemption-uuid" }],
    ];

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_ORDER_BODY, couponCode: "SAVE10" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already used/i);
    expect(state.capturedInsertValues).toBeNull();
  });
});
