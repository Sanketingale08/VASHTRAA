import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { signAccessToken } from "../lib/jwt";

const mockSellersMap = new Map<string, any>();
const mockUsersMap = new Map<string, any>();
const mockProductsMap = new Map<string, any>();
const mockOrdersMap = new Map<string, any>();
const mockSellerNotifications: any[] = [];
const mockAdminNotifications: any[] = [];

let orderSeq = 1000;

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
          returning: vi.fn(() => {
            const row = { id: vals.id || `pg_prod_${Date.now()}`, ...vals };
            return Promise.resolve([row]);
          }),
          then: (resolve: any) => Promise.resolve([]).then(resolve),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((updates: any) => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([])),
            then: (resolve: any) => Promise.resolve([]).then(resolve),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
      execute: vi.fn().mockResolvedValue({ rows: [{ seq: 101 }] }),
    },
    productsTable: tag("products", ["id", "name", "price", "category", "vendorId", "sellerId", "status", "active", "stock", "lowStockThreshold", "images", "vendorName"]),
    vendorsTable: tag("vendors", ["id", "vendorId", "name", "location", "status", "ownerId", "mobile", "contactEmail"]),
    ordersTable: tag("orders", ["id", "displayId", "userId", "items", "address", "status", "createdAt", "subtotal", "total", "financials"]),
    orderItemsTable: tag("order_items", ["id", "orderId", "productId", "vendorId"]),
    productCategoriesTable: tag("product_categories", ["id", "name", "active", "status"]),
    productBrandsTable: tag("product_brands", ["id", "name", "active"]),
    siteSettingsTable: tag("site_settings", ["key", "value", "updatedAt"]),
    adminLoginSessionsTable: tag("admin_login_sessions", ["sessionTokenHash", "revokedAt", "twoFactorVerified"]),
    commissionRulesTable: tag("commission_rules", ["active"]),
    vendorSettlementsTable: tag("vendor_settlements", ["id", "vendorId", "orderId"]),
    wishlistsTable: tag("wishlists", ["userId", "productId"]),
    notificationsTable: tag("notifications", ["userId", "type"]),
    notificationPreferencesTable: tag("notification_preferences", ["userId"]),
    searchQueriesTable: tag("search_queries", ["term"]),
    CATEGORY_PREFIX: {
      paithani: "PT",
      designer: "DS",
      bridal: "BR",
      silk: "SK",
    },
    getNextSequenceValue: vi.fn(async () => ++orderSeq),
    mongoProducts: {
      findById: vi.fn(async (id: string) => mockProductsMap.get(id) || null),
      findByVendor: vi.fn(async (vendorId: string) => {
        return Array.from(mockProductsMap.values()).filter(
          (p) => p.vendorId === vendorId || p.sellerId === vendorId
        );
      }),
      findMany: vi.fn(async (filter?: any) => {
        let list = Array.from(mockProductsMap.values());
        if (filter) {
          if (filter.active === true) {
            list = list.filter((p) => p.active === true);
          }
          if (filter.vendorId) {
            list = list.filter((p) => p.vendorId === filter.vendorId || p.sellerId === filter.vendorId);
          }
          if (filter.status) {
            list = list.filter((p) => p.status === filter.status);
          }
        }
        return list;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `mp_${Date.now()}`;
        const saved = { ...doc, id };
        mockProductsMap.set(id, saved);
        return saved;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockProductsMap.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockProductsMap.set(id, updated);
          return updated;
        }
        return null;
      }),
      decrementStock: vi.fn(async (id: string, qty: number) => {
        const existing = mockProductsMap.get(id);
        if (existing) {
          existing.stock = Math.max(0, (existing.stock ?? 10) - qty);
          mockProductsMap.set(id, existing);
          return { stock: existing.stock };
        }
        return { stock: 0 };
      }),
      delete: vi.fn(async (id: string) => {
        mockProductsMap.delete(id);
        return true;
      }),
      getAdminStats: vi.fn(async () => {
        const all = Array.from(mockProductsMap.values());
        return {
          total: all.length,
          pending: all.filter((p) => p.status === "pending").length,
          approved: all.filter((p) => p.status === "approved").length,
          rejected: all.filter((p) => p.status === "rejected").length,
          featured: all.filter((p) => p.isFeatured && p.active).length,
          activeCategories: 5,
          activeBrands: 3,
        };
      }),
    },
    mongoOrders: {
      findById: vi.fn(async (id: string) => mockOrdersMap.get(id) || null),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `order_${Date.now()}`;
        const saved = { ...doc, id, createdAt: doc.createdAt || new Date() };
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
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase();
        return Array.from(mockSellersMap.values()).find(
          (s) => (s.email || "").toLowerCase() === clean || (s.contactEmail || "").toLowerCase() === clean
        ) || null;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `seller_${Date.now()}`;
        const sellerDoc = { ...doc, id, sellerId: doc.sellerId || id, vendorId: doc.vendorId || id };
        mockSellersMap.set(id, sellerDoc);
        return sellerDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find((s) => s.id === id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockSellersMap.set(existing.id, updated);
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
      findByOwnerId: vi.fn(async (ownerId: string) => {
        return Array.from(mockSellersMap.values()).find((s) => s.ownerId === ownerId) || null;
      }),
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase();
        return Array.from(mockSellersMap.values()).find(
          (s) => (s.email || "").toLowerCase() === clean
        ) || null;
      }),
      findMany: vi.fn(async () => Array.from(mockSellersMap.values())),
    },
    mongoUsers: {
      findById: vi.fn(async (id: string) => {
        return mockUsersMap.get(id) || Array.from(mockUsersMap.values()).find((u) => u.id === id) || null;
      }),
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase();
        return Array.from(mockUsersMap.values()).find((u) => (u.email || "").toLowerCase() === clean) || null;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `usr_${Date.now()}`;
        const userDoc = { ...doc, id };
        mockUsersMap.set(id, userDoc);
        return userDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockUsersMap.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockUsersMap.set(id, updated);
          return updated;
        }
        return null;
      }),
    },
    mongoNotifications: {
      findMany: vi.fn(async (filter?: any) => {
        let list = [...mockSellerNotifications];
        if (filter?.vendorId) {
          list = list.filter((n) => n.vendorId === filter.vendorId);
        }
        return list;
      }),
      count: vi.fn(async (filter?: any) => {
        let list = [...mockSellerNotifications];
        if (filter?.vendorId) {
          list = list.filter((n) => n.vendorId === filter.vendorId);
        }
        if (filter?.read !== undefined) {
          list = list.filter((n) => n.read === filter.read);
        }
        return list.length;
      }),
      insert: vi.fn(async (doc: any) => {
        mockSellerNotifications.push(doc);
        return doc;
      }),
    },
    mongoSiteSettings: {
      get: vi.fn(async (key: string) => {
        if (key === "admin_2fa_enabled") return "false";
        return null;
      }),
    },
    mongoGeneric: {
      getCollection: vi.fn(() => ({
        insertOne: vi.fn().mockResolvedValue({}),
      })),
    },
    validateCategoryAndSubcategory: vi.fn((cat: string, subcat?: string) => ({
      valid: true,
      category: cat || "paithani",
      categoryName: cat || "Paithani Sarees",
      subcategory: subcat || null,
      subcategoryName: subcat || null,
      categoryDef: { prefix: "PRD" },
    })),
    resolveCategoryData: vi.fn((cat: string, subcat?: string) => ({
      category: cat || "paithani",
      categoryName: cat || "Paithani Sarees",
      categoryId: "cat_1",
      parentCategoryId: null,
      parentCategoryName: null,
      subcategory: subcat || null,
      subcategoryName: subcat || null,
      subcategoryId: null,
    })),
    findCategoryDefinition: vi.fn(() => ({ prefix: "PRD" })),
    isMongoDbConnected: vi.fn().mockReturnValue(true),
    setMongoConnected: vi.fn(),
    getCollection: vi.fn(() => ({
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      updateOne: vi.fn().mockResolvedValue({}),
      insertOne: vi.fn().mockResolvedValue({}),
    })),
    eq: (a: any, b: any) => ({ a, b }),
    or: (...args: any[]) => ({ args }),
    and: (...args: any[]) => ({ args }),
    sql: Object.assign((strings: any, ...exprs: any[]) => ({ strings, exprs }), {
      raw: (str: string) => ({ raw: str }),
    }),
    desc: vi.fn(),
    asc: vi.fn(),
    inArray: vi.fn(),
    ilike: vi.fn(),
    gte: (a: any, b: any) => ({ a, b }),
    lte: (a: any, b: any) => ({ a, b }),
    lt: (a: any, b: any) => ({ a, b }),
    isNull: (a: any) => a,
    isNotNull: (a: any) => a,
  };
});

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn(async (notif: any) => {
    mockAdminNotifications.push(notif);
    return notif;
  }),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn(async (notif: any) => {
    const item = { id: `snotif_${Date.now()}_${Math.random()}`, read: false, createdAt: new Date(), ...notif };
    mockSellerNotifications.push(item);
    return item;
  }),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: () => "127.0.0.1",
}));

