import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("../../../vastraa/node_modules/xlsx");
import { connectToMongoDB, getMongoDb } from "@workspace/db";
import { signAccessToken } from "../lib/jwt";
import express from "express";
import request from "supertest";
import sellerRouter from "../routes/seller";

// Clean numeric string helper matching SellerBulkUpload.tsx
function cleanNumericString(val: string | undefined): string {
  if (!val) return "";
  const cleaned = String(val).replace(/[₹$,\s]|Rs\.?|INR/gi, "").trim();
  const num = Number(cleaned);
  if (!isNaN(num) && num > 0) {
    return String(Math.round(num));
  }
  return cleaned;
}

// Auto map helper matching SellerBulkUpload.tsx
function autoMap(header: string): string {
  const n = header.toLowerCase().trim();
  if (n.includes("product name") || n === "name" || n === "title") return "name";
  if (n.includes("original price") || n.includes("original_price")) return "originalPrice";
  if (n.includes("price") || n.includes("mrp")) return "price";
  if (n.includes("subcategory") || n.includes("sub-category")) return "subcategory";
  if (n.includes("category")) return "category";
  if (n.includes("sku")) return "sku";
  if (n.includes("description") || n === "desc") return "description";
  if (n.includes("fabric") || n === "material") return "fabric";
  if (n.includes("color") || n === "colour") return "color";
  if (n.includes("occasion")) return "occasion";
  if (n.includes("stock") || n.includes("qty")) return "stock";
  if (n.includes("brand")) return "brand";
  if (n.includes("design pattern") || n.includes("pattern")) return "designPattern";
  if (n.includes("image")) return "images";
  return "";
}

function parseWorkbookHelper(wb: XLSX.WorkBook) {
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");

  let headerRowIndex = 0;
  let headers: string[] = [];

  for (let r = 0; r <= Math.min(10, range.e.r); r++) {
    const rowCells: string[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      rowCells.push(cell ? String(cell.v ?? "").trim() : "");
    }
    const hasName = rowCells.some(h => autoMap(h) === "name");
    const hasPrice = rowCells.some(h => autoMap(h) === "price");
    const hasCat = rowCells.some(h => autoMap(h) === "category");
    if (hasName && hasPrice && hasCat) {
      headerRowIndex = r;
      headers = rowCells;
      break;
    }
  }

  const rows: Array<Record<string, string>> = [];
  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const rowData: Record<string, string> = {};
    let hasAnyValue = false;
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const val = cell ? String(cell.v ?? "").trim() : "";
      if (val) hasAnyValue = true;
      const key = autoMap(header);
      if (key) {
        if (key === "price" || key === "stock" || key === "originalPrice") {
          rowData[key] = cleanNumericString(val);
        } else {
          rowData[key] = val;
        }
      }
    }
    if (hasAnyValue) rows.push(rowData);
  }
  return { rows, headerRowIndex };
}

