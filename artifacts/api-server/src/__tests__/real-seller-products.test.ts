import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { connectToMongoDB, getMongoDb, mongoSellers, mongoProducts } from "@workspace/db";
import { signAccessToken } from "../lib/jwt";
import { getApprovedVendorData, isProductVendorValid } from "../lib/vendorValidation";
import { searchProducts } from "../lib/searchEngine";
import { bootstrapDatabase } from "../lib/bootstrapDatabase";

describe("VASTRAA — Real Seller Products & Dummy Data Removal Verification", () => {
  let db: any;
  let genuineSeller: any;
  let sellerToken: string;
  let createdProductId: string | null = null;

  beforeAll(async () => {
    await connectToMongoDB();
    db = getMongoDb();

    // Verify existing database state
    const sellers = await db.collection("sellers").find({}).toArray();
    expect(sellers.length).toBeGreaterThanOrEqual(1);

    genuineSeller = sellers.find((s: any) => s.id === "seller_sanket_ingale_001" || s.sellerId === "seller_sanket_ingale_001") || sellers[0];
    expect(genuineSeller).toBeDefined();

    const sellerId = genuineSeller.id || genuineSeller.sellerId || genuineSeller.vendorId;
    sellerToken = signAccessToken({
      sub: sellerId,
      role: "seller",
      email: genuineSeller.email,
      sid: "sess_verify_1",
    });
  });

  afterAll(async () => {
    // Ensure cleanup of any product created during this test
    if (createdProductId) {
      await db.collection("products").deleteOne({ id: createdProductId });
      await db.collection("products").deleteOne({ name: /Verified Paithani Handloom Saree/i });
    }
  });

  it("Scenario 1: Customer API returns empty array when no approved products exist", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("products");
    expect(Array.isArray(res.body.products)).toBe(true);

    const suggestionsRes = await request(app).get("/api/products/search-suggestions?q=paithani");
    expect(suggestionsRes.status).toBe(200);
    expect(suggestionsRes.body.products).toEqual([]);
  });

  it("Scenario 2: Seller creates product -> stored as pending & inactive; cannot self-approve; hidden from customer API", async () => {
    const newProductPayload = {
      name: "Verified Paithani Handloom Saree " + Date.now(),
      description: "Authentic pure silk handwoven saree crafted by registered artisan.",
      category: "paithani",
      price: 18500,
      basePrice: 16000,
      shippingFee: 100,
      stock: 5,
      fabric: "silk",
      color: "gold",
      occasion: "festival",
      status: "approved", // Attempt to self-approve — MUST be ignored/overridden to pending!
      images: ["https://images.unsplash.com/photo-1610030469983-98e550d6193c"],
    };

    const createRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send(newProductPayload);

    expect(createRes.status).toBe(201);
    createdProductId = createRes.body.id;
    expect(createdProductId).toBeDefined();

    // Status MUST be pending and active MUST be false
    expect(createRes.body.status).toBe("pending");
    expect(createRes.body.active).toBe(false);

    // Verify in MongoDB directly
    const storedInDb = await db.collection("products").findOne({ id: createdProductId });
    expect(storedInDb).toBeDefined();
    expect(storedInDb.status).toBe("pending");
    expect(storedInDb.active).toBe(false);
    expect([genuineSeller.vendorId, genuineSeller.id, genuineSeller.sellerId]).toContain(storedInDb.vendorId);

    // Public catalog API /api/products MUST hide this pending product
    const catalogRes = await request(app).get("/api/products");
    expect(catalogRes.status).toBe(200);
    const foundInCatalog = catalogRes.body.products.find((p: any) => p.id === createdProductId);
    expect(foundInCatalog).toBeUndefined();

    // Public GET /api/products/:id MUST return 404 for unapproved product
    const publicGetRes = await request(app).get(`/api/products/${createdProductId}`);
    expect(publicGetRes.status).toBe(404);
  });

  it("Scenario 3: Admin approves the product -> becomes approved & active; appears on customer storefront", async () => {
    expect(createdProductId).toBeDefined();

    const approveRes = await request(app)
      .post(`/api/admin/products/${createdProductId}/approve`)
      .set("x-admin-key", "Admin@123")
      .send({ remark: "Handloom quality verified" });

    expect(approveRes.status).toBe(200);

    // Verify in MongoDB
    const storedInDb = await db.collection("products").findOne({ id: createdProductId });
    expect(storedInDb.status).toBe("approved");
    expect(storedInDb.active).toBe(true);

    // Public catalog API MUST now include the product
    const catalogRes = await request(app).get("/api/products");
    expect(catalogRes.status).toBe(200);
    const foundInCatalog = catalogRes.body.products.find((p: any) => p.id === createdProductId);
    expect(foundInCatalog).toBeDefined();
    expect(foundInCatalog.id).toBe(createdProductId);

    // Public GET /api/products/:id MUST now return 200
    const publicGetRes = await request(app).get(`/api/products/${createdProductId}`);
    expect(publicGetRes.status).toBe(200);
    expect(publicGetRes.body.id).toBe(createdProductId);
  });

  it("Scenario 4: Test product with demo/test flags never appears in public catalog", async () => {
    const approvedData = await getApprovedVendorData(true);

    const testProductA = {
      id: "test-prod-101",
      name: "[Test] Dummy Paithani",
      category: "paithani",
      status: "approved",
      active: true,
      vendorId: genuineSeller.id,
      isDemo: true,
    };
    expect(isProductVendorValid(testProductA, approvedData)).toBe(false);

    const testProductB = {
      id: "demo-paithani-102",
      name: "Demo Product Saree",
      category: "paithani",
      status: "approved",
      active: true,
      vendorId: genuineSeller.id,
    };
    expect(isProductVendorValid(testProductB, approvedData)).toBe(false);
  });

  it("Scenario 5: Test seller products never appear in public catalog", async () => {
    const approvedData = await getApprovedVendorData(true);

    const testSellerProduct = {
      id: "PS99999",
      name: "Authentic Paithani Saree",
      category: "paithani",
      status: "approved",
      active: true,
      vendorId: "test-seller-account-xyz",
    };
    expect(isProductVendorValid(testSellerProduct, approvedData)).toBe(false);
  });

  it("Scenario 6: Real seller ownership & shop isolation", async () => {
    const sellerId = genuineSeller.id || genuineSeller.sellerId;

    // Search specifically for genuine seller's shop
    const sellerShopRes = await request(app).get(`/api/products?vendorId=${sellerId}`);
    expect(sellerShopRes.status).toBe(200);
    expect(sellerShopRes.body.products.some((p: any) => p.id === createdProductId)).toBe(true);

    // Search for a non-existent or different vendor shop
    const otherShopRes = await request(app).get(`/api/products?vendorId=different_vendor_id_999`);
    expect(otherShopRes.status).toBe(200);
    expect(otherShopRes.body.products).toHaveLength(0);
  });

  it("Scenario 7: Server bootstrap / restart safety (no dummy products or auto-approvals)", async () => {
    await bootstrapDatabase();

    // Verify no dummy products were inserted
    const dummyProducts = await db.collection("products").find({
      $or: [
        { isDemo: true },
        { isTest: true },
        { id: /^test-/i },
        { name: /\[test\]/i },
        { name: /\[demo\]/i },
      ],
    }).toArray();
    expect(dummyProducts).toHaveLength(0);
  });

  it("Scenario 8: Missing seller information is rejected and never displayed", async () => {
    const approvedData = await getApprovedVendorData(true);

    const orphanProduct = {
      id: "PS88888",
      name: "Orphan Saree Without Seller",
      category: "paithani",
      status: "approved",
      active: true,
    };
    expect(isProductVendorValid(orphanProduct, approvedData)).toBe(false);
  });

  it("Cleanup: Delete temporary product so production DB contains only clean genuine data", async () => {
    if (createdProductId) {
      const delRes = await db.collection("products").deleteOne({ id: createdProductId });
      expect(delRes.deletedCount).toBe(1);
    }
    const finalCount = await db.collection("products").countDocuments({});
    expect(finalCount).toBe(0);
  });
});
