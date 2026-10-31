import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const VENDOR_ID = "vendor-resilience-test";
const OWNER_ID = "user_resilience_test";
const VENDOR_NAME = "Resilience Artisan Studio";

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

const state = vi.hoisted(() => ({
  existingSkus: [] as string[],
  existingNames: [] as string[],
  savedProducts: [] as any[],
  seqCounter: 100,
  shouldFailMongoInsert: false,
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
    values: vi.fn((row: any) => {
      return insertObj;
    }),
    returning: vi.fn(() => Promise.resolve([])),
    onConflictDoNothing: vi.fn(() => insertObj),
  };

  const updateObj: any = {
    set: vi.fn(() => updateObj),
    where: vi.fn(() => updateObj),
    returning: vi.fn(() => Promise.resolve([{ id: "batch-123" }])),
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

  const mongoSellersMock = {
    findByOwnerId: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    findBySellerId: vi.fn(async () => null),
    findByVendorId: vi.fn(async () => null),
    findByEmail: vi.fn(async () => null),
  };

  const mongoProductsMock = {
    findMany: vi.fn(async () => {
      return [
        ...state.existingNames.map((name) => ({ name, vendorId: VENDOR_ID })),
        ...state.existingSkus.map((sku) => ({ sku, vendorId: VENDOR_ID })),
      ];
    }),
    insert: vi.fn(async (doc: any) => {
      if (state.shouldFailMongoInsert) {
        return null;
      }
      state.savedProducts.push(doc);
      return doc;
    }),
  };

  return {
    db: dbMock,
    mongoVendors: mongoVendorsMock,
    mongoSellers: mongoSellersMock,
    mongoProducts: mongoProductsMock,
    mongoOrders: {},
    mongoShipments: {},
    isMongoDbConnected: () => true,
    getNextSequenceValue: vi.fn(async () => state.seqCounter++),
    getCollection: vi.fn(() => ({
      findOne: vi.fn(async () => null),
      updateOne: vi.fn(async () => ({ upsertedId: "batch-1" })),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
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
      "saree", "sarees", "lehenga", "lehengas", "salwar", "salwars", "kurti", "kurtis", "fabric", "fabrics"
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

describe("POST /api/seller/products/bulk-import - Resilience & Edge Cases", () => {
  let app: Express;

  beforeEach(() => {
    state.existingSkus = [];
    state.existingNames = [];
    state.savedProducts = [];
    state.seqCounter = 100;
    state.shouldFailMongoInsert = false;
    app = createTestApp();
  });

  it("handles partial imports safely when one row has a duplicate SKU", async () => {
    state.existingSkus = ["existing-sku-99"];

    const rows = [
      {
        name: "Valid Royal Paithani",
        price: "12000",
        category: "paithani",
        sku: "UNIQUE-SKU-1",
        fabric: "silk",
        color: "red",
        occasion: "festival",
        stock: "15",
        images: "https://example.com/p1.jpg",
      },
      {
        name: "Duplicate SKU Paithani",
        price: "9500",
        category: "paithani",
        sku: "EXISTING-SKU-99", // duplicate
        fabric: "silk",
        color: "blue",
        occasion: "bridal",
        stock: "5",
        images: "https://example.com/p2.jpg",
      },
      {
        name: "Second Valid Paithani",
        price: "15000",
        category: "paithani",
        sku: "UNIQUE-SKU-2",
        fabric: "silk",
        color: "gold",
        occasion: "festival",
        stock: "8",
        images: "https://example.com/p3.jpg",
      },
    ];

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({ rows });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      total: 3,
      succeeded: 2,
      failed: 1,
      skippedDuplicates: 1,
    });

    const { results } = res.body;
    expect(results).toHaveLength(3);

    // Row 1 succeeded
    expect(results[0].row).toBe(1);
    expect(results[0].success).toBe(true);
    expect(results[0].productId).toMatch(/^PS\d+/);

    // Row 2 failed with actionable SKU error
    expect(results[1].row).toBe(2);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe("A product with this SKU already exists");

    // Row 3 succeeded
    expect(results[2].row).toBe(3);
    expect(results[2].success).toBe(true);

    // Verify products were persisted with correct vendorId and images
    expect(state.savedProducts).toHaveLength(2);
    expect(state.savedProducts[0].vendorId).toBe(VENDOR_ID);
    expect(state.savedProducts[0].sku).toBe("UNIQUE-SKU-1");
    expect(state.savedProducts[0].images).toEqual(["https://example.com/p1.jpg"]);
  });

  it("does not report success if database persistence fails on a row", async () => {
    state.shouldFailMongoInsert = true;

    const rows = [
      {
        name: "Unpersistable Product",
        price: "8000",
        category: "paithani",
        sku: "UNPERSIST-1",
        fabric: "silk",
        color: "red",
        occasion: "festival",
        stock: "10",
        images: "https://example.com/p.jpg",
      },
    ];

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({ rows });

    expect(res.status).toBe(200);
    expect(res.body.summary.succeeded).toBe(0);
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.results[0].success).toBe(false);
    expect(res.body.results[0].error).toContain("Database write failed");
  });

  it("correctly associates seller's vendorId and auto-approves valid products", async () => {
    const rows = [
      {
        name: "Artisan Silk Saree",
        price: "11500",
        category: "paithani",
        sku: "ARTISAN-01",
        fabric: "silk",
        color: "maroon",
        occasion: "bridal",
        stock: "20",
        images: "https://r2.vastraa.com/products/artisan-1.jpg",
      },
    ];

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({ rows });

    expect(res.status).toBe(200);
    expect(res.body.summary.succeeded).toBe(1);
    expect(state.savedProducts).toHaveLength(1);
    const saved = state.savedProducts[0];
    expect(saved.vendorId).toBe(VENDOR_ID);
    expect(saved.vendorName).toBe(VENDOR_NAME);
    expect(saved.status).toBe("approved");
    expect(saved.active).toBe(true);
    expect(saved.images).toEqual(["https://r2.vastraa.com/products/artisan-1.jpg"]);
  });

  it("correctly normalizes prices formatted with currency symbols, commas, category variants, and R2 image keys", async () => {
    const rows = [
      {
        name: "Kanchipuram Silk Saree",
        price: "₹18,500", // currency symbol and comma
        originalPrice: "₹24,000",
        category: "saree", // newly added standard category
        sku: "KANCHI-001",
        fabric: "silk",
        color: "maroon",
        occasion: "bridal",
        stock: " 15 ",
        images: "public/products/seller-1/draft/kanchi.webp | https://pub-test.r2.dev/products/kanchi-back.webp",
      },
      {
        name: "Chanderi Cotton Kurti",
        price: " 2,499.00 ", // spaces and decimals
        category: "kurti",
        sku: "KURTI-001",
        fabric: "cotton",
        color: "yellow",
        occasion: "casual",
        stock: "25",
        images: "/api/storage/public-objects/public/products/seller-1/draft/kurti.webp",
      },
    ];

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({ rows });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      total: 2,
      succeeded: 2,
      failed: 0,
      skippedDuplicates: 0,
    });

    expect(state.savedProducts).toHaveLength(2);
    // Price parsed cleanly without truncation
    expect(state.savedProducts[0].price).toBe(18500);
    expect(state.savedProducts[0].originalPrice).toBe(24000);
    expect(state.savedProducts[0].category).toBe("saree");
    expect(state.savedProducts[0].images).toEqual([
      "/api/storage/public-objects/public/products/seller-1/draft/kanchi.webp",
      "https://pub-test.r2.dev/products/kanchi-back.webp",
    ]);

    expect(state.savedProducts[1].price).toBe(2499);
    expect(state.savedProducts[1].category).toBe("kurti");
    expect(state.savedProducts[1].images).toEqual([
      "/api/storage/public-objects/public/products/seller-1/draft/kurti.webp",
    ]);
  });
});
