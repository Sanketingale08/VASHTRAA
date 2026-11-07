import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signAccessToken } from "../lib/jwt";

// In-memory data store for the test suite
const state = vi.hoisted(() => ({
  products: new Map<string, any>(),
  sellers: new Map<string, any>(),
  users: new Map<string, any>(),
  notifications: [] as any[],
}));

const approvedSellerUser = {
  id: "usr_seller_workflow_1",
  email: "artisan.seller@example.com",
  role: "seller",
  name: "Artisan Silk Weavers",
};

const approvedVendorProfile = {
  id: "vend_workflow_1",
  ownerId: "usr_seller_workflow_1",
  vendorId: "TDV_WORKFLOW_1",
  sellerId: "TDV_WORKFLOW_1",
  name: "Artisan Silk Weavers",
  shopName: "Artisan Silk Weavers",
  status: "approved",
  isActive: true,
  isApproved: true,
};

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");
  const productsTable = { __table: "products", id: "id" };
  const vendorsTable = { __table: "vendors", id: "id" };

  return {
    ...actual,
    db: {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => Array.from(state.products.values())),
        })),
      })),
      execute: vi.fn(async () => ({ rows: [{ seq: 9001 }] })),
    },
    productsTable,
    vendorsTable,
    mongoProducts: {
      insert: vi.fn(async (data: any) => {
        state.products.set(data.id, { ...data });
        return { ...data };
      }),
      findById: vi.fn(async (id: string) => {
        return state.products.get(id) || null;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = state.products.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates, updatedAt: new Date() };
        state.products.set(id, updated);
        return updated;
      }),
      findMany: vi.fn(async (filter: any = {}) => {
        let prods = Array.from(state.products.values());
        if (filter.status) {
          prods = prods.filter((p) => p.status === filter.status);
        }
        if (filter.active === true) {
          prods = prods.filter((p) => p.active === true);
        } else if (filter.active && filter.active.$ne !== undefined) {
          prods = prods.filter((p) => p.active !== filter.active.$ne);
        }
        if (filter.category) {
          prods = prods.filter((p) => p.category === filter.category);
        }
        return prods;
      }),
      count: vi.fn(async (filter: any = {}) => {
        let prods = Array.from(state.products.values());
        if (filter.status) {
          prods = prods.filter((p) => p.status === filter.status);
        }
        return prods.length;
      }),
      getAdminStats: vi.fn(async () => {
        const prods = Array.from(state.products.values());
        return {
          total: prods.length,
          pending: prods.filter((p) => p.status === "pending").length,
          approved: prods.filter((p) => p.status === "approved").length,
          rejected: prods.filter((p) => p.status === "rejected").length,
          draft: prods.filter((p) => p.status === "draft").length,
        };
      }),
    },
    mongoSellers: {
      findById: vi.fn(async (id: string) => state.sellers.get(id) || null),
      findByVendorId: vi.fn(async (vId: string) => {
        return Array.from(state.sellers.values()).find((s: any) => s.vendorId === vId) || null;
      }),
      findBySellerId: vi.fn(async (sId: string) => {
        return Array.from(state.sellers.values()).find((s: any) => s.sellerId === sId) || null;
      }),
      findByOwnerId: vi.fn(async (oId: string) => {
        return Array.from(state.sellers.values()).find((s: any) => s.ownerId === oId) || null;
      }),
      findMany: vi.fn(async () => Array.from(state.sellers.values())),
    },
    mongoUsers: {
      findById: vi.fn(async (id: string) => state.users.get(id) || null),
    },
    mongoSiteSettings: {
      get: vi.fn(async (key: string) => {
        if (key === "admin_2fa_enabled") return "false";
        if (key === "admin_key_hash") return "hash:dev-admin-key";
        return null;
      }),
    },
    mongoProductCategories: {
      listActive: vi.fn(async () => []),
      findAll: vi.fn(async () => []),
    },
    getNextSequenceValue: vi.fn(async () => 9001),
  };
});

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn(async (notif: any) => notif),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn(async (notif: any) => notif),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: () => "127.0.0.1",
}));

vi.mock("../lib/socket", () => ({
  emitProductEvent: vi.fn(),
}));

import express from "express";
import productsRouter from "../routes/products";
import adminProductsRouter from "../routes/adminProducts";
import { searchProducts } from "../lib/searchEngine";

