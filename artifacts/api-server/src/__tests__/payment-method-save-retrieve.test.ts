/**
 * Integration tests: POST /api/payment-methods then GET /api/payment-methods.
 *
 * Verifies that a UPI ID or card saved via the POST endpoint immediately
 * appears in the list returned by the GET endpoint — the core behaviour
 * exercised when a shopper checks "Save for future purchases", places an
 * order, and returns to checkout.
 *
 * The @workspace/db module is replaced with a stateful in-memory store so
 * the full route logic (validation, duplicate-check, default-promotion,
 * insert, list ordering) runs without a real database connection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── In-memory payment-method store ──────────────────────────────────────────

const store = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  idCounter: 0,
  reset() {
    this.rows = [];
    this.idCounter = 0;
  },
  nextId() {
    return `pm-${++this.idCounter}`;
  },
  forUser(userId: string) {
    return this.rows.filter((r) => r.userId === userId);
  },
}));

// ─── @workspace/db mock ───────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const columnToProperty: Record<string, string> = {
    id: "id",
    user_id: "userId",
    type: "type",
    last4: "last4",
    card_brand: "cardBrand",
    expiry_month: "expiryMonth",
    expiry_year: "expiryYear",
    upi_id: "upiId",
  };

  /**
   * Drizzle's eq/and conditions are SQL objects. Extracting their equality
   * chunks keeps this mock stateful without coupling the tests to Drizzle's
   * internal SQL renderer.
   */
  function equalities(condition: any): Array<[string, unknown]> {
    const chunks = condition?.queryChunks;
    if (!Array.isArray(chunks)) return [];

    if (
      chunks.length === 5 &&
      typeof chunks[1] === "string" &&
      chunks[3] !== undefined
    ) {
      return [[chunks[1], chunks[3]]];
    }

    return chunks.flatMap((chunk: unknown) => equalities(chunk));
  }

  function rowsMatching(
    rows: Record<string, unknown>[],
    condition?: unknown
  ): Record<string, unknown>[] {
    const filters = equalities(condition);
    if (filters.length === 0) return rows;

    return rows.filter((row) =>
      filters.every(([column, value]) => row[columnToProperty[column] ?? column] === value)
    );
  }

  /**
   * Builds a query chain that resolves to `rows` and supports the subset of
   * Drizzle chaining the paymentMethods route actually uses:
   *   .from().where().limit()
   *   .from().where().orderBy()
   */
  function makeSelectChain(rows: Record<string, unknown>[]) {
    const withWhere = (condition: unknown) => {
      const matchingRows = rowsMatching(rows, condition);
      const orderedRows = Object.assign(Promise.resolve(matchingRows), {
        limit: () => Promise.resolve(matchingRows.slice(0, 1)),
      });
      return {
        limit: () => Promise.resolve(matchingRows.slice(0, 1)),
        orderBy: (_a: unknown, _b: unknown) => orderedRows,
      };
    };

    return {
      from: (_table: unknown) => ({
        where: withWhere,
        orderBy: (_a: unknown, _b: unknown) => Promise.resolve(rows),
      }),
    };
  }

  /**
   * makeWhereResult — wraps undefined resolution with a .returning() shim
   * for update/insert chains.
   */
  function makeWhereResult(returningRows: unknown[] = []) {
    return Object.assign(Promise.resolve(undefined), {
      returning: vi.fn(() => Promise.resolve(returningRows)),
    });
  }

  const savedPaymentMethodsTable: any = {
    _t: "saved_payment_methods",
    id: "id",
    userId: "user_id",
    type: "type",
    last4: "last4",
    cardBrand: "card_brand",
    expiryMonth: "expiry_month",
    expiryYear: "expiry_year",
    upiId: "upi_id",
    isDefault: "is_default",
    createdAt: "created_at",
  };

  /**
   * The transaction mock drives the full POST logic:
   *
   *   select #0 → duplicate check  (return [] = no duplicate)
   *   select #1 → existing count   (return store rows for the user)
   *   update    → clear isDefault flags in store
   *   insert    → create the new row in store and return it
   */
  function makeTransaction() {
    return {
      select: vi.fn((_spec?: unknown) => makeSelectChain(store.rows)),
      update: vi.fn(() => ({
        set: vi.fn((vals: Record<string, unknown>) => ({
          where: vi.fn((condition: unknown) => {
            rowsMatching(store.rows, condition).forEach((row) => Object.assign(row, vals));
            return Promise.resolve();
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((vals: Record<string, unknown>) => {
          const newRow = {
            id: store.nextId(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...vals,
          };
          store.rows.push(newRow);
          return Object.assign(Promise.resolve(undefined), {
            returning: vi.fn(() => Promise.resolve([newRow])),
          });
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn((condition: unknown) => {
          const matchingRows = new Set(rowsMatching(store.rows, condition));
          store.rows = store.rows.filter((row) => !matchingRows.has(row));
          return Promise.resolve();
        }),
      })),
    };
  }

  const db: any = {
    /**
     * GET route: db.select().from(spm).where(userId).orderBy(isDefault DESC, createdAt ASC)
     * We return the user's rows ordered: defaults first, then by insertion order (id counter).
     */
    select: vi.fn((_spec?: unknown) => ({
      from: (_table: unknown) => ({
        where: (condition: unknown) => ({
          orderBy: (_a: unknown, _b: unknown) => {
            // Sort: isDefault=true first, then by store insertion order (id)
            const rows = [...rowsMatching(store.rows, condition)].sort((a, b) => {
              if (a.isDefault === b.isDefault) {
                return String(a.id).localeCompare(String(b.id));
              }
              return a.isDefault ? -1 : 1;
            });
            return Object.assign(Promise.resolve(rows), {
              limit: () => Promise.resolve(rows.slice(0, 1)),
            });
          },
        }),
      }),
    })),

    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(makeTransaction())
    ),
  };

  return {
    db,
    savedPaymentMethodsTable,
    // Other tables used transitively by isCustomer / app bootstrap
    usersTable: { _t: "users" },
    vendorsTable: { _t: "vendors", ownerId: "owner_id" },
  };
});

// ─── Clerk mock ───────────────────────────────────────────────────────────────

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: "user-test-save-retrieve" })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((_req: any, _res: unknown, next: () => void) => {
    (_req as any).log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  const { default: pmRouter } = await import("../routes/paymentMethods");
  app.use("/api", pmRouter);
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Saved payment methods", () => {
  let app: Express;

  beforeEach(async () => {
    store.reset();
    vi.resetModules();
    app = await buildApp();
  });

  // ── UPI ──────────────────────────────────────────────────────────────────

  it("a newly saved UPI ID appears in the Saved Methods list immediately after saving", async () => {
    // Save a new UPI
    const postRes = await request(app)
      .post("/api/payment-methods")
      .send({ type: "upi", upiId: "shopper@okaxis" });

    expect(postRes.status).toBe(201);
    expect(postRes.body.paymentMethod).toMatchObject({
      type: "upi",
      upiId: "shopper@okaxis",
    });

    const savedId: string = postRes.body.paymentMethod.id;

    // Retrieve the list
    const getRes = await request(app)
      .get("/api/payment-methods");

    expect(getRes.status).toBe(200);
    const methods: any[] = getRes.body.paymentMethods;
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({
      id: savedId,
      type: "upi",
      upiId: "shopper@okaxis",
    });
  });

  it("the saved UPI ID becomes the default because it is the first method saved", async () => {
    await request(app)
      .post("/api/payment-methods")
      .send({ type: "upi", upiId: "first@upi" });

    const getRes = await request(app).get("/api/payment-methods");
    expect(getRes.status).toBe(200);

    const [method] = getRes.body.paymentMethods as any[];
    expect(method.isDefault).toBe(true);
  });

  it("normalises the UPI ID to lowercase before storing and returning it", async () => {
    await request(app)
      .post("/api/payment-methods")
      .send({ type: "upi", upiId: "Shopper@OkAxis" });

    const getRes = await request(app).get("/api/payment-methods");
    expect(getRes.status).toBe(200);

    const [method] = getRes.body.paymentMethods as any[];
    expect(method.upiId).toBe("shopper@okaxis");
  });

  it("removes a saved UPI from the Saved Methods list after the shopper deletes it", async () => {
    const postRes = await request(app)
      .post("/api/payment-methods")
      .send({ type: "upi", upiId: "remove-me@okaxis" });

    expect(postRes.status).toBe(201);
    const savedId: string = postRes.body.paymentMethod.id;

    const deleteRes = await request(app).delete(`/api/payment-methods/${savedId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ success: true });

    const getRes = await request(app).get("/api/payment-methods");
    expect(getRes.status).toBe(200);
    expect(getRes.body.paymentMethods).toEqual([]);
  });

  it("returns 404 for a payment-method ID that is not present for the shopper", async () => {
    const deleteRes = await request(app).delete("/api/payment-methods/pm-missing");

    expect(deleteRes.status).toBe(404);
    expect(deleteRes.body).toEqual({ error: "Payment method not found" });
  });

  it("returns 404 for another shopper's saved method and leaves it intact", async () => {
    store.rows.push({
      id: "pm-owned-by-another-shopper",
      userId: "user-other-shopper",
      type: "upi",
      upiId: "other@okaxis",
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const deleteRes = await request(app).delete(
      "/api/payment-methods/pm-owned-by-another-shopper"
    );

    expect(deleteRes.status).toBe(404);
    expect(deleteRes.body).toEqual({ error: "Payment method not found" });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      id: "pm-owned-by-another-shopper",
      userId: "user-other-shopper",
    });
  });

  // ── Card ─────────────────────────────────────────────────────────────────

  it("a newly saved credit card appears in the Saved Methods list immediately after saving", async () => {
    // Visa test card: 4111 1111 1111 1111, expires 12/2027, CVV 123
    const postRes = await request(app)
      .post("/api/payment-methods")
      .send({
        type: "card",
        cardNumber: "4111111111111111",
        cardholderName: "Priya Sharma",
        expiryMonth: 12,
        expiryYear: 2027,
        cvv: "123",
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body.paymentMethod).toMatchObject({
      type: "card",
      cardBrand: "Visa",
      last4: "1111",
      cardholderName: "Priya Sharma",
      expiryMonth: 12,
      expiryYear: 2027,
    });

    const savedId: string = postRes.body.paymentMethod.id;

    // Retrieve the list
    const getRes = await request(app).get("/api/payment-methods");

    expect(getRes.status).toBe(200);
    const methods: any[] = getRes.body.paymentMethods;
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({
      id: savedId,
      type: "card",
      last4: "1111",
      cardBrand: "Visa",
    });
  });

  it("saved card's CVV is NOT returned in the list (security: CVV must never be stored)", async () => {
    await request(app)
      .post("/api/payment-methods")
      .send({
        type: "card",
        cardNumber: "4111111111111111",
        cardholderName: "Priya Sharma",
        expiryMonth: 12,
        expiryYear: 2027,
        cvv: "123",
      });

    const getRes = await request(app).get("/api/payment-methods");
    const [method] = getRes.body.paymentMethods as any[];

    // The CVV must not appear anywhere in the returned object
    expect(JSON.stringify(method)).not.toContain("123");
    expect(method).not.toHaveProperty("cvv");
  });

  it("the saved card becomes the default because it is the first method saved", async () => {
    await request(app)
      .post("/api/payment-methods")
      .send({
        type: "card",
        cardNumber: "4111111111111111",
        cardholderName: "Priya Sharma",
        expiryMonth: 12,
        expiryYear: 2027,
        cvv: "123",
      });

    const getRes = await request(app).get("/api/payment-methods");
    const [method] = getRes.body.paymentMethods as any[];
    expect(method.isDefault).toBe(true);
  });

  // ── Both ─────────────────────────────────────────────────────────────────

  it("both a saved UPI and a saved card appear in the list after saving each", async () => {
    await request(app)
      .post("/api/payment-methods")
      .send({ type: "upi", upiId: "shopper@okaxis" });

    await request(app)
      .post("/api/payment-methods")
      .send({
        type: "card",
        cardNumber: "4111111111111111",
        cardholderName: "Priya Sharma",
        expiryMonth: 12,
        expiryYear: 2027,
        cvv: "123",
      });

    const getRes = await request(app).get("/api/payment-methods");
    expect(getRes.status).toBe(200);

    const methods: any[] = getRes.body.paymentMethods;
    expect(methods).toHaveLength(2);

    const types = methods.map((m) => m.type).sort();
    expect(types).toEqual(["card", "upi"]);
  });
});
