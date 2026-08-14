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
  /**
   * Builds a query chain that resolves to `rows` and supports the subset of
   * Drizzle chaining the paymentMethods route actually uses:
   *   .from().where().limit()
   *   .from().where().orderBy()
   */
  function makeSelectChain(rows: Record<string, unknown>[]) {
    const withOrderBy = Object.assign(Promise.resolve(rows), {
      // for completeness (not called on GET but included for safety)
    });
    const withLimit = () => Promise.resolve(rows.slice(0, 1));
    const withWhere = () => ({
      limit: withLimit,
      orderBy: (_a: unknown, _b: unknown) => Promise.resolve(rows),
    });
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
  function makeTx(userId: string) {
    let selectCallCount = 0;
    return {
      select: vi.fn((_spec?: unknown) => {
        const callIdx = selectCallCount++;
        // select #0 is the duplicate-check → no duplicate
        // select #1 is the existing-count  → real user rows
        const rows = callIdx === 0 ? [] : store.forUser(userId);
        return makeSelectChain(rows);
      }),
      update: vi.fn(() => ({
        set: vi.fn((_vals: Record<string, unknown>) => ({
          where: vi.fn((_cond: unknown) => {
            // Clear isDefault for all rows belonging to this user
            store.forUser(userId).forEach((r) => {
              r.isDefault = false;
            });
            return Promise.resolve();
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((vals: Record<string, unknown>) => {
          const newRow = {
            id: store.nextId(),
            userId,
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
    };
  }

  const db: any = {
    /**
     * GET route: db.select().from(spm).where(userId).orderBy(isDefault DESC, createdAt ASC)
     * We return the user's rows ordered: defaults first, then by insertion order (id counter).
     */
    select: vi.fn((_spec?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          orderBy: (_a: unknown, _b: unknown) => {
            // Sort: isDefault=true first, then by store insertion order (id)
            const rows = [...store.rows].sort((a, b) => {
              if (a.isDefault === b.isDefault) {
                return String(a.id).localeCompare(String(b.id));
              }
              return a.isDefault ? -1 : 1;
            });
            return Promise.resolve(rows);
          },
        }),
      }),
    })),

    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      // We don't have the userId here directly; we rely on the tx mock closures
      // being passed the correct data from the route. Instead, we extract userId
      // from the store operations performed during the callback.
      //
      // Trick: patch the insert to capture userId from vals, then build the tx.
      let capturedUserId = "unknown";
      const tempTx: any = {
        select: vi.fn((_spec?: unknown) => {
          return makeSelectChain([]);
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve()),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn((vals: Record<string, unknown>) => {
            capturedUserId = String(vals.userId ?? "unknown");
            return Object.assign(Promise.resolve(undefined), {
              returning: vi.fn(() => Promise.resolve([])),
            });
          }),
        })),
      };

      // First pass: discover userId
      // We can't easily run twice, so instead build the real tx from the start
      // using a userId-aware tx factory. We reset and use a proper tx below.

      // Build a proper stateful tx scoped to the user id exposed by req.userId.
      // Since the route attaches req.userId before calling db.transaction, we
      // pass a sentinel value and fix it up after. Instead, we use a lazy proxy.
      let resolved = false;
      let realTx: ReturnType<typeof makeTx> | null = null;

      const lazyTx: any = new Proxy({} as any, {
        get(_target, prop) {
          if (!resolved) {
            // On first access: run a dry insert to get userId, then rebuild tx
            return (...args: unknown[]) => {
              // Return a stub that captures userId via insert.values
              if (prop === "insert") {
                return {
                  values: (vals: Record<string, unknown>) => {
                    if (!resolved) {
                      capturedUserId = String(vals.userId ?? "unknown");
                      resolved = true;
                      realTx = makeTx(capturedUserId);
                    }
                    return realTx!.insert().values(vals);
                  },
                };
              }
              if (prop === "select") {
                return (_spec?: unknown) => makeSelectChain([]);
              }
              if (prop === "update") {
                return () => ({
                  set: () => ({
                    where: () => Promise.resolve(),
                  }),
                });
              }
            };
          }
          return (realTx as any)[prop];
        },
      });

      // Actually — the proxy approach is fragile. Use a cleaner strategy:
      // intercept the whole callback differently.
      // We know the route calls tx operations in order:
      //   1. tx.select (dup check) — result doesn't matter for save flow
      //   2. tx.select (existing)  — result doesn't matter for save flow
      //   3. tx.update (clear defaults) — side-effect
      //   4. tx.insert.values.returning — creates the row
      //
      // Build a real tx from the start with a "lazy userId" that gets filled
      // in by the insert call.

      let txSelectCall = 0;
      const finalTx: any = {
        select: vi.fn((_spec?: unknown) => {
          const idx = txSelectCall++;
          // Return [] for dup-check and existing-count so route treats this
          // as: no duplicate, no existing methods → first method → makeDefault = true
          const rows = idx === 0 ? [] : store.rows.filter((r) => r.userId === capturedUserId);
          return makeSelectChain(rows);
        }),
        update: vi.fn(() => ({
          set: vi.fn((_vals: Record<string, unknown>) => ({
            where: vi.fn((_cond: unknown) => {
              // Clear isDefault for the user — userId is known by now because
              // update is called AFTER at least one select resolved
              store
                .rows
                .filter((r) => r.userId === capturedUserId)
                .forEach((r) => { r.isDefault = false; });
              return Promise.resolve();
            }),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn((vals: Record<string, unknown>) => {
            // Capture userId on insert so update.where above can use it too
            capturedUserId = String(vals.userId ?? capturedUserId);
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
      };

      return cb(finalTx);
    }),
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

describe("POST /api/payment-methods → GET /api/payment-methods (save-and-retrieve)", () => {
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
