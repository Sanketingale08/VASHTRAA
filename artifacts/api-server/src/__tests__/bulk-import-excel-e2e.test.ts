import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const VENDOR_ID = "vendor-excel-e2e-123";
const OWNER_ID = "user-excel-e2e-owner";
const VENDOR_NAME = "Royal Heritage Textiles";

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

const state = vi.hoisted(() => ({
  savedProducts: [] as any[],
  seqCounter: 500,
  batches: new Map<string, any>(),
}));

vi.mock("@workspace/db", () => {
  function queryResult(getRows: () => unknown[]): any {
    const obj: any = {
      from: vi.fn(() => obj),
      where: vi.fn(() => obj),
      orderBy: vi.fn(() => obj),
      limit: vi.fn(() => obj),
      select: vi.fn(() => obj),
      then: (resolve: any, reject: any) => Promise.resolve(getRows()).then(resolve, reject),
    };
    return obj;
  }

  const insertObj: any = {
    values: vi.fn(() => insertObj),
    returning: vi.fn(() => Promise.resolve([])),
    onConflictDoNothing: vi.fn(() => insertObj),
  };

  const updateObj: any = {
    set: vi.fn(() => updateObj),
    where: vi.fn(() => updateObj),
    returning: vi.fn(() => Promise.resolve([{ id: "batch-e2e" }])),
  };

  const dbMock: any = {
    select: vi.fn(() => queryResult(() => [])),
    insert: vi.fn(() => insertObj),
    update: vi.fn(() => updateObj),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
    transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") return await cb(dbMock);
      return [];
    }),
  };

  const mongoVendorsMock = {
    findByOwnerId: vi.fn(async (id: string) => {
      if (id === OWNER_ID) {
        return { id: VENDOR_ID, ownerId: OWNER_ID, name: VENDOR_NAME, status: "approved" };
      }
      return null;
    }),
    findById: vi.fn(async () => null),
    findBySellerId: vi.fn(async () => null),
    findByVendorId: vi.fn(async () => null),
    findByEmail: vi.fn(async () => null),
  };

  const mongoProductsMock = {
    findMany: vi.fn(async () => {
      return state.savedProducts.map((p) => ({ ...p, vendorId: VENDOR_ID }));
    }),
    insert: vi.fn(async (doc: any) => {
      state.savedProducts.push(doc);
      return doc;
    }),
  };

  return {
    db: dbMock,
    mongoVendors: mongoVendorsMock,
    mongoSellers: { findByOwnerId: vi.fn(async () => null) },
    mongoProducts: mongoProductsMock,
    mongoOrders: {},
    mongoShipments: {},
    isMongoDbConnected: () => true,
    getNextSequenceValue: vi.fn(async () => state.seqCounter++),
    getCollection: vi.fn((colName: string) => ({
      findOne: vi.fn(async (query: any) => {
        const key = `${query.vendorId}:${query.idempotencyKey}`;
        return state.batches.get(key) || null;
      }),
      updateOne: vi.fn(async (query: any, update: any) => {
        const key = `${query.vendorId}:${query.idempotencyKey}`;
        const existing = state.batches.get(key) || {};
        state.batches.set(key, { ...existing, ...(update.$set || {}) });
        return { upsertedId: "batch-e2e", modifiedCount: 1 };
      }),
      deleteOne: vi.fn(async (query: any) => {
        const key = `${query.vendorId}:${query.idempotencyKey}`;
        state.batches.delete(key);
        return { deletedCount: 1 };
      }),
    })),
    ordersTable: {},
    productsTable: { id: "id", name: "name" },
    stockHistoryTable: {},
    vendorSettlementsTable: {},
    vendorsTable: { id: "id", ownerId: "ownerId" },
    shipmentsTable: {},
    bulkImportBatchesTable: {
      id: "id",
      vendorId: "vendorId",
      idempotencyKey: "idempotencyKey",
      status: "status",
      response: "response",
      leaseExpiresAt: "leaseExpiresAt",
      leaseToken: "leaseToken",
    },
    CATEGORIES: [
      "paithani", "designer", "bridal", "party", "indian-wear", "fashion-wear", "western-wear",
      "saree", "sarees", "Saree", "Sarees",
      "lehenga", "lehengas", "Lehenga", "Lehengas",
      "salwar", "salwars", "Salwar", "Salwars",
      "kurti", "kurtis", "Kurti", "Kurtis",
      "fabric", "fabrics", "Fabric", "Fabrics",
      "dresses", "tops",
    ],
    FABRICS: ["silk", "cotton", "georgette", "net", "chiffon", "tissue"],
    OCCASIONS: ["bridal", "festival", "casual", "party", "formal"],
    COLORS: ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint"],
    CATEGORY_PREFIX: {
      paithani: "PS",
      designer: "DS",
      bridal: "BS",
      party: "PW",
      "indian-wear": "IW",
      saree: "SR",
      sarees: "SR",
      lehenga: "LH",
      salwar: "SL",
      kurti: "KU",
      fabric: "FB",
    },
  };
});

