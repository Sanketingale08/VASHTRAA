import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { signAccessToken } from "../lib/jwt";

const mockSellersMap = new Map<string, any>();
const mockUsersMap = new Map<string, any>();
const mockProductsMap = new Map<string, any>();
const mockSellerNotifications: any[] = [];
const mockAdminNotifications: any[] = [];

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
            orderBy: vi.fn(() => Promise.resolve([])),
          })),
          orderBy: vi.fn(() => Promise.resolve([])),
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((vals: any) => ({
          returning: vi.fn(() => {
            const row = { id: vals.id || `pg_prod_${Date.now()}`, ...vals };
            return Promise.resolve([row]);
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((updates: any) => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => {
              return Promise.resolve([{ id: "test-prod", ...updates }]);
            }),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
      execute: vi.fn().mockResolvedValue({ rows: [{ seq: 101 }] }),
    },
    productsTable: tag("products", ["id", "name", "price", "category", "vendorId", "sellerId", "status", "active"]),
    vendorsTable: tag("vendors", ["id", "vendorId", "name", "location", "status", "ownerId", "mobile", "contactEmail"]),
    ordersTable: tag("orders", ["id", "status"]),
    orderItemsTable: tag("order_items", ["id", "orderId", "productId", "vendorId"]),
    productCategoriesTable: tag("product_categories", ["id", "name", "active", "status"]),
    productBrandsTable: tag("product_brands", ["id", "name", "active"]),
    siteSettingsTable: tag("site_settings", ["key", "value", "updatedAt"]),
    adminLoginSessionsTable: tag("admin_login_sessions", ["sessionTokenHash", "revokedAt", "twoFactorVerified"]),
    commissionRulesTable: tag("commission_rules", ["active"]),
    CATEGORY_PREFIX: {
      banarasi: "BN",
      kanjeevaram: "KJ",
      chanderi: "CH",
      paithani: "PT",
      silk: "SK",
      tussar: "TS",
      cotton: "CT",
    },
    getNextSequenceValue: vi.fn().mockResolvedValue(101),
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
    mongoSiteSettings: {
      get: vi.fn(async (key: string) => {
        if (key === "admin_2fa_enabled") return "false";
        if (key === "admin_key_hash") return "hash:dev-admin-key";
        return null;
      }),
    },
    mongoGeneric: vi.fn(),
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
    mockSellerNotifications.push(notif);
    return notif;
  }),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: () => "127.0.0.1",
}));

vi.mock("../lib/socket", () => ({
  emitProductEvent: vi.fn(),
}));

import productsRouter from "../routes/products";
import sellerRouter from "../routes/seller";
import adminProductsRouter from "../routes/adminProducts";