describe("Live Bulk Import Complete E2E Flow", () => {
  it("executes the full Excel flow: parse -> validate -> import -> MongoDB -> dashboard -> storefront -> idempotent retry", async () => {
    // 1. Connect to MongoDB Atlas
    const { db } = await connectToMongoDB();
    expect(db).toBeDefined();

    const sellerId = "seller_sanket_ingale_001";
    const vendorId = "VEND_SELLER_S";
    let seller = await db.collection("sellers").findOne({ $or: [{ id: sellerId }, { vendorId }] });
    if (!seller) {
      seller = {
        id: sellerId,
        vendorId: vendorId,
        ownerId: sellerId,
        email: "ingalesanket2003@gmail.com",
        name: "Kange Collection",
        shopName: "Kange Collection",
        status: "approved",
        createdAt: new Date(),
      };
      await db.collection("sellers").insertOne(seller);
    }
    expect(seller).toBeDefined();

    const token = signAccessToken({
      sub: sellerId,
      email: seller.email,
      role: "seller",
    });

    const app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use("/api", sellerRouter);

    // 2. Generate Real Excel File with 8 rows (4 valid, 4 invalid / duplicates)
    const ts = Date.now();
    const testSku1 = `E2E-LIVE-PAITHANI-${ts}`;
    const testSku2 = `E2E-LIVE-DESIGNER-${ts}`;
    const testSku3 = `E2E-LIVE-DRESS-${ts}`;
    const testSku4 = `E2E-LIVE-LEHENGA-${ts}`;

    const headers = [
      "Product Name *",
      "Price (₹) *",
      "Category *",
      "SKU",
      "Description",
      "Fabric",
      "Color",
      "Occasion",
      "Stock",
      "Original Price (₹)",
      "Subcategory",
      "Brand",
      "Design Pattern",
      "Images (URL)",
    ];

    const excelRows = [
      ["", "", "", "", "VASTRAA PRODUCT CATALOG TEMPLATE"],
      ["", "", "", "", "Instructions: Fill product data starting row 7."],
      [],
      [],
      [],
      ["Decorative Header Row Before Real Headers"],
      headers, // Row 7 in Excel
      // Row 8: Valid Paithani Saree with image
      [
        `Yeola Pure Silk Paithani ${ts}`,
        "14999",
        "Paithani Saree",
        testSku1,
        "Authentic handloom pure silk saree with peacock zari border",
        "Pure Silk",
        "Maroon",
        "Wedding",
        "15",
        "18999",
        "Bridal Paithani",
        "Kange Collection",
        "Peacock Motifs",
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c",
      ],
      // Row 9: Valid Designer Saree with decimal price
      [
        `Zari Embellished Designer Saree ${ts}`,
        "4499.50",
        "Designer Saree",
        testSku2,
        "Contemporary designer saree with hand embroidery",
        "Georgette",
        "Navy Blue",
        "Party",
        "8",
        "6999",
        "Party Wear",
        "Kange Collection",
        "Zari Work",
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b",
      ],
      // Row 10: Valid Dress with multiple comma-separated images
      [
        `Anarkali Floor Length Dress ${ts}`,
        "3200",
        "Dress",
        testSku3,
        "Stunning ethnic dress with dupatta",
        "Cotton Blend",
        "Teal",
        "Festive",
        "20",
        "4500",
        "Anarkali",
        "Kange Collection",
        "Floral",
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c, https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b",
      ],
      // Row 11: Valid Lehenga with ethnic attributes
      [
        `Bridal Velvet Lehenga Choli ${ts}`,
        "24500",
        "Lehenga",
        testSku4,
        "Heavy velvet bridal lehenga set",
        "Velvet",
        "Wine",
        "Bridal",
        "5",
        "32000",
        "Bridal Set",
        "Kange Collection",
        "Dori Work",
        "/api/storage/public-objects/public/products/seller_e2e/draft/lehenga.webp",
      ],
      // Row 12: Missing Product Name (Invalid)
      [
        "",
        "2999",
        "Paithani",
        `BAD-SKU-1-${ts}`,
        "Missing product name test",
        "Silk",
        "Red",
        "Festival",
        "10",
        "",
        "",
        "",
        "",
        "",
      ],
      // Row 13: Invalid Price (Invalid)
      [
        `Negative Price Saree ${ts}`,
        "-1500",
        "Paithani",
        `BAD-SKU-2-${ts}`,
        "Invalid price test",
        "Silk",
        "Red",
        "Festival",
        "10",
        "",
        "",
        "",
        "",
        "",
      ],
      // Row 14: Invalid Category (Invalid)
      [
        `Unknown Category Item ${ts}`,
        "1999",
        "CompletelyFakeCategory123",
        `BAD-SKU-3-${ts}`,
        "Invalid category test",
        "Silk",
        "Red",
        "Festival",
        "10",
        "",
        "",
        "",
        "",
        "",
      ],
      // Row 15: Duplicate SKU (Same as row 8)
      [
        `Duplicate SKU Product ${ts}`,
        "9999",
        "Paithani",
        testSku1, // Duplicate SKU!
        "Duplicate SKU test",
        "Silk",
        "Red",
        "Festival",
        "10",
        "",
        "",
        "",
        "",
        "",
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product Catalog");
    const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // 3. Test Excel parsing
    const parsedWb = XLSX.read(excelBuffer, { type: "buffer" });
    const { rows: parsedRows, headerRowIndex } = parseWorkbookHelper(parsedWb);
    expect(headerRowIndex).toBe(6);
    expect(parsedRows).toHaveLength(8);

    // 4. Test Backend Import API
    const idempotencyKey = `e2e-live-key-${ts}`;
    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ rows: parsedRows });

    expect(res.status).toBe(200);
    const { results, summary } = res.body;

    // Verify Summary
    expect(summary.total).toBe(8);
    expect(summary.succeeded).toBe(4);
    expect(summary.failed).toBe(4);
    expect(summary.skippedDuplicates).toBeGreaterThanOrEqual(1);

    // Verify row error messages
    const row5 = results.find((r: any) => r.row === 5);
    expect(row5.success).toBe(false);
    expect(row5.error).toBe("Missing name");

    const row6 = results.find((r: any) => r.row === 6);
    expect(row6.success).toBe(false);
    expect(row6.error).toBe("Invalid price");

    const row7 = results.find((r: any) => r.row === 7);
    expect(row7.success).toBe(false);
    expect(row7.error).toContain("Invalid category");

    const row8 = results.find((r: any) => r.row === 8);
    expect(row8.success).toBe(false);
    expect(row8.error).toContain("already exists");

    // 5. Direct MongoDB Atlas Verification
    const mongoDb = getMongoDb();
    const savedProducts = await mongoDb.collection("products").find({
      vendorId: { $in: [vendorId, sellerId] },
      sku: { $in: [testSku1, testSku2, testSku3, testSku4] },
    }).toArray();

    expect(savedProducts).toHaveLength(4);

    for (const prod of savedProducts) {
      expect(prod.status).toBe("approved");
      expect(prod.active).toBe(true);
      expect(prod.vendorId).toBeDefined();
      expect(prod.sellerId).toBeDefined();
      expect(typeof prod.price).toBe("number");
      expect(prod.price).toBeGreaterThan(0);
    }

    // Verify category prefixes
    const paithaniProd = savedProducts.find(p => p.sku === testSku1);
    expect(paithaniProd?.id).toMatch(/^PS\d+/);
    expect(paithaniProd?.category).toBe("paithani");

    const designerProd = savedProducts.find(p => p.sku === testSku2);
    expect(designerProd?.id).toMatch(/^DS\d+/);
    expect(designerProd?.category).toBe("designer");
    expect(designerProd?.price).toBe(4500); // 4499.50 rounded to whole rupees

    const dressProd = savedProducts.find(p => p.sku === testSku3);
    expect(dressProd?.id).toMatch(/^DR\d+/);
    expect(dressProd?.category).toBe("dresses");
    expect(dressProd?.images).toHaveLength(2); // Both images parsed from comma-separated list

    const lehengaProd = savedProducts.find(p => p.sku === testSku4);
    expect(lehengaProd?.id).toMatch(/^LH\d+/);
    expect(lehengaProd?.category).toBe("lehenga");

    // 6. Verify Seller Dashboard query
    const sellerProducts = await mongoDb.collection("products").find({
      $or: [
        { vendorId: vendorId },
        { vendorId: sellerId },
        { sellerId: sellerId },
      ],
    }).toArray();
    const sellerHasAllNew = savedProducts.every(p => sellerProducts.some(sp => sp.id === p.id));
    expect(sellerHasAllNew).toBe(true);

    // 7. Verify Admin Panel query
    const adminApprovedCount = await mongoDb.collection("products").countDocuments({ status: "approved" });
    expect(adminApprovedCount).toBeGreaterThanOrEqual(4);

    // 8. Verify Customer Storefront query
    const storefrontProducts = await mongoDb.collection("products").find({
      active: true,
      status: "approved",
    }).toArray();
    const storefrontHasAllNew = savedProducts.every(p => storefrontProducts.some(sp => sp.id === p.id));
    expect(storefrontHasAllNew).toBe(true);

    // 9. Verify Idempotent Retry
    const retryRes = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ rows: parsedRows });

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.summary.succeeded).toBe(4);

    const postRetryProducts = await mongoDb.collection("products").find({
      vendorId: { $in: [vendorId, sellerId] },
      sku: { $in: [testSku1, testSku2, testSku3, testSku4] },
    }).toArray();
    expect(postRetryProducts).toHaveLength(4); // No duplicates created!
  }, 30000);
});