vi.mock("../services/shipping", () => ({
  getAvailableCouriers: vi.fn(),
  createAndDispatchShipment: vi.fn(),
  syncSellerPickupToShiprocket: vi.fn(),
}));
vi.mock("../lib/orderNotifications", () => ({ insertOrderStatusNotification: vi.fn() }));
vi.mock("../lib/adminNotifications", () => ({ insertAdminNotification: vi.fn() }));
vi.mock("../lib/stockHistory", () => ({ recordStockChange: vi.fn() }));
vi.mock("../lib/socket", () => ({ emitOrderEvent: vi.fn(), emitProductEvent: vi.fn() }));
vi.mock("../lib/cacheEngine", () => ({
  globalCache: {},
  safeClearCache: vi.fn(),
  safeInvalidatePattern: vi.fn(),
}));

import sellerRouter from "../routes/seller";

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.headers["authorization"] = `Bearer ${OWNER_ID}`;
    next();
  });
  app.use("/api", sellerRouter);
  return app;
}

describe("End-to-End Excel Bulk Import Workflow", () => {
  let app: Express;

  beforeEach(() => {
    state.savedProducts = [];
    state.seqCounter = 500;
    state.batches.clear();
    app = createTestApp();
  });

  it("processes real workbook data, validates fields, associates vendorId, stores to MongoDB, and ensures idempotency", async () => {
    // 1. Construct realistic multi-row payload matching data parsed from Excel workbook with both valid and invalid rows
    const rowsToSend = [
      // Row 1: Valid Saree with currency & comma in price, R2 relative key
      {
        name: "Pure Kanjivaram Silk Saree",
        price: "₹18,500",
        category: "saree",
        sku: "KANJI-PURE-01",
        description: "Authentic Kanjivaram silk saree with zari border",
        fabric: "silk",
        color: "maroon",
        occasion: "bridal",
        stock: "10",
        originalPrice: "₹22,000",
        images: "public/products/seller_e2e/draft/kanji-front.webp",
      },
      // Row 2: Valid Lehenga with formatted price, R2 dev URL
      {
        name: "Embroidered Velvet Lehenga",
        price: "28,000",
        category: "lehenga",
        sku: "LEH-VELVET-01",
        description: "Designer bridal velvet lehenga with dupatta",
        fabric: "silk",
        color: "red",
        occasion: "bridal",
        stock: "5",
        originalPrice: "35000",
        images: "https://pub-vashtraa.r2.dev/products/lehenga-1.webp",
      },
      // Row 3: Invalid category
      {
        name: "Invalid Category Outfit",
        price: "5000",
        category: "UNKNOWN_CATEGORY",
        sku: "BAD-CAT-01",
        description: "Description",
        fabric: "cotton",
        color: "blue",
        occasion: "casual",
        stock: "10",
        originalPrice: "",
        images: "",
      },
      // Row 4: Missing product name
      {
        name: "",
        price: "4500",
        category: "kurti",
        sku: "NO-NAME-01",
        description: "Description without name",
        fabric: "cotton",
        color: "green",
        occasion: "casual",
        stock: "15",
        originalPrice: "",
        images: "",
      },
      // Row 5: Duplicate SKU (same as Row 1)
      {
        name: "Duplicate SKU Product",
        price: "12000",
        category: "saree",
        sku: "KANJI-PURE-01",
        description: "Duplicate of first product SKU",
        fabric: "silk",
        color: "gold",
        occasion: "festival",
        stock: "8",
        originalPrice: "",
        images: "",
      },
      // Row 6: Invalid price
      {
        name: "Bad Price Item",
        price: "FREE_SAMPLE",
        category: "kurti",
        sku: "FREE-01",
        description: "Item with non-numeric price",
        fabric: "cotton",
        color: "yellow",
        occasion: "casual",
        stock: "20",
        originalPrice: "",
        images: "",
      },
      // Row 7: Valid Kurti with rupee symbol
      {
        name: "Anarkali Printed Kurti",
        price: "₹2,499.00",
        category: "kurti",
        sku: "ANARKALI-01",
        description: "Cotton floral print festive kurti",
        fabric: "cotton",
        color: "pink",
        occasion: "festival",
        stock: "25",
        originalPrice: "3000",
        images: "/api/storage/public-objects/public/products/seller_e2e/draft/anarkali.webp",
      },
    ];

    expect(rowsToSend).toHaveLength(7);

    // 3. Post to bulk-import API endpoint
    const idempotencyKey = "e2e-test-bulk-uuid-9999";
    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", idempotencyKey)
      .send({ rows: rowsToSend });

    expect(res.status).toBe(200);

    // 4. Validate partial failure reporting
    const { summary, results } = res.body;
    expect(summary.total).toBe(7);
    expect(summary.succeeded).toBe(3); // Rows 1, 2, 7 succeed
    expect(summary.failed).toBe(4);    // Rows 3, 4, 5, 6 fail
    expect(summary.skippedDuplicates).toBe(1); // Row 5 is duplicate SKU

    // Row 1: Valid Saree
    expect(results[0].row).toBe(1);
    expect(results[0].success).toBe(true);
    expect(results[0].productId).toMatch(/^SR\d+/);

    // Row 2: Valid Lehenga
    expect(results[1].row).toBe(2);
    expect(results[1].success).toBe(true);
    expect(results[1].productId).toMatch(/^LH\d+/);

    // Row 3: Invalid category -> clear actionable error
    expect(results[2].row).toBe(3);
    expect(results[2].success).toBe(false);
    expect(results[2].error).toContain("Invalid category");

    // Row 4: Missing name -> clear actionable error
    expect(results[3].row).toBe(4);
    expect(results[3].success).toBe(false);
    expect(results[3].error).toBe("Missing name");

    // Row 5: Duplicate SKU -> clear actionable error
    expect(results[4].row).toBe(5);
    expect(results[4].success).toBe(false);
    expect(results[4].error).toBe("A product with this SKU already exists");

    // Row 6: Invalid price -> clear actionable error
    expect(results[5].row).toBe(6);
    expect(results[5].success).toBe(false);
    expect(results[5].error).toBe("Invalid price");

    // Row 7: Valid Kurti
    expect(results[6].row).toBe(7);
    expect(results[6].success).toBe(true);
    expect(results[6].productId).toMatch(/^KU\d+/);

    // 5. Verify saved products in MongoDB repository
    expect(state.savedProducts).toHaveLength(3);

    const sareeDoc = state.savedProducts.find((p) => p.sku === "KANJI-PURE-01");
    expect(sareeDoc).toBeDefined();
    expect(sareeDoc.vendorId).toBe(VENDOR_ID);
    expect(sareeDoc.vendorName).toBe(VENDOR_NAME);
    expect(sareeDoc.status).toBe("approved");
    expect(sareeDoc.active).toBe(true);
    expect(sareeDoc.price).toBe(18500); // Cleansed currency & comma
    expect(sareeDoc.originalPrice).toBe(22000);
    expect(sareeDoc.images).toEqual([
      "/api/storage/public-objects/public/products/seller_e2e/draft/kanji-front.webp"
    ]);

    const lehengaDoc = state.savedProducts.find((p) => p.sku === "LEH-VELVET-01");
    expect(lehengaDoc).toBeDefined();
    expect(lehengaDoc.price).toBe(28000);
    expect(lehengaDoc.images).toEqual([
      "https://pub-vashtraa.r2.dev/products/lehenga-1.webp"
    ]);

    const kurtiDoc = state.savedProducts.find((p) => p.sku === "ANARKALI-01");
    expect(kurtiDoc).toBeDefined();
    expect(kurtiDoc.price).toBe(2499);

    // 6. Test idempotent retry: Resending the exact same request returns stored response without duplicating products
    const retryRes = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", idempotencyKey)
      .send({ rows: rowsToSend });

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.summary).toEqual(summary);
    // MongoDB should still have exactly 3 products — no duplicates created!
    expect(state.savedProducts).toHaveLength(3);
  });
});