describe("Seller Product Submission, Admin Approval & Storefront Synchronization", () => {
  let app: express.Express;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = "dev-admin-key";
    state.products.clear();
    state.sellers.clear();
    state.users.clear();
    state.notifications = [];

    state.users.set(approvedSellerUser.id, approvedSellerUser);
    state.sellers.set(approvedVendorProfile.id, approvedVendorProfile);

    app = express();
    app.use(express.json());
    app.use("/api", productsRouter);
    app.use("/api", adminProductsRouter);
  });

  it("1. Reaching Review step or Saving Draft does NOT submit to Admin Pending Approval", async () => {
    const token = signAccessToken({
      sub: approvedSellerUser.id,
      email: approvedSellerUser.email,
      role: "seller",
    });

    // Seller saves draft
    const draftRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Unfinished Paithani Draft",
        category: "sarees",
        subcategory: "Paithani",
        price: 12500,
        fabric: "Pure Silk",
        status: "draft",
        stock: 5,
        images: ["https://example.com/draft.jpg"],
      });

    expect(draftRes.status).toBe(201);
    expect(draftRes.body.status).toBe("draft");
    expect(draftRes.body.active).toBe(false);

    // Draft product MUST NOT appear in Admin -> Pending Approval
    const adminPendingRes = await request(app)
      .get("/api/admin/products?status=pending")
      .set("x-admin-key", "dev-admin-key");

    expect(adminPendingRes.status).toBe(200);
    expect(adminPendingRes.body.products).toHaveLength(0);

    // Draft product MUST NOT be visible on customer storefront
    const userSearchResult = await searchProducts({ category: "sarees" });
    expect(userSearchResult.products.find((p) => p.name === "Unfinished Paithani Draft")).toBeUndefined();
  });

  it("2. Explicitly clicking 'Submit for Approval' creates a pending product with complete category taxonomy", async () => {
    const token = signAccessToken({
      sub: approvedSellerUser.id,
      email: approvedSellerUser.email,
      role: "seller",
    });

    // Complete submission payload
    const submissionPayload = {
      name: "Royal Peshwai Silk Paithani Saree",
      description: "Authentic handloom Yeola Paithani saree with peacock motifs in pure gold zari.",
      category: "sarees",
      categorySlug: "sarees",
      categoryId: "cat-sarees-default",
      categoryName: "Sarees",
      mainCategoryId: "cat-sarees-default",
      subcategory: "Paithani",
      subcategorySlug: "paithani",
      subcategoryId: "sub-saree-paithani",
      subcategoryName: "Paithani",
      subtype: "Bridal Paithani",
      subtypeId: "bridal-paithani",
      price: 18500,
      basePrice: 18500,
      originalPrice: 22000,
      fabric: "Pure Mulberry Silk",
      color: "Ruby Red",
      occasion: "Bridal / Wedding",
      stock: 12,
      images: [
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c",
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b",
      ],
      specifications: [
        { key: "Weave Technique", value: "Yeola Handloom Weave" },
        { key: "Zari Type", value: "Pure Gold Zari Border" },
      ],
      status: "pending",
    };

    const submitRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send(submissionPayload);

    expect(submitRes.status).toBe(201);
    const created = submitRes.body;
    expect(created.status).toBe("pending");
    expect(created.active).toBe(false);
    expect(created.vendorId).toBe("TDV_WORKFLOW_1");
    expect(created.vendorName).toBe("Artisan Silk Weavers");
    expect(created.category).toBe("sarees");
    expect(created.categorySlug).toBe("sarees");
    expect(created.subcategory).toBe("Paithani");
    expect(created.subcategorySlug).toBe("paithani");
    expect(created.subcategoryId).toBe("sub-saree-paithani");

    // Product appears in Admin -> Pending Approval
    const adminPendingRes = await request(app)
      .get("/api/admin/products?status=pending")
      .set("x-admin-key", "dev-admin-key");

    expect(adminPendingRes.status).toBe(200);
    expect(adminPendingRes.body.products).toHaveLength(1);
    expect(adminPendingRes.body.products[0].id).toBe(created.id);
    expect(adminPendingRes.body.products[0].status).toBe("pending");

    // Before approval, product is NOT visible to customers
    const storefrontBeforeApproval = await searchProducts({ category: "sarees" });
    expect(storefrontBeforeApproval.products.find((p) => p.id === created.id)).toBeUndefined();

    // 3. Admin approves product
    const approveRes = await request(app)
      .post(`/api/admin/products/${created.id}/approve`)
      .set("x-admin-key", "dev-admin-key")
      .send({ remark: "Verified authentic Yeola Paithani" });

    expect(approveRes.status).toBe(200);
    const approved = approveRes.body.product;
    expect(approved.status).toBe("approved");
    expect(approved.active).toBe(true);
    expect(approved.category).toBe("sarees");
    expect(approved.categorySlug).toBe("sarees");
    expect(approved.subcategory).toBe("Paithani");
    expect(approved.subcategorySlug).toBe("paithani");

    // 4. Product immediately appears on Customer Storefront
    const storefrontAfterApproval = await searchProducts({ category: "sarees" });
    const liveProduct = storefrontAfterApproval.products.find((p) => p.id === created.id);
    expect(liveProduct).toBeDefined();
    expect(liveProduct?.name).toBe("Royal Peshwai Silk Paithani Saree");
    expect(liveProduct?.active).toBe(true);
    expect(liveProduct?.status).toBe("approved");

    // Also appears under subcategory query
    const subcategorySearchResult = await searchProducts({
      category: "sarees",
      subcategory: "paithani",
    });
    const subcatProduct = subcategorySearchResult.products.find((p) => p.id === created.id);
    expect(subcatProduct).toBeDefined();
  });

  it("3. Works across modern categories (e.g. Kurtis) with dynamic subcategory mapping and storefront visibility", async () => {
    const token = signAccessToken({
      sub: approvedSellerUser.id,
      email: approvedSellerUser.email,
      role: "seller",
    });

    const kurtiPayload = {
      name: "Embroidered Anarkali Cotton Kurti",
      description: "Floor length flared anarkali kurti with intricate thread work.",
      category: "kurtis",
      subcategory: "Anarkali Kurti",
      price: 2499,
      basePrice: 2499,
      fabric: "Pure Cotton",
      color: "Teal Green",
      status: "pending",
      images: ["https://example.com/kurti.jpg"],
    };

    const submitRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send(kurtiPayload);

    expect(submitRes.status).toBe(201);
    const created = submitRes.body;
    expect(created.status).toBe("pending");
    expect(created.active).toBe(false);
    expect(created.category).toBe("kurtis");
    expect(created.categorySlug).toBe("kurtis");
    expect(created.subcategory).toBe("Anarkali Kurti");
    expect(created.subcategorySlug).toBe("anarkali-kurti");

    // Admin approves
    const approveRes = await request(app)
      .post(`/api/admin/products/${created.id}/approve`)
      .set("x-admin-key", "dev-admin-key")
      .send({ remark: "Approved for Kurtis catalog" });

    expect(approveRes.status).toBe(200);

    // Visible in User Store under Kurtis category
    const kurtiSearchResult = await searchProducts({ category: "kurtis" });
    const liveKurti = kurtiSearchResult.products.find((p) => p.id === created.id);
    expect(liveKurti).toBeDefined();
    expect(liveKurti?.category).toBe("kurtis");
  });

  it("4. Admin Rejection correctly updates status to rejected and keeps product hidden from storefront", async () => {
    const token = signAccessToken({
      sub: approvedSellerUser.id,
      email: approvedSellerUser.email,
      role: "seller",
    });

    const payload = {
      name: "Low Quality Sample Item",
      category: "sarees",
      subcategory: "Paithani",
      price: 999,
      fabric: "Synthetic",
      status: "pending",
      images: ["https://example.com/sample.jpg"],
    };

    const submitRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    const createdId = submitRes.body.id;

    // Admin rejects
    const rejectRes = await request(app)
      .post(`/api/admin/products/${createdId}/reject`)
      .set("x-admin-key", "dev-admin-key")
      .send({ reason: "Fabric does not meet authentic handloom standard." });

    expect(rejectRes.status).toBe(200);

    // Verify stored state
    const saved = state.products.get(createdId);
    expect(saved.status).toBe("rejected");
    expect(saved.active).toBe(false);
    expect(saved.rejectionReason).toBe("Fabric does not meet authentic handloom standard.");

    // Storefront query MUST NOT return the rejected item
    const storefrontRes = await searchProducts({ category: "sarees" });
    expect(storefrontRes.products.find((p) => p.id === createdId)).toBeUndefined();
  });
});

