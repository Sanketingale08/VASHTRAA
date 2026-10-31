/**
 * GET /admin/orders/export.pdf — filter-combination integration tests
 *
 * Covers:
 *  (a) All-orders PDF          — no filters, all seeded orders appear
 *  (b) Status-filtered PDF     — ?status=delivered, only matching orders appear
 *  (c) Search-filtered PDF     — ?search=<term>, only matching orders appear
 *  (d) Combined status+search  — only orders matching BOTH filters appear
 *  (e) Byte-count scaling      — more matching orders → larger PDF
 *  (f) Empty-state             — no matching orders → valid PDF (not 500)
 *
 * The CSV export coverage below uses the same fixtures and database mock so its
 * status/search behavior can be checked against the PDF export's contract.
 *
 * Content verification strategy
 * ─────────────────────────────
 * pdfkit with built-in fonts stores text as WinAnsiEncoding hex-strings
 * in the PDF stream (<48656c6c6f> style).  extractPdfText() decodes every
 * hex-string found in the raw buffer, letting us assert which names appear
 * and which are absent — without needing a full PDF parser.
 *
 * DB mock status filtering
 * ────────────────────────
 * The route passes `eq(ordersTable.status, status)` wrapped in `and()` to
 * drizzle's .where().  extractStatusFromCondition() walks the drizzle SQL
 * object's queryChunks to pull out the literal status string so the mock
 * can filter state.orders correctly.
 *
 * All I/O (DB, fonts, auth, side-effect libs) is mocked — no DB or
 * filesystem access required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { eq as drizzleEq, and as drizzleAnd, desc as drizzleDesc, inArray as drizzleInArray, sql as drizzleSql, gte as drizzleGte } from "drizzle-orm";

// ─── Mutable test state ───────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  orders: [] as any[],
}));

// ─── Drizzle condition parser — extracts literal status string ─────────────────
//
// drizzle's eq(col, value) produces:
//   queryChunks: [empty, col, { value: [" = "] }, "delivered", empty]
// and() wraps that SQL node as its first queryChunk.
// We walk the tree recursively to find the string that follows " = ".

function extractStatusFromCondition(cond: unknown): string | null {
  if (!cond) return null;
  if (Array.isArray(cond)) {
    for (const item of cond) {
      const s = extractStatusFromCondition(item);
      if (s) return s;
    }
  }
  if (typeof cond === "object") {
    if ((cond as any).status && typeof (cond as any).status === "string") {
      return (cond as any).status;
    }
    const chunks = (cond as any).queryChunks;
    if (Array.isArray(chunks)) {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        if (
          c &&
          typeof c === "object" &&
          Array.isArray((c as any).value) &&
          (c as any).value[0] === " = "
        ) {
          const next = chunks[i + 1];
          if (typeof next === "string") return next;
        }
        if (c && typeof c === "object") {
          const nested = extractStatusFromCondition(c);
          if (nested) return nested;
        }
      }
    }
  }
  return null;
}

// ─── PDF text extractor ────────────────────────────────────────────────────────
//
// pdfkit stores text as hex strings ("<48656c6c6f>") inside TJ operators.
// Decoding every hex string in the raw buffer and concatenating gives us
// all the visible text content, allowing string-presence assertions.

function extractPdfText(buf: Buffer): string {
  const content = buf.toString("latin1");
  const hexPattern = /<([0-9a-fA-F]+)>/g;
  let text = "";
  let m: RegExpExecArray | null;
  while ((m = hexPattern.exec(content)) !== null) {
    text += Buffer.from(m[1], "hex").toString("latin1");
  }
  return text;
}

// ─── DB mock ──────────────────────────────────────────────────────────────────
//
// Each select() call returns a fresh chain so statusFilter is per-query.

vi.mock("@workspace/db", () => {
  function makeChain(): any {
    let statusFilter: string | null = null;

    const obj: any = {
      from:    vi.fn(() => obj),
      where:   vi.fn((cond: unknown) => {
        if (cond !== undefined) {
          statusFilter = extractStatusFromCondition(cond);
        }
        return obj;
      }),
      orderBy: vi.fn(() => obj),
      limit:   vi.fn(() => obj),
      offset:  vi.fn(() => obj),
      for:     vi.fn(() => obj),
      then: (resolve: any, reject: any) => {
        const rows = statusFilter
          ? state.orders.filter((o) => o.status === statusFilter)
          : [...state.orders];
        return Promise.resolve(rows).then(resolve, reject);
      },
      catch: (fn: any) => {
        const rows = statusFilter
          ? state.orders.filter((o) => o.status === statusFilter)
          : [...state.orders];
        return Promise.resolve(rows).catch(fn);
      },
    };
    return obj;
  }

  const dbMock: any = {
    select:      vi.fn(() => makeChain()),
    insert:      vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
    update:      vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
    execute:     vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb({})),
  };

  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: dbMock,
    ordersTable: tag("orders", [
      "id", "displayId", "userId", "status", "total", "paymentMethod",
      "address", "items", "createdAt", "statusHistory",
    ]),
    usersTable:                  tag("users",                  ["id", "email"]),
    productsTable:               tag("products",               ["id", "vendorId", "stock"]),
    couponsTable:                tag("coupons",                ["id", "code"]),
    couponRedemptionsTable:      tag("couponRedemptions",      ["id", "couponId", "orderId"]),
    notificationsTable:          tag("notifications",          ["id", "userId"]),
    notificationPreferencesTable:tag("notificationPreferences",["id", "userId"]),
    vendorsTable:                tag("vendors",                ["id", "ownerId"]),
    userProfilesTable:           tag("userProfiles",           ["id", "userId"]),
    savedPaymentMethodsTable:    tag("savedPaymentMethods",    ["id", "userId"]),
    siteSettingsTable:           tag("siteSettings",           ["key", "value"]),
    adminLoginSessionsTable:     tag("adminLoginSessions",     ["token", "twoFactorVerified"]),
    desc:    drizzleDesc,
    eq:      (a: any, b: any) => ({ [a]: b, status: String(b) }),
    and:     (...args: any[]) => args,
    inArray: drizzleInArray,
    sql:     drizzleSql,
    gte:     drizzleGte,
    mongoOrders: {
      findMany: vi.fn(async () => { throw new Error("mongo unavailable in test mock"); }),
      findById: vi.fn(async () => null),
    },
  };
});

// ─── Admin auth — bypass requireAdminKey entirely ─────────────────────────────

vi.mock("../middlewares/isAdmin", () => ({
  isAdmin:             (_req: any, _res: any, next: () => void) => next(),
  requireAdminKey:     (_req: any, _res: any, next: () => void) => next(),
  sha256hex:           (s: string) => s,
  clearAdminKeyCache:  vi.fn(),
  clearAdmin2faCache:  vi.fn(),
}));

// ─── PDF fonts — use built-in Helvetica so font files aren't needed ───────────
//
// registerFonts() calls doc.registerFont() pointing at .ttf files that don't
// exist in the test environment.  Swapping in built-in fonts keeps pdfkit
// happy and produces a real, parseable PDF without touching the filesystem.
// We also need compress: false so text hex-strings are searchable in the buffer.

vi.mock("../lib/pdfFonts.js", () => ({
  FONT_REGULAR: "Helvetica",
  FONT_BOLD:    "Helvetica-Bold",
  registerFonts: vi.fn(),  // no-op; built-in fonts need no registration
}));

// pdfkit is NOT mocked — we use the real library but override the compress
// option so text appears as readable hex-strings in the output buffer.
vi.mock("pdfkit", async () => {
  const { default: RealPDFDocument } = await vi.importActual<any>("pdfkit");
  return {
    default: class TestPDFDocument extends RealPDFDocument {
      constructor(opts: any = {}) {
        super({ ...opts, compress: false });
      }
    },
  };
});

// ─── Side-effect lib mocks ────────────────────────────────────────────────────

vi.mock("../lib/transactionalEmail", () => ({
  sendTransactionalEmail: vi.fn(async () => {}),
}));
vi.mock("../lib/stockHistory", () => ({
  recordStockChange: vi.fn(async () => {}),
}));
vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn(async () => {}),
}));
vi.mock("../lib/orderNotifications", () => ({
  insertOrderStatusNotification: vi.fn(async () => {}),
}));
vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn(async () => {}),
  insertSellerNotificationForVendors: vi.fn(async () => {}),
}));
vi.mock("../lib/commission", () => ({
  loadActiveCommissionRules: vi.fn(async () => []),
  effectiveRateFromRules:    vi.fn(() => 0.10),
}));
vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(async () => {}),
  getIp:         vi.fn(() => "127.0.0.1"),
}));
vi.mock("../middlewares/isAuthenticated", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../middlewares/isCustomer", () => ({
  isCustomer: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("@clerk/express", () => ({
  getAuth:         vi.fn(() => ({ userId: "test-user" })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireAuth:     vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("@workspace/api-zod", () => ({
  isValidPaymentMethod: vi.fn(() => true),
}));

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: unknown, next: () => void) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    next();
  });
  const { default: ordersRouter } = await import("../routes/orders");
  app.use("/api", ordersRouter);
  return app;
}

// ─── Order factory ────────────────────────────────────────────────────────────

let _idCounter = 1;
function makeOrder(overrides: Record<string, unknown> = {}) {
  const id = `order-${_idCounter++}`;
  return {
    id,
    displayId: `TD${_idCounter}`,
    userId: "user-1",
    status: "pending",
    total: 50000,
    paymentMethod: "upi",
    address: { name: "Generic Customer", line1: "123 Main St", city: "Mumbai" },
    items: [{ name: "Silk Saree", quantity: 1, price: 50000 }],
    createdAt: new Date().toISOString(),
    statusHistory: [],
    ...overrides,
  };
}

// ─── Request helper ───────────────────────────────────────────────────────────

async function getPdf(
  app: Express,
  query: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const req = request(app)
    .get("/api/admin/orders/export.pdf")
    .buffer(true)
    .parse((res: any, callback: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });

  for (const [k, v] of Object.entries(query)) {
    req.query({ [k]: v });
  }

  return req as any;
}

async function getCsv(
  app: Express,
  query: Record<string, string> = {},
): Promise<any> {
  return request(app)
    .get("/api/admin/orders/export.csv")
    .query(query);
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.slice(0, 4).toString("ascii") === "%PDF";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /admin/orders/export.pdf — filter combinations", () => {
  let app: Express;

  beforeEach(async () => {
    _idCounter = 1;
    state.orders = [];
    vi.clearAllMocks();
    app = await buildApp();
  });

  // ── (a) All-orders PDF ────────────────────────────────────────────────────

  it("(a) returns HTTP 200 with application/pdf for all orders (no filters)", async () => {
    state.orders = [
      makeOrder({ status: "pending",   address: { name: "Arjun Kumar"  } }),
      makeOrder({ status: "delivered", address: { name: "Meera Pillai" } }),
      makeOrder({ status: "shipped",   address: { name: "Ravi Nair"    } }),
    ];

    const res = await getPdf(app);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(isPdfBuffer(res.body)).toBe(true);

    // All three customers must appear in the PDF
    const text = extractPdfText(res.body);
    expect(text).toContain("Arjun Kumar");
    expect(text).toContain("Meera Pillai");
    expect(text).toContain("Ravi Nair");
  });

  it("(a) filename contains 'all' when no status filter is provided", async () => {
    state.orders = [];

    const res = await getPdf(app);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/orders-all-/);
  });

  // ── (b) Status-filtered PDF ───────────────────────────────────────────────

  it("(b) returns HTTP 200 with application/pdf for status=delivered", async () => {
    // Seed both delivered and pending — mock must return only delivered
    state.orders = [
      makeOrder({ status: "delivered", address: { name: "Lakshmi Iyer" } }),
      makeOrder({ status: "delivered", address: { name: "Kiran Reddy"  } }),
      makeOrder({ status: "pending",   address: { name: "Suresh Babu"  } }),
    ];

    const res = await getPdf(app, { status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(isPdfBuffer(res.body)).toBe(true);

    // Only delivered customers must appear; the pending one must be absent
    const text = extractPdfText(res.body);
    expect(text).toContain("Lakshmi Iyer");
    expect(text).toContain("Kiran Reddy");
    expect(text).not.toContain("Suresh Babu");
  });

  it("(b) filename includes the status label when a status filter is applied", async () => {
    state.orders = [makeOrder({ status: "shipped" })];

    const res = await getPdf(app, { status: "shipped" });

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/orders-shipped-/);
  });

  it("(b) status filter for a status with no matching orders returns a valid PDF", async () => {
    // DB has only pending orders; asking for delivered yields nothing from the mock
    state.orders = [
      makeOrder({ status: "pending", address: { name: "Nobody Match" } }),
    ];

    const res = await getPdf(app, { status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(isPdfBuffer(res.body)).toBe(true);
    // The pending customer must NOT appear in the status=delivered export
    const text = extractPdfText(res.body);
    expect(text).not.toContain("Nobody Match");
  });

  // ── (c) Search-filtered PDF ───────────────────────────────────────────────

  it("(c) includes only orders matching a customer-name search", async () => {
    // Both orders come back from the DB; JS search filter decides who stays
    state.orders = [
      makeOrder({ address: { name: "Priya Sharma" } }),
      makeOrder({ address: { name: "Deepak Joshi" } }),
    ];

    const res = await getPdf(app, { search: "priya" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);

    const text = extractPdfText(res.body);
    expect(text).toContain("Priya Sharma");
    expect(text).not.toContain("Deepak Joshi");
  });

  it("(c) includes only orders matching an item-name search", async () => {
    state.orders = [
      makeOrder({ items: [{ name: "Kanjivaram Silk", quantity: 1, price: 75000 }] }),
      makeOrder({ items: [{ name: "Cotton Saree",    quantity: 1, price: 20000 }] }),
    ];

    const res = await getPdf(app, { search: "kanjivaram" });

    expect(res.status).toBe(200);

    const text = extractPdfText(res.body);
    expect(text).toContain("Kanjivaram Silk");
    expect(text).not.toContain("Cotton Saree");
  });

  // ── (d) Combined status + search PDF ─────────────────────────────────────
  //
  // Each individual filter alone would admit extra rows; only the intersection
  // should appear.  Status filter is applied by the mock (DB-side); search is
  // applied in JS inside the route.

  it("(d) combined filters: only orders matching BOTH status AND search appear", async () => {
    state.orders = [
      // ✓ matches delivered AND "anita"
      makeOrder({ status: "delivered", address: { name: "Anita Singh"  } }),
      // ✗ right status, wrong name
      makeOrder({ status: "delivered", address: { name: "Vijay Menon"  } }),
      // ✗ right name but wrong status — mock excludes via status filter
      makeOrder({ status: "pending",   address: { name: "Anita Bose"   } }),
      // ✗ neither matches
      makeOrder({ status: "pending",   address: { name: "Rohit Sharma" } }),
    ];

    const res = await getPdf(app, { status: "delivered", search: "anita" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);

    const text = extractPdfText(res.body);
    // Only "Anita Singh" (delivered + matches search) must appear
    expect(text).toContain("Anita Singh");
    // Excluded by search (wrong name, delivered)
    expect(text).not.toContain("Vijay Menon");
    // Excluded by status filter (pending, even though "Anita" matches search)
    expect(text).not.toContain("Anita Bose");
    // Excluded by both filters
    expect(text).not.toContain("Rohit Sharma");
  });

  it("(d) combined filter filename includes the status label", async () => {
    state.orders = [
      makeOrder({ status: "cancelled", address: { name: "Test User" } }),
    ];

    const res = await getPdf(app, { status: "cancelled", search: "test" });

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/orders-cancelled-/);
  });

  // ── (e) Byte-count scaling ────────────────────────────────────────────────

  it("(e) PDF with more matching orders is larger than PDF with fewer", async () => {
    state.orders = [makeOrder()];
    const resSingle = await getPdf(app);

    state.orders = Array.from({ length: 15 }, () => makeOrder());
    const resMany = await getPdf(app);

    expect(resSingle.status).toBe(200);
    expect(resMany.status).toBe(200);
    expect(resMany.body.length).toBeGreaterThan(resSingle.body.length);
  });

  it("(e) exports 501 orders as a complete multi-page PDF", async () => {
    state.orders = Array.from({ length: 501 }, (_, index) =>
      makeOrder({
        address: { name: `Export Customer ${index + 1}` },
      }),
    );

    const res = await getPdf(app);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/orders-all-\d{4}-\d{2}-\d{2}\.pdf/);
    expect(isPdfBuffer(res.body)).toBe(true);
    expect(res.body.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);

    // The final row proves the full unpaginated list was rendered, and multiple
    // page objects prove the page-break loop completed.
    expect(extractPdfText(res.body)).toContain("Export Customer 501");
    const pageCount = (res.body.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  // ── (f) Empty-state ───────────────────────────────────────────────────────

  it("(f) no-filter empty state: returns a valid PDF (not an error)", async () => {
    state.orders = [];

    const res = await getPdf(app);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(isPdfBuffer(res.body)).toBe(true);
    // PDF is non-trivial even with zero orders (has header, footer, etc.)
    expect(res.body.length).toBeGreaterThan(200);
  });

  it("(f) search empty state: valid PDF returned when no orders match the query", async () => {
    state.orders = [
      makeOrder({ address: { name: "Real Customer" } }),
    ];

    const res = await getPdf(app, { search: "zzz-no-match-xyz" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(isPdfBuffer(res.body)).toBe(true);

    const text = extractPdfText(res.body);
    expect(text).not.toContain("Real Customer");
  });

  it("(f) status empty state: valid PDF when status filter matches zero orders", async () => {
    // DB mock returns only pending; status=delivered yields nothing
    state.orders = [
      makeOrder({ status: "pending", address: { name: "Pending Only" } }),
    ];

    const res = await getPdf(app, { status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(isPdfBuffer(res.body)).toBe(true);

    const text = extractPdfText(res.body);
    expect(text).not.toContain("Pending Only");
  });
});

describe("GET /admin/orders/export.csv — filter combinations", () => {
  let app: Express;

  beforeEach(async () => {
    _idCounter = 1;
    state.orders = [];
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns all order rows with a text/csv response when no filters are provided", async () => {
    state.orders = [
      makeOrder({
        id: "order-arjun",
        address: { name: "Arjun Kumar" },
      }),
      makeOrder({
        id: "order-meera",
        address: { name: "Meera Pillai" },
      }),
      makeOrder({
        id: "order-ravi",
        address: { name: "Ravi Nair" },
      }),
    ];

    const res = await getCsv(app);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.text).toContain('"order-arjun","Arjun Kumar"');
    expect(res.text).toContain('"order-meera","Meera Pillai"');
    expect(res.text).toContain('"order-ravi","Ravi Nair"');
  });

  it("includes only rows matching the status filter", async () => {
    state.orders = [
      makeOrder({
        id: "delivered-1",
        status: "delivered",
        address: { name: "Lakshmi Iyer" },
      }),
      makeOrder({
        id: "delivered-2",
        status: "delivered",
        address: { name: "Kiran Reddy" },
      }),
      makeOrder({
        id: "pending-1",
        status: "pending",
        address: { name: "Suresh Babu" },
      }),
    ];

    const res = await getCsv(app, { status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.text).toContain('"delivered-1","Lakshmi Iyer"');
    expect(res.text).toContain('"delivered-2","Kiran Reddy"');
    expect(res.text).not.toContain("pending-1");
    expect(res.text).not.toContain("Suresh Babu");
  });

  it("includes only rows matching the search filter", async () => {
    state.orders = [
      makeOrder({
        id: "priya-order",
        address: { name: "Priya Sharma" },
        items: [{ name: "Kanjivaram Silk", quantity: 1, price: 75000 }],
      }),
      makeOrder({
        id: "deepak-order",
        address: { name: "Deepak Joshi" },
        items: [{ name: "Cotton Saree", quantity: 1, price: 20000 }],
      }),
    ];

    const res = await getCsv(app, { search: "kanjivaram" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.text).toContain('"priya-order","Priya Sharma"');
    expect(res.text).toContain('"Kanjivaram Silk x1"');
    expect(res.text).not.toContain("deepak-order");
    expect(res.text).not.toContain("Cotton Saree");
  });

  it("includes only rows matching both status and search filters", async () => {
    state.orders = [
      makeOrder({
        id: "anita-delivered",
        status: "delivered",
        address: { name: "Anita Singh" },
      }),
      makeOrder({
        id: "vijay-delivered",
        status: "delivered",
        address: { name: "Vijay Menon" },
      }),
      makeOrder({
        id: "anita-pending",
        status: "pending",
        address: { name: "Anita Bose" },
      }),
      makeOrder({
        id: "rohit-pending",
        status: "pending",
        address: { name: "Rohit Sharma" },
      }),
    ];

    const res = await getCsv(app, { status: "delivered", search: "anita" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.text).toContain('"anita-delivered","Anita Singh"');
    expect(res.text).not.toContain("vijay-delivered");
    expect(res.text).not.toContain("anita-pending");
    expect(res.text).not.toContain("rohit-pending");
  });

  it("returns a header-only CSV with the expected content type when no rows match", async () => {
    state.orders = [
      makeOrder({
        id: "pending-only",
        status: "pending",
        address: { name: "Pending Only" },
      }),
    ];

    const res = await getCsv(app, { status: "delivered", search: "no-match" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.text).toBe(
      '"Order ID","Customer Name","Items","Total (INR)","Status","Payment Method","Created Date"',
    );
    expect(res.text).not.toContain("pending-only");
    expect(res.text).not.toContain("Pending Only");
  });
});
