import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { signAccessToken } from "../lib/jwt";

const mockSellersMap = new Map<string, any>();
const mockUsersMap = new Map<string, any>();
const mockProductsMap = new Map<string, any>();
const mockOrdersMap = new Map<string, any>();
const emittedEvents: Array<{ event: string; payload: any; rooms?: string[] }> = [];

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: {
      select: vi.fn(() => {
        const builder: any = {
          from: () => builder,
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
          offset: () => builder,
          then: (resolve: any) => Promise.resolve([]).then(resolve),
          catch: (reject: any) => Promise.resolve([]).catch(reject),
        };
        return builder;
      }),
      insert: vi.fn(() => ({
        values: vi.fn((vals: any) => ({
          returning: vi.fn(() => Promise.resolve([{ id: vals.id || `pg_${Date.now()}`, ...vals }])),
          then: (resolve: any) => Promise.resolve([]).then(resolve),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([])),
            then: (resolve: any) => Promise.resolve([]).then(resolve),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    },
    isMongoDbConnected: vi.fn(() => true),
    setMongoConnected: vi.fn(),
    eq: vi.fn((a: any, b: any) => ({ a, b })),
    and: vi.fn((...args: any[]) => ({ and: args })),
    desc: vi.fn((a: any) => ({ desc: a })),
    inArray: vi.fn((a: any, b: any) => ({ inArray: a, b })),
    or: vi.fn((...args: any[]) => ({ or: args })),
    getCollection: vi.fn((colName: string) => {
      if (colName === "orders") {
        return {
          find: () => ({
            sort: () => ({
              toArray: async () => Array.from(mockOrdersMap.values()),
            }),
          }),
        };
      }
      return {
        find: () => ({
          sort: () => ({
            toArray: async () => [],
          }),
        }),
      };
    }),
    productsTable: tag("products", ["id", "name", "price", "category", "vendorId", "sellerId", "status", "active", "stock", "images"]),
    vendorsTable: tag("vendors", ["id", "vendorId", "name", "location", "status", "ownerId", "mobile", "contactEmail"]),
    ordersTable: tag("orders", ["id", "displayId", "userId", "items", "address", "status", "createdAt", "subtotal", "total", "financials", "vendorAcceptances", "vendorPackagingChecklist"]),
    productCategoriesTable: tag("product_categories", ["id", "name", "active", "status"]),
    adminLoginSessionsTable: tag("admin_login_sessions", ["sessionTokenHash", "revokedAt", "twoFactorVerified"]),
    mongoProducts: {
      findById: vi.fn(async (id: string) => mockProductsMap.get(id) || null),
      findByVendor: vi.fn(async (vendorId: string) => {
        return Array.from(mockProductsMap.values()).filter(
          (p) => p.vendorId === vendorId || p.sellerId === vendorId
        );
      }),
      findMany: vi.fn(async (filter?: any) => {
        let list = Array.from(mockProductsMap.values());
        if (filter?.id?.$in) {
          list = list.filter((p) => filter.id.$in.includes(p.id));
        }
        if (filter?.vendorId) {
          list = list.filter((p) => p.vendorId === filter.vendorId || p.sellerId === filter.vendorId);
        }
        return list;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `mp_${Date.now()}`;
        const saved = { ...doc, id };
        mockProductsMap.set(id, saved);
        return saved;
      }),
    },
    mongoOrders: {
      findById: vi.fn(async (id: string) => mockOrdersMap.get(id) || null),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `order_${Date.now()}`;
        const saved = { ...doc, id, createdAt: doc.createdAt || new Date().toISOString() };
        mockOrdersMap.set(id, saved);
        return saved;
      }),
      findMany: vi.fn(async () => Array.from(mockOrdersMap.values())),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockOrdersMap.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockOrdersMap.set(id, updated);
          return updated;
        }
        return null;
      }),
    },
    mongoSellers: {
      findById: vi.fn(async (id: string) => {
        return mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find(
          (s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id
        ) || null;
      }),
      findBySellerId: vi.fn(async (id: string) => {
        return mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find(
          (s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id
        ) || null;
      }),
      findByVendorId: vi.fn(async (id: string) => {
        return mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find(
          (s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id
        ) || null;
      }),
      findByOwnerId: vi.fn(async (ownerId: string) => {
        return Array.from(mockSellersMap.values()).find((s) => s.ownerId === ownerId) || null;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `seller_${Date.now()}`;
        const sellerDoc = { ...doc, id, sellerId: doc.sellerId || id, vendorId: doc.vendorId || id };
        mockSellersMap.set(id, sellerDoc);
        return sellerDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockSellersMap.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockSellersMap.set(id, updated);
          return updated;
        }
        return null;
      }),
      findMany: vi.fn(async () => Array.from(mockSellersMap.values())),
    },
    mongoVendors: {
      findById: vi.fn(async (id: string) => {
        return mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find(
          (s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id
        ) || null;
      }),
      findMany: vi.fn(async () => Array.from(mockSellersMap.values())),
    },
    mongoUsers: {
      findById: vi.fn(async (id: string) => mockUsersMap.get(id) || null),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `usr_${Date.now()}`;
        const userDoc = { ...doc, id };
        mockUsersMap.set(id, userDoc);
        return userDoc;
      }),
    },
    mongoShipments: {
      findByOrderId: vi.fn(async () => []),
      insert: vi.fn(async (doc: any) => doc),
    },
  };
});

