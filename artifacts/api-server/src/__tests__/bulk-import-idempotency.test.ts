/**
 * POST /seller/products/bulk-import — vendor-scoped idempotency
 *
 * Verifies that the Idempotency-Key header makes retries safe:
 *
 *  1. Backward compatibility — a request WITHOUT the header behaves exactly as
 *     before (products inserted, normal {results, summary} returned).
 *  2. Lost-response retry — a second request with the SAME key, after the first
 *     completed, returns the STORED response verbatim (no re-insert, so no
 *     spurious duplicate-name errors) and inserts no additional products.
 *  3. Processing-in-progress — a retry that arrives while a batch row exists but
 *     is not yet completed returns 409 with { processing: true } and does not
 *     create a second batch.
 *  4. Invalid key — an oversized / control-character key is rejected with 400.
 *
 * Uses an in-memory mock of the idempotency table + a fake transaction so the
 * completed response is only "committed" when inserts succeed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const VENDOR_ID = "vendor-bulk-idem-test";
const OWNER_ID = "owner-bulk-idem-test";
const VENDOR_NAME = "Idem Test Vendor";

// ─── Mutable test state ───────────────────────────────────────────────────────

type BatchRow = {
  id: string;
  vendorId: string;
  idempotencyKey: string;
  status: string;
  response: unknown;
  leaseExpiresAt: Date | null;
  leaseToken: string | null;
};

const state = vi.hoisted(() => ({
  existingNames: [] as string[],
  insertedProductCount: 0,
  seqCounter: 1,
  batches: [] as BatchRow[],
  batchIdCounter: 1,
  productSelectCalls: 0,
  beforeCompletionHook: null as null | (() => void),
  cleanupLeaseToken: null as string | null,
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const BULK_TABLE = "bulk_import_batches";
  const PRODUCTS_TABLE = "products";

  // Track the current table for a select() chain so we can branch on it.
  function makeSelectChain() {
    let table = "";
    const chain: any = {
      from: vi.fn((t: any) => {
        table = t?._t ?? "";
        return chain;
      }),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: (resolve: any, reject: any) => {
        let rows: any[] = [];
        if (table === BULK_TABLE) {
          // Return every batch row; the route filters by where() logically,
          // but for the test only one key is ever in flight per case.
          rows = state.batches.map((b) => ({
            id: b.id,
            status: b.status,
            response: b.response,
            leaseExpiresAt: b.leaseExpiresAt,
            leaseToken: b.leaseToken,
          }));
        } else if (table === PRODUCTS_TABLE) {
          state.productSelectCalls++;
          rows = state.existingNames.map((n) => ({ name: n }));
        }
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  }

  function makeInsert(executor: any) {
    return vi.fn((table: any) => {
      const t = table?._t ?? "";
      if (t === BULK_TABLE) {
        let pending: BatchRow | null = null;
        let conflict = false;
        const obj: any = {
          values: vi.fn((row: any) => {
            const dup = state.batches.find(
              (b) => b.vendorId === row.vendorId && b.idempotencyKey === row.idempotencyKey,
            );
            if (dup) {
              conflict = true;
            } else {
              pending = {
                id: `batch-${state.batchIdCounter++}`,
                vendorId: row.vendorId,
                idempotencyKey: row.idempotencyKey,
                status: row.status ?? "processing",
                response: null,
                leaseExpiresAt: row.leaseExpiresAt ?? null,
                leaseToken: row.leaseToken ?? null,
              };
            }
            return obj;
          }),
          onConflictDoNothing: vi.fn(() => obj),
          returning: vi.fn(() => {
            if (conflict || !pending) return Promise.resolve([]);
            state.batches.push(pending);
            return Promise.resolve([{ id: pending.id }]);
          }),
        };
        return obj;
      }
      // products insert
      const obj: any = {
        values: vi.fn((row: any) => {
          obj._name = row.name;
          return obj;
        }),
        returning: vi.fn(() => {
          state.insertedProductCount++;
          return Promise.resolve([{ id: `SA${state.seqCounter++}`, name: obj._name }]);
        }),
      };
      return obj;
    });
  }

  function makeUpdate() {
    return vi.fn(() => {
      let updated: BatchRow | null = null;
      const obj: any = {
        set: vi.fn((vals: any) => {
          obj._vals = vals;
          return obj;
        }),
        where: vi.fn(() => {
          if (obj._vals?.status === "completed" && state.beforeCompletionHook) {
            const hook = state.beforeCompletionHook;
            state.beforeCompletionHook = null;
            hook();
          }

          const target = state.batches.find((b) => {
            if (b.status !== "processing") return false;
            if (obj._vals?.status === "completed") {
              return b.leaseToken === obj._vals.leaseToken;
            }
            return b.leaseExpiresAt != null && b.leaseExpiresAt.getTime() <= Date.now();
          });
          if (target && obj._vals) {
            target.status = obj._vals.status ?? target.status;
            target.response = obj._vals.response ?? target.response;
            target.leaseExpiresAt = obj._vals.leaseExpiresAt ?? null;
            target.leaseToken = obj._vals.leaseToken ?? target.leaseToken;
            updated = target;
          }
          return obj;
        }),
        returning: vi.fn(() => Promise.resolve(updated ? [{ id: updated.id }] : [])),
        then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
      };
      return obj;
    });
  }

  function makeDelete() {
    return vi.fn(() => ({
      where: vi.fn(() => {
        // Preserve a batch that another worker reclaimed with a different token.
        state.batches = state.batches.filter((b) => !(
          b.status === "processing"
          && (state.cleanupLeaseToken == null || b.leaseToken === state.cleanupLeaseToken)
        ));
        state.cleanupLeaseToken = null;
        return Promise.resolve();
      }),
    }));
  }

  const execute = vi.fn(() => Promise.resolve({ rows: [{ seq: state.seqCounter }] }));

  const dbMock: any = {
    select: vi.fn(() => makeSelectChain()),
    insert: makeInsert(null),
    update: makeUpdate(),
    delete: makeDelete(),
    execute,
    transaction: vi.fn(async (cb: any) => {
      const productCountBefore = state.insertedProductCount;
      const seqBefore = state.seqCounter;
      const tx: any = {
        select: dbMock.select,
        insert: dbMock.insert,
        update: dbMock.update,
        delete: dbMock.delete,
        execute: dbMock.execute,
      };
      try {
        return await cb(tx);
      } catch (error) {
        // Product writes are part of the transaction and roll back if lease
        // fencing rejects completion. The externally reclaimed batch remains.
        state.insertedProductCount = productCountBefore;
        state.seqCounter = seqBefore;
        throw error;
      }
    }),
  };

  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: dbMock,
    productsTable: tag("products", [
      "id", "name", "vendorId", "vendorName", "category", "price",
      "stock", "fabric", "color", "occasion", "status", "active",
    ]),
    ordersTable: tag("orders", ["id", "vendorId"]),
    vendorsTable: tag("vendors", ["id", "ownerId", "name"]),
    stockHistoryTable: tag("stockHistory", ["id", "productId"]),
    vendorSettlementsTable: tag("vendorSettlements", ["id"]),
    bulkImportBatchesTable: tag("bulk_import_batches", [
      "id", "vendorId", "idempotencyKey", "status", "response", "createdAt", "completedAt",
      "leaseExpiresAt", "leaseToken",
    ]),
    CATEGORIES: ["saree", "lehenga", "salwar", "kurti", "fabric"],
    FABRICS: ["silk", "cotton", "georgette", "chiffon", "linen"],
    COLORS: ["red", "blue", "green", "yellow", "pink", "black", "white"],
    OCCASIONS: ["festival", "wedding", "casual", "party", "office"],
    CATEGORY_PREFIX: { saree: "SA", lehenga: "LE", salwar: "SL", kurti: "KU", fabric: "FA" },
  };
});

// ─── Middleware mocks ─────────────────────────────────────────────────────────

vi.mock("../middlewares/isSeller", () => ({
  isSeller: (req: any, _res: any, next: () => void) => {
    req.vendorId = VENDOR_ID;
    req.vendor = { id: VENDOR_ID, ownerId: OWNER_ID, name: VENDOR_NAME };
    req.userId = OWNER_ID;
    next();
  },
}));

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../lib/stockHistory", () => ({ recordStockChange: vi.fn(() => Promise.resolve()) }));
vi.mock("../lib/adminNotifications", () => ({ insertAdminNotification: vi.fn(() => Promise.resolve()) }));
vi.mock("../lib/orderNotifications", () => ({ insertOrderStatusNotification: vi.fn(() => Promise.resolve()) }));

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  const { default: sellerRouter } = await import("../routes/seller");
  app.use("/api", sellerRouter);
  return app;
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    name: "Brand New Saree",
    price: "2500",
    category: "saree",
    fabric: "silk",
    color: "red",
    occasion: "festival",
    stock: "5",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/seller/products/bulk-import — idempotency", () => {
  let app: Express;

  beforeEach(async () => {
    state.existingNames = [];
    state.insertedProductCount = 0;
    state.seqCounter = 1;
    state.batches = [];
    state.batchIdCounter = 1;
    state.productSelectCalls = 0;
    state.beforeCompletionHook = null;
    state.cleanupLeaseToken = null;
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("works without an Idempotency-Key header (backward compatible)", async () => {
    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .send({ rows: [validRow({ name: "No Key Saree" })] });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
    expect(res.body.summary.succeeded).toBe(1);
    // No idempotency batch row created.
    expect(state.batches).toHaveLength(0);
    expect(state.insertedProductCount).toBe(1);
  });

  it("replays the stored response on retry with the same key (lost-response safe)", async () => {
    const key = "11111111-1111-4111-8111-111111111111";

    const first = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", key)
      .send({ rows: [validRow({ name: "Retry Saree" })] });

    expect(first.status).toBe(200);
    expect(first.body.results[0].success).toBe(true);
    expect(state.insertedProductCount).toBe(1);
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0].status).toBe("completed");

    // Simulate the first response being lost — client retries with same key.
    const second = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", key)
      .send({ rows: [validRow({ name: "Retry Saree" })] });

    expect(second.status).toBe(200);
    // Exact stored response replayed — no duplicate-name error.
    expect(second.body).toEqual(first.body);
    expect(second.body.results[0].success).toBe(true);
    // No additional products inserted, still one batch.
    expect(state.insertedProductCount).toBe(1);
    expect(state.batches).toHaveLength(1);
  });

  it("reports processing-in-progress (409) when a batch row is not yet completed", async () => {
    const key = "22222222-2222-4222-8222-222222222222";
    // Seed a batch row that is still "processing" (simulates a concurrent
    // in-flight request that claimed the key but hasn't completed).
    state.batches.push({
      id: "batch-existing",
      vendorId: VENDOR_ID,
      idempotencyKey: key,
      status: "processing",
      response: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      leaseToken: "fresh-owner",
    });

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", key)
      .send({ rows: [validRow({ name: "Concurrent Saree" })] });

    expect(res.status).toBe(409);
    expect(res.body.processing).toBe(true);
    // No second batch created, no products inserted by the loser.
    expect(state.batches).toHaveLength(1);
    expect(state.insertedProductCount).toBe(0);
  });

  it("reclaims an expired processing lease after a server interruption", async () => {
    const key = "33333333-3333-4333-8333-333333333333";
    state.batches.push({
      id: "batch-stale",
      vendorId: VENDOR_ID,
      idempotencyKey: key,
      status: "processing",
      response: null,
      leaseExpiresAt: new Date(Date.now() - 60_000),
      leaseToken: "stale-owner",
    });

    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", key)
      .send({ rows: [validRow({ name: "Recovered Saree" })] });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
    expect(state.insertedProductCount).toBe(1);
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0].status).toBe("completed");
    expect(state.batches[0].leaseExpiresAt).toBeNull();
  });

  it("rolls back a slow worker after another owner fences its completion", async () => {
    const key = "44444444-4444-4444-8444-444444444444";

    state.beforeCompletionHook = () => {
      const active = state.batches.find((batch) => batch.idempotencyKey === key);
      if (!active) throw new Error("Expected active batch");
      state.cleanupLeaseToken = active.leaseToken;
      active.leaseToken = "reclaimed-by-another-worker";
      active.leaseExpiresAt = new Date(Date.now() + 60_000);
    };

    const fenced = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", key)
      .send({ rows: [validRow({ name: "Slow Saree" })] });

    expect(fenced.status).toBe(500);
    expect(state.insertedProductCount).toBe(0);
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0].status).toBe("processing");
    expect(state.batches[0].leaseToken).toBe("reclaimed-by-another-worker");

    // Once the surviving owner's lease expires, a new retry can safely finish.
    state.batches[0].leaseExpiresAt = new Date(Date.now() - 60_000);
    const recovered = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", key)
      .send({ rows: [validRow({ name: "Slow Saree" })] });

    expect(recovered.status).toBe(200);
    expect(recovered.body.results[0].success).toBe(true);
    expect(state.insertedProductCount).toBe(1);
    expect(state.batches[0].status).toBe("completed");
  });

  it("rejects an invalid (oversized) Idempotency-Key with 400", async () => {
    const res = await request(app)
      .post("/api/seller/products/bulk-import")
      .set("Idempotency-Key", "x".repeat(300))
      .send({ rows: [validRow()] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Idempotency-Key/i);
    expect(state.batches).toHaveLength(0);
  });
});
