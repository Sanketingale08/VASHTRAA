/**
 * Authorization tests for POST /api/orders.
 *
 * Verifies that isCustomer middleware correctly:
 *   - allows authenticated accounts through (200) — including approved vendors
 *   - blocks requests presenting a valid admin key with 403
 *   - blocks unauthenticated requests with 401
 *
 * Vendors are NOT blocked: TwirlDrape is a multi-vendor marketplace where
 * sellers can also be buyers. Role separation happens at the product/order
 * level, not at this middleware layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ---------------------------------------------------------------------------
// Shared mutable state
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  /** When non-null, getAuth returns this userId. */
  userId: "customer-user-123" as string | null,
}));

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  const PRODUCT = {
    id: "prod-uuid-1",
    name: "Kanjivaram Silk Saree",
    price: 8000,
    images: ["img1.jpg"],
    vendorName: "Silk Palace",
    vendorId: null,
    stock: 10,
    lowStockThreshold: 5,
  };

  function makeSelectChain(rows: unknown[]) {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(rows)),
          for: vi.fn(() => Promise.resolve(rows)),
        })),
        for: vi.fn(() => Promise.resolve(rows)),
      })),
    };
  }

  const dbMock = {
    select: vi.fn((_fields?: any) => makeSelectChain([PRODUCT])),

    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => {
      let orderSeq = 1;
      const txMock = {
        select: vi.fn(() =>
          makeSelectChain([PRODUCT]),
        ),
        insert: vi.fn(() => ({
          values: vi.fn(() =>
            Object.assign(Promise.resolve(undefined), {
              returning: vi.fn(() =>
                Promise.resolve([{ id: `TD${orderSeq++}` }]),
              ),
              onConflictDoNothing: vi.fn(() => Promise.resolve()),
            }),
          ),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() =>
              Object.assign(Promise.resolve(undefined), {
                returning: vi.fn(() =>
                  Promise.resolve([{ totalPoints: 0, loyaltyTier: "silver" }]),
                ),
              }),
            ),
          })),
        })),
        delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
        execute: vi.fn(() => Promise.resolve({ rows: [{ seq: 1 }] })),
      };
      return cb(txMock);
    }),
  };

  return {
    db: dbMock,
    vendorsTable: { _t: "vendors", id: "id", ownerId: "ownerId" },
    ordersTable: { _t: "orders", id: "id", userId: "userId" },
    productsTable: {
      _t: "products",
      id: "id",
      name: "name",
      price: "price",
      images: "images",
      vendorName: "vendorName",
      vendorId: "vendorId",
      stock: "stock",
      lowStockThreshold: "lowStockThreshold",
    },
    cartItemsTable: { _t: "cartItems", userId: "userId" },
    couponsTable: { _t: "coupons", code: "code", active: "active", expiresAt: "expiresAt", id: "id" },
    couponRedemptionsTable: { _t: "couponRedemptions", couponId: "couponId", userId: "userId", id: "id", orderId: "orderId" },
    userProfilesTable: { _t: "userProfiles", userId: "userId", referralCode: "referralCode", totalPoints: "totalPoints", lifetimePoints: "lifetimePoints", loyaltyTier: "loyaltyTier", updatedAt: "updatedAt" },
    rewardPointsLogTable: { _t: "rewardPointsLog", userId: "userId", points: "points", type: "type", description: "description", orderId: "orderId" },
    notificationsTable: { _t: "notifications", userId: "userId", type: "type", title: "title", body: "body", metadata: "metadata", id: "id" },
    notificationPreferencesTable: { _t: "notificationPreferences", userId: "userId", orderUpdates: "orderUpdates", offerAlerts: "offerAlerts" },
    stockHistoryTable: { _t: "stockHistory", productId: "productId", vendorId: "vendorId", delta: "delta", previousStock: "previousStock", newStock: "newStock", source: "source", reason: "reason", actorId: "actorId", orderId: "orderId" },
    supportTicketsTable: { _t: "supportTickets", id: "id", userId: "userId" },
    vendorSettlementsTable: { _t: "vendorSettlements", id: "id", vendorId: "vendorId" },
    ADMIN_NOTIFICATION_USER_ID: "admin-notifications-user",
  };
});

// ---------------------------------------------------------------------------
// Clerk mock
// ---------------------------------------------------------------------------
vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() =>
    state.userId ? { userId: state.userId } : { userId: null },
  ),
  clerkMiddleware: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------
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

const ORDER_BODY = {
  items: [{ productId: "prod-uuid-1", quantity: 1 }],
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

const ADMIN_KEY = "test-admin-key";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/orders — isCustomer authorization", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.userId = "customer-user-123";
    app = await buildApp();
  });

  it("allows an authenticated customer to place an order (200)", async () => {
    const res = await request(app).post("/api/orders").send(ORDER_BODY);
    expect(res.status).toBe(200);
    expect(res.body.orderId).toBeDefined();
  });

  it("allows an approved vendor account to place an order (200)", async () => {
    // Vendors are also buyers in a multi-vendor marketplace.
    state.userId = "vendor-user-456";

    const res = await request(app).post("/api/orders").send(ORDER_BODY);

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBeDefined();
  });

  it("blocks a request presenting the admin key with 403", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("x-admin-key", ADMIN_KEY)
      .send(ORDER_BODY);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  it("blocks an unauthenticated request with 401", async () => {
    state.userId = null;

    const res = await request(app).post("/api/orders").send(ORDER_BODY);

    expect(res.status).toBe(401);
  });
});