vi.mock("../lib/socket", () => ({
  emitProductEvent: vi.fn(),
  emitOrderEvent: vi.fn(),
}));

import productsRouter from "../routes/products";
import sellerRouter from "../routes/seller";
import adminProductsRouter from "../routes/adminProducts";
import ordersRouter from "../routes/orders";
import sellerNotificationsRouter from "../routes/sellerNotifications";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", productsRouter);
  app.use("/api", sellerRouter);
  app.use("/api", adminProductsRouter);
  app.use("/api", ordersRouter);
  app.use("/api", sellerNotificationsRouter);
  return app;
}

describe("E2E Seller-to-Customer Product and Order Flow", () => {
  let app: express.Express;
  const adminSecret = "secret-key-12345";
  const sellerAId = "seller_crafts_a";
  const sellerBId = "seller_weaves_b";
  let sellerAToken: string;
  let sellerBToken: string;
  let customerToken: string;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = adminSecret;
    mockSellersMap.clear();
    mockUsersMap.clear();
    mockProductsMap.clear();
    mockOrdersMap.clear();
    mockSellerNotifications.length = 0;
    mockAdminNotifications.length = 0;

    // Seed approved seller A
    mockSellersMap.set(sellerAId, {
      id: sellerAId,
      vendorId: sellerAId,
      sellerId: sellerAId,
      ownerId: sellerAId,
      name: "Heritage Paithani Crafts",
      shopName: "Heritage Paithani Crafts",
      contactEmail: "crafts@example.com",
      status: "approved",
      active: true,
      profileIncomplete: false,
    });

    // Seed approved seller B
    mockSellersMap.set(sellerBId, {
      id: sellerBId,
      vendorId: sellerBId,
      sellerId: sellerBId,
      ownerId: sellerBId,
      name: "Royal Designer Weaves",
      shopName: "Royal Designer Weaves",
      contactEmail: "weaves@example.com",
      status: "approved",
      active: true,
      profileIncomplete: false,
    });

    sellerAToken = signAccessToken({
      sub: sellerAId,
      role: "seller",
      email: "crafts@example.com",
    });

    sellerBToken = signAccessToken({
      sub: sellerBId,
      role: "seller",
      email: "weaves@example.com",
    });

    customerToken = signAccessToken({
      sub: "cust_12345",
      role: "customer",
      email: "customer@example.com",
    });

    app = createApp();
  });

  it("completes the full flow: Seller adds product -> Admin approves -> Appears on customer side -> Customer orders -> Stock decrements & Seller receives order", async () => {
    // -------------------------------------------------------------
    // Step 1: Seller Adds Product
    // -------------------------------------------------------------
    const createRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        name: "Pure Silk Peacock Paithani",
        description: "Handcrafted traditional silk paithani saree with zari border",
        category: "paithani",
        price: 12000,
        stock: 5,
        lowStockThreshold: 2,
        images: ["https://example.com/paithani1.jpg"],
        fabric: "silk",
        color: "red",
        occasion: "festival",
      });

    expect(createRes.status).toBe(201);
    const createdProduct = createRes.body;
    expect(createdProduct).toBeDefined();
    const productId = createdProduct.id;
    expect(productId).toBeDefined();
    expect(createdProduct.status).toBe("pending");
    expect(createdProduct.active).toBe(false);
    expect(createdProduct.vendorId).toBe(sellerAId);

    // Verify notifications were dispatched for pending product
    const adminPendingNotif = mockAdminNotifications.find(
      (n) => n.type === "product_pending_approval" && n.metadata?.productId === productId
    );
    expect(adminPendingNotif).toBeDefined();

    // -------------------------------------------------------------
    // Step 2: Pending product does NOT appear on customer-facing site
    // -------------------------------------------------------------
    const publicListBefore = await request(app).get("/api/products");
    expect(publicListBefore.status).toBe(200);
    const foundBefore = publicListBefore.body.products.find((p: any) => p.id === productId);
    expect(foundBefore).toBeUndefined();

    const publicDetailBefore = await request(app).get(`/api/products/${productId}`);
    expect(publicDetailBefore.status).toBe(404);

    // Customer cannot place order for pending product
    const orderPendingAttempt = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ productId, quantity: 1 }],
        address: { name: "Buyer User", city: "Pune", state: "Maharashtra", pinCode: "411001", address: "Shivaji Nagar" },
        paymentMethod: "cod",
      });
    expect(orderPendingAttempt.status).toBe(400);

    // -------------------------------------------------------------
    // Step 3: Admin Approves Product
    // -------------------------------------------------------------
    const approveRes = await request(app)
      .post(`/api/admin/products/${productId}/approve`)
      .set("x-admin-key", adminSecret)
      .send({ remark: "Meets quality standards" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.product.status).toBe("approved");
    expect(approveRes.body.product.active).toBe(true);

    // Verify seller receives approval notification
    const approvalNotif = mockSellerNotifications.find(
      (n) => n.vendorId === sellerAId && n.type === "product_approved" && n.metadata?.productId === productId
    );
    expect(approvalNotif).toBeDefined();

    // -------------------------------------------------------------
    // Step 4: Approved Product Appears on User Side
    // -------------------------------------------------------------
    const publicListAfter = await request(app).get("/api/products");
    expect(publicListAfter.status).toBe(200);
    const foundAfter = publicListAfter.body.products.find((p: any) => p.id === productId);
    expect(foundAfter).toBeDefined();
    expect(foundAfter.name).toBe("Pure Silk Peacock Paithani");

    const publicDetailAfter = await request(app).get(`/api/products/${productId}`);
    expect(publicDetailAfter.status).toBe(200);
    expect(publicDetailAfter.body.id).toBe(productId);
    expect(publicDetailAfter.body.stock).toBe(5);

    // -------------------------------------------------------------
    // Step 5: User Completes Checkout
    // -------------------------------------------------------------
    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ productId, quantity: 1 }],
        address: { name: "Ananya Sharma", city: "Mumbai", state: "Maharashtra", pinCode: "400001", address: "Marine Drive" },
        paymentMethod: "cod",
      });

    expect(orderRes.status).toBe(200);
    expect(orderRes.body.order).toBeDefined();
    const orderId = orderRes.body.order.id;

    // -------------------------------------------------------------
    // Step 6: Inventory Decrements & Seller Order Notification
    // -------------------------------------------------------------
    const productInDb = mockProductsMap.get(productId);
    expect(productInDb.stock).toBe(4); // Was 5, decremented by 1

    const newOrderNotif = mockSellerNotifications.find(
      (n) => n.vendorId === sellerAId && n.type === "new_order" && n.metadata?.orderId === orderId
    );
    expect(newOrderNotif).toBeDefined();

    // -------------------------------------------------------------
    // Step 7: Seller Receives Order in Seller Dashboard & Orders Section
    // -------------------------------------------------------------
    const sellerOrdersRes = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", `Bearer ${sellerAToken}`);

    expect(sellerOrdersRes.status).toBe(200);
    expect(sellerOrdersRes.body.orders).toBeDefined();
    const sellerOrder = sellerOrdersRes.body.orders.find((o: any) => o.id === orderId);
    expect(sellerOrder).toBeDefined();
    expect(sellerOrder.vendorItems.length).toBe(1);
    expect(sellerOrder.vendorItems[0].productId).toBe(productId);

    const sellerDashRes = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", `Bearer ${sellerAToken}`);

    expect(sellerDashRes.status).toBe(200);
    expect(sellerDashRes.body.orderCount).toBeGreaterThanOrEqual(1);
  });

  it("correctly partitions multi-vendor orders between sellers", async () => {
    // Seller A product (approved)
    const prodA = {
      id: "prod_paithani_101",
      name: "Seller A Paithani",
      category: "paithani",
      price: 15000,
      stock: 10,
      lowStockThreshold: 3,
      status: "approved",
      active: true,
      vendorId: sellerAId,
      sellerId: sellerAId,
      vendorName: "Heritage Paithani Crafts",
      images: ["https://example.com/a.jpg"],
    };
    mockProductsMap.set(prodA.id, prodA);

    // Seller B product (approved)
    const prodB = {
      id: "prod_designer_202",
      name: "Seller B Designer Saree",
      category: "designer",
      price: 20000,
      stock: 8,
      lowStockThreshold: 2,
      status: "approved",
      active: true,
      vendorId: sellerBId,
      sellerId: sellerBId,
      vendorName: "Royal Designer Weaves",
      images: ["https://example.com/b.jpg"],
    };
    mockProductsMap.set(prodB.id, prodB);

    // Customer orders 1 item from Seller A and 1 item from Seller B
    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [
          { productId: prodA.id, quantity: 1 },
          { productId: prodB.id, quantity: 2 },
        ],
        address: { name: "Pooja Hegde", city: "Nagpur", state: "Maharashtra", pinCode: "440001", address: "Civil Lines" },
        paymentMethod: "cod",
      });

    expect(orderRes.status).toBe(200);
    const orderId = orderRes.body.order.id;

    // Verify stock decremented for both
    expect(mockProductsMap.get(prodA.id).stock).toBe(9);
    expect(mockProductsMap.get(prodB.id).stock).toBe(6);

    // Verify both sellers received new_order notifications
    const notifA = mockSellerNotifications.find(
      (n) => n.vendorId === sellerAId && n.type === "new_order" && n.metadata?.orderId === orderId
    );
    const notifB = mockSellerNotifications.find(
      (n) => n.vendorId === sellerBId && n.type === "new_order" && n.metadata?.orderId === orderId
    );
    expect(notifA).toBeDefined();
    expect(notifB).toBeDefined();

    // Verify Seller A only sees their item
    const resA = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", `Bearer ${sellerAToken}`);
    expect(resA.status).toBe(200);
    const orderInA = resA.body.orders.find((o: any) => o.id === orderId);
    expect(orderInA).toBeDefined();
    expect(orderInA.vendorItems.length).toBe(1);
    expect(orderInA.vendorItems[0].productId).toBe(prodA.id);
    expect(orderInA.vendorTotal).toBe(15000);

    // Verify Seller B only sees their item
    const resB = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", `Bearer ${sellerBToken}`);
    expect(resB.status).toBe(200);
    const orderInB = resB.body.orders.find((o: any) => o.id === orderId);
    expect(orderInB).toBeDefined();
    expect(orderInB.vendorItems.length).toBe(1);
    expect(orderInB.vendorItems[0].productId).toBe(prodB.id);
    expect(orderInB.vendorTotal).toBe(40000); // 20000 * 2
  });

  it("rejects dummy products not found in the catalog", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ productId: "non_existent_dummy_999", name: "Fabricated Product", price: 500, quantity: 1 }],
        address: { name: "Ravi Kumar", city: "Pune", state: "Maharashtra", pinCode: "411002", address: "Camp" },
        paymentMethod: "cod",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("was not found in the catalog");
  });

  it("triggers out_of_stock notification and prevents purchasing when stock runs out", async () => {
    const limitedProd = {
      id: "prod_limited_stock",
      name: "Limited Edition Bridal Saree",
      category: "bridal",
      price: 25000,
      stock: 1,
      lowStockThreshold: 1,
      status: "approved",
      active: true,
      vendorId: sellerAId,
      sellerId: sellerAId,
      vendorName: "Heritage Paithani Crafts",
      images: ["https://example.com/bridal.jpg"],
    };
    mockProductsMap.set(limitedProd.id, limitedProd);

    // Buy the 1 available unit
    const buyRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ productId: limitedProd.id, quantity: 1 }],
        address: { name: "Kavita Roy", city: "Mumbai", state: "Maharashtra", pinCode: "400050", address: "Bandra" },
        paymentMethod: "cod",
      });

    expect(buyRes.status).toBe(200);
    expect(mockProductsMap.get(limitedProd.id).stock).toBe(0);

    // Seller receives out_of_stock alert
    const oosNotif = mockSellerNotifications.find(
      (n) => n.vendorId === sellerAId && n.type === "out_of_stock" && n.metadata?.productId === limitedProd.id
    );
    expect(oosNotif).toBeDefined();

    // Subsequent customer purchase attempt is blocked
    const failedBuyRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ productId: limitedProd.id, quantity: 1 }],
        address: { name: "Another Customer", city: "Mumbai", state: "Maharashtra", pinCode: "400050", address: "Bandra" },
        paymentMethod: "cod",
      });

    expect(failedBuyRes.status).toBe(400);
    expect(failedBuyRes.body.error).toContain("out of stock");
  });
});