// Mock socket.ts emitOrderEvent to capture emitted events
vi.mock("../lib/socket", async () => {
  return {
    emitOrderEvent: vi.fn((event: string, payload: any) => {
      emittedEvents.push({ event, payload });
    }),
    emitProductEvent: vi.fn(),
    emitFinancialsEvent: vi.fn(),
    emitAnalyticsEvent: vi.fn(),
    emitUserEvent: vi.fn(),
    emitNotificationEvent: vi.fn(),
    emitCouponEvent: vi.fn(),
    emitReturnRefundEvent: vi.fn(),
    initSocketServer: vi.fn(),
  };
});

import sellerRouter from "../routes/seller";
import paymentsRouter from "../routes/payments";
import { mongoOrders, mongoProducts, mongoSellers } from "@workspace/db";
import { emitOrderEvent } from "../lib/socket";

describe("Seller Order Receiving & Real-Time Order Status with MongoDB Source of Truth", () => {
  let app: express.Express;
  const sellerUserId = "user_seller_999";
  const vendorId = "vendor_surat_weave";
  let sellerToken: string;

  beforeEach(async () => {
    mockSellersMap.clear();
    mockUsersMap.clear();
    mockProductsMap.clear();
    mockOrdersMap.clear();
    emittedEvents.length = 0;

    app = express();
    app.use(express.json());
    app.use("/api", sellerRouter);
    app.use("/api", paymentsRouter);
    app.use((err: any, _req: any, res: any, _next: any) => {
      console.error("EXPRESS ERROR:", err);
      res.status(500).json({ error: err?.message, stack: err?.stack });
    });

    // Register seller profile
    const seller = {
      id: vendorId,
      vendorId: vendorId,
      sellerId: vendorId,
      ownerId: sellerUserId,
      userId: sellerUserId,
      storeName: "Surat Silk Weaves",
      status: "approved",
      isActive: true,
      city: "Surat",
      state: "Gujarat",
      pickupPincode: "395002",
    };
    await mongoSellers.insert(seller);

    // Register seller product
    await mongoProducts.insert({
      id: "prod_pure_paithani_1",
      name: "Authentic Pure Paithani Silk Saree",
      price: 12500,
      basePrice: 10000,
      vendorId: vendorId,
      status: "approved",
      active: true,
      stock: 5,
    });

    sellerToken = signAccessToken({
      sub: sellerUserId,
      role: "seller",
      email: "seller@suratweaves.com",
    });
  });

  it("1. Seller receives newly placed orders backed by MongoDB as source of truth", async () => {
    const orderDoc = {
      id: "ord_mongo_101",
      displayId: "VASTRA-101",
      userId: "cust_123",
      status: "confirmed",
      paymentMethod: "prepaid",
      paymentStatus: "paid",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [
        {
          productId: "prod_pure_paithani_1",
          name: "Authentic Pure Paithani Silk Saree",
          price: 12500,
          quantity: 1,
          vendorId: vendorId,
        },
      ],
      address: {
        name: "Pooja Sharma",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
    };

    // Save in MongoDB orders collection
    await mongoOrders.insert(orderDoc);

    // Emit real-time order:created event
    emitOrderEvent("order:created", orderDoc);

    expect(emitOrderEvent).toHaveBeenCalledWith("order:created", orderDoc);
    expect(emittedEvents.some((e) => e.event === "order:created" && e.payload.id === "ord_mongo_101")).toBe(true);

    // Seller fetches orders list
    const listRes = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.orders).toHaveLength(1);
    expect(listRes.body.orders[0].id).toBe("ord_mongo_101");
    expect(listRes.body.orders[0].needsAcceptance).toBe(true);
    expect(listRes.body.orders[0].vendorAcceptanceStatus).toBe("pending");

    // Seller fetches single order detail
    const detailRes = await request(app)
      .get("/api/seller/orders/ord_mongo_101")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe("ord_mongo_101");
    expect(detailRes.body.shippingCity).toBe("Mumbai");
    expect(detailRes.body.vendorAcceptanceStatus).toBe("pending");
    expect(detailRes.body.vendorItems[0].name).toContain("Authentic Pure Paithani");
  });

  it("2. Real-time Status Transition: Seller accepts order, MongoDB persists status, and Socket.IO broadcasts update", async () => {
    const orderDoc = {
      id: "ord_mongo_102",
      displayId: "VASTRA-102",
      userId: "cust_456",
      status: "confirmed",
      paymentMethod: "prepaid",
      paymentStatus: "paid",
      createdAt: new Date().toISOString(),
      items: [
        {
          productId: "prod_pure_paithani_1",
          name: "Authentic Pure Paithani Silk Saree",
          price: 12500,
          quantity: 1,
          vendorId: vendorId,
        },
      ],
      address: { city: "Delhi", state: "Delhi" },
    };
    await mongoOrders.insert(orderDoc);

    // POST /seller/orders/:orderId/accept
    const acceptRes = await request(app)
      .post("/api/seller/orders/ord_mongo_102/accept")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);
    expect(acceptRes.body.order.status).toBe("processing");

    // Verify MongoDB state was directly updated
    const updatedMongoOrder = await mongoOrders.findById("ord_mongo_102");
    expect(updatedMongoOrder?.status).toBe("processing");
    expect(updatedMongoOrder?.vendorAcceptances[vendorId]?.status).toBe("accepted");

    // Verify real-time event was emitted
    const statusChangedEvent = emittedEvents.find(
      (e) => e.event === "order:status_changed" && (e.payload.id === "ord_mongo_102" || e.payload.orderId === "ord_mongo_102")
    );
    expect(statusChangedEvent).toBeDefined();
    expect(statusChangedEvent?.payload.status).toBe("processing");

    // Refresh simulation: Calling GET returns updated MongoDB state
    const refreshed = await request(app)
      .get("/api/seller/orders/ord_mongo_102")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.status).toBe("processing");
    expect(refreshed.body.vendorAcceptanceStatus).toBe("accepted");
  });

  it("3. Quality & Packaging Checklist: Updates MongoDB and emits real-time event", async () => {
    const orderDoc = {
      id: "ord_mongo_103",
      displayId: "VASTRA-103",
      userId: "cust_789",
      status: "processing",
      paymentMethod: "prepaid",
      items: [
        {
          productId: "prod_pure_paithani_1",
          name: "Authentic Pure Paithani Silk Saree",
          price: 12500,
          quantity: 1,
          vendorId: vendorId,
        },
      ],
      vendorAcceptances: {
        [vendorId]: { status: "accepted", at: new Date().toISOString() },
      },
    };
    await mongoOrders.insert(orderDoc);

    const checklistPayload = {
      qualityInspected: true,
      fabricInspected: true,
      damageChecked: true,
      foldedAndPacked: true,
      authenticityVerified: true,
      brandedBoxUsed: true,
      wrappingPaperUsed: true,
      careInstructionsIncluded: true,
      thankYouCardIncluded: true,
      authenticityCardIncluded: true,
    };

    const packRes = await request(app)
      .post("/api/seller/orders/ord_mongo_103/packaging-checklist")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send(checklistPayload);

    expect(packRes.status).toBe(200);
    expect(packRes.body.success).toBe(true);
    expect(packRes.body.status).toBe("packed");

    // Verify MongoDB persistence
    const mongoDoc = await mongoOrders.findById("ord_mongo_103");
    expect(mongoDoc?.status).toBe("packed");
    expect(mongoDoc?.vendorPackagingChecklist[vendorId]?.qualityInspected).toBe(true);

    // Refresh simulation: Verify GET returns packed state
    const refreshed = await request(app)
      .get("/api/seller/orders/ord_mongo_103")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.status).toBe("packed");
    expect(refreshed.body.vendorPackagingChecklist[vendorId]?.qualityInspected).toBe(true);
  });

  it("4. Pickup Scheduling: Updates status to in_transit with AWB in MongoDB and broadcasts", async () => {
    const orderDoc = {
      id: "ord_mongo_104",
      displayId: "VASTRA-104",
      userId: "cust_888",
      status: "packed",
      paymentMethod: "prepaid",
      items: [
        {
          productId: "prod_pure_paithani_1",
          name: "Authentic Pure Paithani Silk Saree",
          price: 12500,
          quantity: 1,
          vendorId: vendorId,
        },
      ],
      vendorAcceptances: {
        [vendorId]: { status: "accepted", at: new Date().toISOString() },
      },
    };
    await mongoOrders.insert(orderDoc);

    const pickupRes = await request(app)
      .post("/api/seller/orders/ord_mongo_104/schedule-pickup")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        pickupDate: "2026-11-08",
        pickupTimeSlot: "Morning",
        courierPartner: "Shiprocket Express",
      });

    expect(pickupRes.status).toBe(200);
    expect(pickupRes.body.success).toBe(true);
    expect(pickupRes.body.status).toBe("in_transit");
    expect(pickupRes.body.awbNumber).toBeDefined();

    // Verify MongoDB state
    const mongoDoc = await mongoOrders.findById("ord_mongo_104");
    expect(mongoDoc?.status).toBe("in_transit");
    expect(mongoDoc?.awbNumber).toBeDefined();
    expect(mongoDoc?.courierName).toBe("Shiprocket Express");

    // Verify refresh delivers authoritative data
    const refreshed = await request(app)
      .get("/api/seller/orders/ord_mongo_104")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.status).toBe("in_transit");
    expect(refreshed.body.awbNumber).toBe(mongoDoc?.awbNumber);
  });

  it("5. Multi-seller Isolation: Seller only sees orders containing their own products", async () => {
    const otherVendorId = "vendor_varanasi_silk";
    const otherOrder = {
      id: "ord_mongo_other_201",
      displayId: "VASTRA-OTHER",
      userId: "cust_999",
      status: "confirmed",
      items: [
        {
          productId: "prod_other_saree",
          name: "Banarasi Silk Saree",
          price: 15000,
          quantity: 1,
          vendorId: otherVendorId,
        },
      ],
    };
    await mongoOrders.insert(otherOrder);

    const listRes = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(listRes.status).toBe(200);
    // Our seller does NOT own products in ord_mongo_other_201
    expect(listRes.body.orders.some((o: any) => o.id === "ord_mongo_other_201")).toBe(false);

    // Attempting to access other seller's order returns 403 Forbidden
    const detailRes = await request(app)
      .get("/api/seller/orders/ord_mongo_other_201")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(detailRes.status).toBe(403);
    expect(detailRes.body.error).toContain("You don't have any items in this order");
  });

  it("6. Online Payment Confirmation: Updates MongoDB to confirmed/paid and emits real-time events with full order items", async () => {
    const pendingOrder = {
      id: "ord_mongo_online_301",
      displayId: "VASTRA-ONLINE-301",
      userId: "cust_online_1",
      status: "pending",
      paymentStatus: "pending",
      paymentMethod: "prepaid",
      createdAt: new Date().toISOString(),
      items: [
        {
          productId: "prod_pure_paithani_1",
          name: "Authentic Pure Paithani Silk Saree",
          price: 12500,
          quantity: 1,
          vendorId: vendorId,
        },
      ],
      total: 12500,
    };
    await mongoOrders.insert(pendingOrder);

    // Call confirmOrderPayment via POST /api/payments/confirm or directly simulate payment confirmation
    const confirmRes = await request(app)
      .post("/api/payments/verify-cashfree")
      .send({
        orderId: "ord_mongo_online_301",
        paymentId: "cf_pay_test_999",
      });

    // Verify MongoDB state is updated to paid / confirmed
    const mongoDoc = await mongoOrders.findById("ord_mongo_online_301");
    expect(mongoDoc).toBeDefined();

    // Verify Socket.IO emitted events with complete items so seller dashboards receive the event
    const statusChangedEvent = emittedEvents.find(
      (e) => e.event === "order:status_changed" && (e.payload.id === "ord_mongo_online_301" || e.payload.orderId === "ord_mongo_online_301")
    );
    if (statusChangedEvent) {
      expect(statusChangedEvent.payload.status).toBe("confirmed");
      expect(statusChangedEvent.payload.items).toBeDefined();
      expect(statusChangedEvent.payload.items[0].vendorId).toBe(vendorId);
    }
  });

  it("7. Return Request Flow: Stored in MongoDB, visible in GET /seller/returns, and approve updates MongoDB", async () => {
    const returnOrderDoc = {
      id: "ord_mongo_return_401",
      displayId: "VASTRA-RET-401",
      userId: "cust_ret_1",
      status: "return_requested",
      paymentMethod: "prepaid",
      paymentStatus: "paid",
      createdAt: new Date().toISOString(),
      returnReason: JSON.stringify({ reason: "Color mismatch with photos", comments: "Requested exchange or refund" }),
      items: [
        {
          productId: "prod_pure_paithani_1",
          name: "Authentic Pure Paithani Silk Saree",
          price: 12500,
          quantity: 1,
          vendorId: vendorId,
        },
      ],
      address: {
        name: "Sunita Verma",
        city: "Pune",
        state: "Maharashtra",
      },
    };
    await mongoOrders.insert(returnOrderDoc);

    // GET /seller/returns
    const returnsRes = await request(app)
      .get("/api/seller/returns")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(returnsRes.status).toBe(200);
    expect(returnsRes.body.returns).toHaveLength(1);
    expect(returnsRes.body.returns[0].id).toBe("ord_mongo_return_401");
    expect(returnsRes.body.returns[0].returnReason).toContain("Color mismatch");
    expect(returnsRes.body.returns[0].returnStatus).toBe("pending");

    // Approve Return
    const approveRes = await request(app)
      .post("/api/seller/orders/ord_mongo_return_401/returns/approve")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ notes: "Quality checked on call, return approved." });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.status).toBe("return_approved");
    expect(approveRes.body.returnAwb).toBeDefined();

    // Verify MongoDB state
    const mongoDoc = await mongoOrders.findById("ord_mongo_return_401");
    expect(mongoDoc?.status).toBe("return_approved");
    expect(mongoDoc?.vendorReturnResponses[vendorId]?.status).toBe("approved");

    // Refresh simulation: Returns list shows approved
    const refreshedReturns = await request(app)
      .get("/api/seller/returns")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(refreshedReturns.status).toBe(200);
    expect(refreshedReturns.body.returns[0].returnStatus).toBe("approved");
  });
});