describe("Vendor Product Creation, Approval, and Storefront Flow", () => {
  let app: express.Express;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = "dev-admin-key";
    mockSellersMap.clear();
    mockUsersMap.clear();
    mockProductsMap.clear();
    mockSellerNotifications.length = 0;
    mockAdminNotifications.length = 0;

    app = express();
    app.use(express.json());
    app.use("/api", productsRouter);
    app.use("/api", sellerRouter);
    app.use("/api", adminProductsRouter);
  });

  const approvedSellerUser = {
    id: "usr_seller_gold",
    email: "goldseller@vastraa.com",
    role: "seller" as const,
  };

  const approvedVendorProfile = {
    id: "vend_gold_777",
    sellerId: "VEND_GOLD_777",
    vendorId: "TDV123456",
    ownerId: approvedSellerUser.id,
    name: "Vastraa Heritage Silks",
    shopName: "Vastraa Heritage Silks",
    email: approvedSellerUser.email,
    contactEmail: approvedSellerUser.email,
    status: "approved",
    rating: 4.9,
    location: "Varanasi, Uttar Pradesh",
  };

  it("1. Approved seller submits product: saved to MongoDB as 'pending' with correct vendorId and notifications", async () => {
    mockUsersMap.set(approvedSellerUser.id, approvedSellerUser);
    mockSellersMap.set(approvedVendorProfile.id, approvedVendorProfile);

    const token = signAccessToken({
      sub: approvedSellerUser.id,
      email: approvedSellerUser.email,
      role: "seller",
    });

    const newProductPayload = {
      name: "Banarasi Katan Silk Saree",
      description: "Authentic handwoven Banarasi pure katan silk saree with gold zari kadwa motifs.",
      category: "banarasi",
      price: 18500,
      originalPrice: 22000,
      fabric: "Pure Silk",
      color: "Royal Red",
      occasion: "Bridal",
      stock: 5,
      images: [
        "https://r2.vastraa.com/products/banarasi_front.webp",
        "https://r2.vastraa.com/products/banarasi_pallu.webp",
      ],
      variants: [
        {
          attributes: [{ name: "Color", value: "Ruby Red" }],
          price: 18500,
          stock: 3,
        },
      ],
      specifications: [
        { key: "Weave", value: "Handloom Kadwa" },
        { key: "Zari", value: "Tested Gold Zari" },
      ],
    };

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send(newProductPayload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("Banarasi Katan Silk Saree");
    expect(res.body.status).toBe("pending");
    expect(res.body.active).toBe(false);
    expect(res.body.vendorId).toBe("TDV123456");
    expect(res.body.vendorName).toBe("Vastraa Heritage Silks");

    // Verify stored in MongoDB mock with correct vendor linkage
    const savedInMongo = mockProductsMap.get(res.body.id);
    expect(savedInMongo).toBeDefined();
    expect(savedInMongo.status).toBe("pending");
    expect(savedInMongo.active).toBe(false);
    expect(savedInMongo.vendorId).toBe("TDV123456");
    expect(savedInMongo.vendorName).toBe("Vastraa Heritage Silks");
    expect(savedInMongo.images).toHaveLength(2);

    // Verify notifications were triggered with resolved seller name
    expect(mockSellerNotifications.length).toBeGreaterThan(0);
    expect(mockSellerNotifications[0].type).toBe("product_pending_approval");
    expect(mockAdminNotifications.length).toBeGreaterThan(0);
    expect(mockAdminNotifications[0].type).toBe("product_pending_approval");
    expect(mockAdminNotifications[0].body).toContain('from seller "Vastraa Heritage Silks" requires approval');
  });

  it("2. Seller can save product as draft with status 'draft'", async () => {
    mockUsersMap.set(approvedSellerUser.id, approvedSellerUser);
    mockSellersMap.set(approvedVendorProfile.id, approvedVendorProfile);

    const token = signAccessToken({
      sub: approvedSellerUser.id,
      email: approvedSellerUser.email,
      role: "seller",
    });

    const draftPayload = {
      name: "Draft Chanderi Saree",
      category: "chanderi",
      price: 6000,
      status: "draft",
      fabric: "Silk Cotton",
    };

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send(draftPayload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.active).toBe(false);
    expect(res.body.vendorId).toBe("TDV123456");

    const saved = mockProductsMap.get(res.body.id);
    expect(saved.status).toBe("draft");
  });

  it("3. Seller product list GET /api/seller/products retrieves submitted pending and draft products", async () => {
    mockUsersMap.set(approvedSellerUser.id, approvedSellerUser);
    mockSellersMap.set(approvedVendorProfile.id, approvedVendorProfile);

    mockProductsMap.set("prod_pending_1", {
      id: "prod_pending_1",
      name: "Pending Paithani",
      price: 14000,
      vendorId: "TDV123456",
      sellerId: "VEND_GOLD_777",
      status: "pending",
      active: false,
      stock: 4,
    });

    mockProductsMap.set("prod_draft_1", {
      id: "prod_draft_1",
      name: "Draft Kanjeevaram",
      price: 21000,
      vendorId: "TDV123456",
      sellerId: "VEND_GOLD_777",
      status: "draft",
      active: false,
      stock: 2,
    });

    const token = signAccessToken({
      sub: approvedSellerUser.id,
      email: approvedSellerUser.email,
      role: "seller",
    });

    const res = await request(app)
      .get("/api/seller/products")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("products");
    const products = res.body.products;
    expect(products.length).toBe(2);

    const pendingProd = products.find((p: any) => p.id === "prod_pending_1");
    expect(pendingProd).toBeDefined();
    expect(pendingProd.status).toBe("pending");

    const draftProd = products.find((p: any) => p.id === "prod_draft_1");
    expect(draftProd).toBeDefined();
    expect(draftProd.status).toBe("draft");
  });

  it("4. Admin can approve pending product via POST /api/admin/products/:id/approve", async () => {
    mockProductsMap.set("prod_to_approve", {
      id: "prod_to_approve",
      name: "Gadwal Pure Silk Saree",
      price: 11000,
      vendorId: "TDV123456",
      status: "pending",
      active: false,
    });

    const res = await request(app)
      .post("/api/admin/products/prod_to_approve/approve")
      .set("x-admin-key", "dev-admin-key")
      .send({ remark: "Quality verified" });

    expect(res.status).toBe(200);

    const approvedInMongo = mockProductsMap.get("prod_to_approve");
    expect(approvedInMongo.status).toBe("approved");
    expect(approvedInMongo.active).toBe(true);
  });

  it("5. Storefront visibility rules: pending and draft products are hidden; approved products are visible", async () => {
    mockSellersMap.set(approvedVendorProfile.id, approvedVendorProfile);

    mockProductsMap.set("prod_pending_hide", {
      id: "prod_pending_hide",
      name: "Hidden Pending Saree",
      price: 9000,
      category: "tussar",
      vendorId: "TDV123456",
      status: "pending",
      active: false,
    });

    mockProductsMap.set("prod_draft_hide", {
      id: "prod_draft_hide",
      name: "Hidden Draft Saree",
      price: 5000,
      category: "cotton",
      vendorId: "TDV123456",
      status: "draft",
      active: false,
    });

    mockProductsMap.set("prod_approved_show", {
      id: "prod_approved_show",
      name: "Visible Approved Saree",
      price: 12500,
      category: "silk",
      vendorId: "TDV123456",
      status: "approved",
      active: true,
    });

    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);

    const items = Array.isArray(res.body) ? res.body : (res.body.products || []);
    const returnedIds = items.map((p: any) => p.id);

    expect(returnedIds).not.toContain("prod_pending_hide");
    expect(returnedIds).not.toContain("prod_draft_hide");
    expect(returnedIds).toContain("prod_approved_show");
  });

  it("6. Gatekeeping checks prevent unauthorized product submission", async () => {
    // 6a-1: Customer account attempting seller action -> 403 ROLE_MISMATCH
    const customerToken = signAccessToken({
      sub: "usr_customer_random",
      email: "shopper@gmail.com",
      role: "customer",
    });

    const resCustomer = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ name: "Unauthorized Saree", price: 5000, category: "silk" });

    expect(resCustomer.status).toBe(403);
    expect(resCustomer.body.code).toBe("ROLE_MISMATCH");

    // 6a-2: Seller account with no vendor profile -> 403 VENDOR_NOT_FOUND
    const orphanSellerToken = signAccessToken({
      sub: "usr_orphan_seller",
      email: "orphan@vastraa.com",
      role: "seller",
    });

    const resNoVendor = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${orphanSellerToken}`)
      .send({ name: "Orphan Saree", price: 5000, category: "silk" });

    expect(resNoVendor.status).toBe(403);
    expect(resNoVendor.body.code).toBe("VENDOR_NOT_FOUND");
    expect(resNoVendor.body.error).toBe("Vendor profile not found for this account.");

    // 6b: Pending seller account -> 403 VENDOR_PENDING
    const pendingSellerUser = { id: "usr_seller_pending", email: "pending@vastraa.com", role: "seller" as const };
    const pendingVendor = {
      id: "vend_pending_1",
      ownerId: pendingSellerUser.id,
      email: pendingSellerUser.email,
      status: "pending",
    };
    mockUsersMap.set(pendingSellerUser.id, pendingSellerUser);
    mockSellersMap.set(pendingVendor.id, pendingVendor);

    const pendingToken = signAccessToken({
      sub: pendingSellerUser.id,
      email: pendingSellerUser.email,
      role: "seller",
    });

    const resPending = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ name: "Pending Seller Saree", price: 5000, category: "silk" });

    expect(resPending.status).toBe(403);
    expect(resPending.body.code).toBe("VENDOR_PENDING");

    // 6c: Suspended seller account -> 403 VENDOR_SUSPENDED
    const suspendedSellerUser = { id: "usr_seller_suspended", email: "suspended@vastraa.com", role: "seller" as const };
    const suspendedVendor = {
      id: "vend_suspended_1",
      ownerId: suspendedSellerUser.id,
      email: suspendedSellerUser.email,
      status: "suspended",
    };
    mockUsersMap.set(suspendedSellerUser.id, suspendedSellerUser);
    mockSellersMap.set(suspendedVendor.id, suspendedVendor);

    const suspendedToken = signAccessToken({
      sub: suspendedSellerUser.id,
      email: suspendedSellerUser.email,
      role: "seller",
    });

    const resSuspended = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${suspendedToken}`)
      .send({ name: "Suspended Seller Saree", price: 5000, category: "silk" });

    expect(resSuspended.status).toBe(403);
    expect(resSuspended.body.code).toBe("VENDOR_SUSPENDED");

    // 6d: Deactivated seller account -> 403 VENDOR_DEACTIVATED
    const deactivatedSellerUser = { id: "usr_seller_deactivated", email: "deactivated@vastraa.com", role: "seller" as const };
    const deactivatedVendor = {
      id: "vend_deactivated_1",
      ownerId: deactivatedSellerUser.id,
      email: deactivatedSellerUser.email,
      status: "deactivated",
    };
    mockUsersMap.set(deactivatedSellerUser.id, deactivatedSellerUser);
    mockSellersMap.set(deactivatedVendor.id, deactivatedVendor);

    const deactivatedToken = signAccessToken({
      sub: deactivatedSellerUser.id,
      email: deactivatedSellerUser.email,
      role: "seller",
    });

    const resDeactivated = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${deactivatedToken}`)
      .send({ name: "Deactivated Seller Saree", price: 5000, category: "silk" });

    expect(resDeactivated.status).toBe(403);
    expect(resDeactivated.body.code).toBe("VENDOR_DEACTIVATED");

    // 6e: Missing auth token -> 401
    const resNoAuth = await request(app)
      .post("/api/products")
      .send({ name: "Unauthenticated Saree", price: 5000, category: "silk" });

    expect(resNoAuth.status).toBe(401);
  });

  it("7. Dynamic category specifications and matching blouse segregation", async () => {
    const sellerUser = { id: "usr_dyn_seller_1", email: "dynseller@vastraa.com", role: "seller" as const };
    const vendor = {
      id: "vend_dyn_1",
      vendorId: "VDYN1001",
      name: "Heritage Weaves Studio",
      ownerId: sellerUser.id,
      email: sellerUser.email,
      status: "approved",
      active: true,
    };
    mockUsersMap.set(sellerUser.id, sellerUser);
    mockSellersMap.set(vendor.id, vendor);

    const sellerToken = signAccessToken({
      sub: sellerUser.id,
      email: sellerUser.email,
      role: "seller",
    });

    // 7a: Saree product with blouse piece and dedicated blouse images
    const sareePayload = {
      name: "Royal Peacock Pure Silk Saree",
      category: "paithani",
      subcategory: "Traditional Paithani",
      price: 18500,
      fabric: "Pure Silk",
      color: "Royal Blue",
      blouseIncluded: true,
      blouseImages: ["r2/blouse_piece_front.jpg", "r2/blouse_piece_border.jpg"],
      blouseDetails: {
        fabric: "Pure Silk",
        color: "Royal Blue",
        length: "0.80 Metre (Standard Unstitched)",
        design: "Matching Running Blouse Piece",
      },
      specifications: [
        { key: "Weave", value: "Pit Loom Handwoven" },
        { key: "Zari", value: "Pure Gold Tested Zari" },
      ],
      images: ["r2/saree_main.jpg", "r2/saree_pallu.jpg"],
    };

    const sareeRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send(sareePayload);

    expect(sareeRes.status).toBe(201);
    expect(sareeRes.body.blouseIncluded).toBe(true);
    expect(sareeRes.body.blouseImages).toHaveLength(2);
    expect(sareeRes.body.blouseDetails.fabric).toBe("Pure Silk");

    // 7b: Kurti product with category-specific attributes (should force blouseIncluded = false)
    const kurtiPayload = {
      name: "Embroidered Festive Anarkali Kurti",
      category: "kurtis",
      subcategory: "Anarkali Kurtis",
      price: 3499,
      fabric: "Georgette",
      color: "Teal",
      kurtiType: "Anarkali Kurti",
      sleeveLength: "3/4th Sleeve",
      neckStyle: "Mandarin Collar",
      fit: "Flared",
      pattern: "Floral Embroidered",
      closureType: "Front Buttons",
      blouseIncluded: true, // Should be rejected/sanitized to false for non-sarees
      blouseImages: ["r2/accidental_blouse.jpg"],
      images: ["r2/kurti_front.jpg"],
    };

    const kurtiRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send(kurtiPayload);

    expect(kurtiRes.status).toBe(201);
    // Verified: Non-sarees are strictly sanitized to blouseIncluded: false
    expect(kurtiRes.body.blouseIncluded).toBe(false);
    expect(kurtiRes.body.blouseImages).toEqual([]);
    expect(kurtiRes.body.kurtiType).toBe("Anarkali Kurti");
    expect(kurtiRes.body.sleeveLength).toBe("3/4th Sleeve");
    expect(kurtiRes.body.neckStyle).toBe("Mandarin Collar");
  });
});
