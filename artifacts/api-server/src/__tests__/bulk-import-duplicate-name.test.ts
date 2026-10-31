/**
 * POST /seller/products/bulk-import — duplicate product name detection
 *
 * Verifies that:
 *  1. A row whose name matches an existing product (same vendorId) is rejected
 *     with "A product with this name already exists".
 *  2. The match is case-insensitive ("silk saree" duplicates "Silk Saree").
 *  3. Two rows in the same batch with the same name produce one success and
 *     one duplicate error.
 *  4. A valid row with a brand-new name still inserts successfully.
 *
 * Uses in-memory mocks — no live database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── Mutable test state ───────────────────────────────────────────────────────

const VENDOR_ID  = "vendor-bulk-dup-test";
const OWNER_ID   = "owner-bulk-dup-test";
const VENDOR_NAME = "Dup Test Vendor";

// Tracks which product names "already exist" for this vendor in the DB.
const state = vi.hoisted(() => ({
  existingNames: [] as string[],
  insertedRows:  [] as any[],
  seqCounter:    1,
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  // Returns a fluent query builder whose awaited value comes from getRows().
  function queryResult(getRows: () => unknown[]): any {
    const obj: any = {
      from:    vi.fn(() => obj),
      where:   vi.fn(() => obj),
      orderBy: vi.fn(() => obj),
      limit:   vi.fn(() => obj),
      select:  vi.fn(() => obj),
      then:    (resolve: any, reject: any) => Promise.resolve(getRows()).then(resolve, reject),
    };
    return obj;
  }

  const insertObj: any = {
    values:    vi.fn((row: any) => {
      state.insertedRows.push(row);
      return insertObj;
    }),
    returning: vi.fn(() =>
      Promise.resolve([{ id: `SA${state.seqCounter++}`, name: state.insertedRows.at(-1)?.name ?? "" }])
    ),
  };

  const dbMock: any = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() =>
          // Return existing rows whose lower-cased name is in the lookup set.
          // We store real mixed-case names and filter them here, mimicking
          // PostgreSQL's lower(name) = ANY(...) behaviour.
          Promise.resolve(
            state.existingNames.map((n) => ({ name: n }))
          )
        ),
      })),
    })),
    insert: vi.fn(() => insertObj),
    execute: vi.fn(() =>
      Promise.resolve({ rows: [{ seq: state.seqCounter }] })
    ),
  };

  // Minimal tagged columns so the route can reference table fields.
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: dbMock,
    productsTable: tag("products", [
      "id", "name", "vendorId", "vendorName", "category", "price",
      "stock", "fabric", "color", "occasion", "status", "active",
    ]),
    ordersTable:   tag("orders",  ["id", "vendorId"]),
    vendorsTable:  tag("vendors", ["id", "ownerId", "name"]),
    stockHistoryTable: tag("stockHistory", ["id", "productId"]),
    vendorSettlementsTable: tag("vendorSettlements", ["id"]),
    CATEGORIES: ["saree", "lehenga", "salwar", "kurti", "fabric"],
    FABRICS:    ["silk", "cotton", "georgette", "chiffon", "linen"],
    COLORS:     ["red", "blue", "green", "yellow", "pink", "black", "white"],
    OCCASIONS:  ["festival", "wedding", "casual", "party", "office"],
    CATEGORY_PREFIX: { saree: "SA", lehenga: "LE", salwar: "SL", kurti: "KU", fabric: "FA" },
    mongoProducts: {
      insert: vi.fn(async (doc: any) => doc),
      findMany: vi.fn(async () => []),
      findById: vi.fn(async () => null),
    },
    isMongoDbConnected: vi.fn(() => false),
    getNextSequenceValue: vi.fn(async () => state.seqCounter++),
    getCollection: vi.fn(() => ({
      findOne: vi.fn(async () => null),
      insertOne: vi.fn(async () => ({ insertedId: "mock-id" })),
      updateOne: vi.fn(async () => ({})),
      deleteOne: vi.fn(async () => ({})),
    })),
  };
});

// ─── Middleware mocks ─────────────────────────────────────────────────────────

vi.mock("../middlewares/isSeller", () => ({
  isSeller: (req: any, _res: any, next: () => void) => {
    req.vendorId = VENDOR_ID;
    req.vendor   = { id: VENDOR_ID, ownerId: OWNER_ID, name: VENDOR_NAME };
    req.userId   = OWNER_ID;
    next();
  },
}));

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../lib/stockHistory", () => ({
  recordStockChange: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/orderNotifications", () => ({
  insertOrderStatusNotification: vi.fn(() => Promise.resolve()),
}));

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  const { default: sellerRouter } = await import("../routes/seller");
  app.use("/api", sellerRouter);
  return app;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    name:     "Brand New Saree",
    price:    "2500",
    category: "saree",
    fabric:   "silk",
    color:    "red",
    occasion: "festival",
    stock:    "5",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/seller/products/bulk-import — duplicate name detection", () => {
  let app: Express;

  beforeEach(async () => {
    state.existingNames = [];
    state.insertedRows  = [];
    state.seqCounter    = 1;
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("rejects a row whose name exactly matches an existing product", async () => {
    state.existingNames = ["Existing Silk Saree"];

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({ rows: [validRow({ name: "Existing Silk Saree" })] });

    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe("A product with this name already exists");
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.summary.succeeded).toBe(0);
  });

  it("rejects a row whose name matches an existing product case-insensitively", async () => {
    // DB has "Silk Saree" (mixed case); import sends "silk saree" (lowercase)
    state.existingNames = ["Silk Saree"];

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({ rows: [validRow({ name: "silk saree" })] });

    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe("A product with this name already exists");
  });

  it("catches a within-batch duplicate: first row succeeds, second row is rejected", async () => {
    state.existingNames = []; // nothing pre-existing

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({
        rows: [
          validRow({ name: "New Unique Saree" }),
          validRow({ name: "New Unique Saree" }), // duplicate of row 1
        ],
      });

    expect(res.status).toBe(200);
    const [r1, r2] = res.body.results;
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(false);
    expect(r2.error).toBe("A product with this name already exists");
    expect(res.body.summary.succeeded).toBe(1);
    expect(res.body.summary.failed).toBe(1);
  });

  it("allows a row with a genuinely new name to insert successfully", async () => {
    state.existingNames = ["Other Product"];

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({ rows: [validRow({ name: "Completely New Saree" })] });

    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.success).toBe(true);
    expect(result.productId).toBeDefined();
  });

  it("normalizes ordered direct and uploaded image paths, and returns them with the bulk result", async () => {
    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({
        rows: [validRow({
          name: "Image Contract Saree",
          images: " https://cdn.example.com/look-one.jpg | product-images/look-two.webp | /api/storage/public-objects/product-images/look-three.png ",
        })],
      });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({
      success: true,
      images: [
        "https://cdn.example.com/look-one.jpg",
        "/api/storage/public-objects/product-images/look-two.webp",
        "/api/storage/public-objects/product-images/look-three.png",
      ],
    });
    expect(state.insertedRows).toHaveLength(1);
    expect(state.insertedRows[0].images).toEqual(res.body.results[0].images);
  });

  it("rejects invalid image values before inserting their product while importing valid neighbors", async () => {
    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({
        rows: [
          validRow({ name: "Direct Image Saree", images: "https://images.example.com/direct.jpg" }),
          validRow({ name: "Pinterest Link Saree", images: "https://in.pinterest.com/pin/1086352741404761172/" }),
          validRow({ name: "HTML Page Saree", images: "https://shop.example.com/products/paithani" }),
          validRow({ name: "Unsafe Link Saree", images: "javascript:alert(1)" }),
          validRow({ name: "Blank Segment Saree", images: "https://images.example.com/one.jpg||https://images.example.com/two.jpg" }),
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 5, succeeded: 1, failed: 4 });
    expect(res.body.results.map((result: any) => result.success)).toEqual([true, false, false, false, false]);
    expect(res.body.results.slice(1).every((result: any) =>
      result.error === "Use direct http(s) image URLs or public product image paths, not page/share links"
      || result.error === "Images cannot contain blank entries",
    )).toBe(true);
    expect(state.insertedRows).toHaveLength(1);
    expect(state.insertedRows[0].name).toBe("Direct Image Saree");
  });

  it("rejects unresolved attached image names instead of creating a product without its mapped photos", async () => {
    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({
        rows: [validRow({
          name: "Unresolved Attachment Saree",
          imageFiles: "front.jpg|back.jpg",
        })],
      });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({
      success: false,
      error: "Attached image names must be resolved to public product images before import",
    });
    expect(state.insertedRows).toHaveLength(0);
  });

  it("applies the same image policy to the legacy CSV bulk-upload endpoint", async () => {
    const res = await request(app)
      .post("/api/seller/products/bulk-upload")
      .send({
        csv: [
          "name,price,category,images",
          "Legacy Public Path,2500,saree,product-images/legacy.jpg",
          "Legacy Page Link,2500,saree,https://in.pinterest.com/pin/1086352741404761172/",
        ].join("\n"),
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(res.body.results[0]).toMatchObject({
      success: true,
      images: ["/api/storage/public-objects/product-images/legacy.jpg"],
    });
    expect(res.body.results[1]).toMatchObject({
      success: false,
      error: "Use direct http(s) image URLs or public product image paths, not page/share links",
    });
    expect(state.insertedRows).toHaveLength(1);
    expect(state.insertedRows[0].images).toEqual(["/api/storage/public-objects/product-images/legacy.jpg"]);
  });
});
