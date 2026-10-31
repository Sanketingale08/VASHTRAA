import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import { connectToMongoDB, getMongoDb, mongoSellers, mongoProducts } from "@workspace/db";
import { signAccessToken } from "../lib/jwt";

describe("Live Bulk Import Debug", () => {
  it("checks products, indexes, and tests bulk-import", async () => {
    await connectToMongoDB();
    const db = getMongoDb();

    const indexes = await db.collection("products").indexes();
    console.log("=== PRODUCT INDEXES ===", JSON.stringify(indexes, null, 2));

    const existingProducts = await db.collection("products").find({}).limit(5).toArray();
    console.log("=== SAMPLE EXISTING PRODUCTS ===", existingProducts.map((p: any) => ({
      id: p.id,
      _id: p._id,
      name: p.name,
      sku: p.sku,
      vendorId: p.vendorId,
      category: p.category,
      price: p.price,
      images: p.images,
      status: p.status,
    })));

    const seller = (await mongoSellers.findMany({}))[0];
    const sellerId = seller.ownerId || seller.id || seller.vendorId;
    const token = signAccessToken({ sub: sellerId, role: "seller", email: seller.email, sid: "sess_1" });

    // Test a row with SKU, category, and images
    const rows = [
      {
        name: "Test Saree Live " + Date.now(),
        price: "15000",
        category: "paithani",
        sku: "TEST-SKU-" + Date.now(),
        description: "Test saree description",
        fabric: "silk",
        color: "red",
        occasion: "festival",
        stock: "10",
        originalPrice: "18000",
        subcategory: "Bridal",
        brand: "Kange Collection",
        designPattern: "Zari",
        images: "https://images.unsplash.com/photo-1610030469983-98e550d6193c",
      }
    ];

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "test-debug-" + Date.now())
      .send({ rows });

    console.log("=== BULK IMPORT STATUS ===", res.status);
    console.log("=== BULK IMPORT RESPONSE ===", JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
  });
});
