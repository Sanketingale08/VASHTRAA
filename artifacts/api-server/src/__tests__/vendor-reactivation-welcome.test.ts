/**
 * vendor-reactivation-welcome.test.ts
 *
 * Verifies the one-time "Welcome Back!" popup logic end-to-end at the API layer:
 *
 *  1. POST /api/admin/vendors/:id/activate with a suspended vendor sets
 *     reactivation_welcome_pending = true on the update payload.
 *  2. POST /api/admin/vendors/:id/activate with an already-approved vendor does
 *     NOT touch reactivation_welcome_pending (no flag set).
 *  3. POST /api/seller/reactivation-welcome/dismiss clears the flag and returns
 *     { ok: true }.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ---------------------------------------------------------------------------
// Shared hoisted state
// ---------------------------------------------------------------------------

const ADMIN_KEY = "test-admin-key";
const VENDOR_ID = "vendor-uuid-42";
const OWNER_ID  = "owner-user-42";

/** Tracks what was last passed to db.update(...).set(...) */
const captured = vi.hoisted(() => ({ setArgs: null as any }));

const state = vi.hoisted(() => ({
  vendor: null as null | {
    id: string;
    name: string;
    status: string;
    ownerId: string | null;
    contactEmail: string | null;
    reactivationWelcomePending: boolean;
  },
}));

// ---------------------------------------------------------------------------
// @workspace/db mock
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  /** select chain: supports .from().where().limit() */
  const makeSelectChain = () => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() =>
          Promise.resolve(state.vendor ? [{ ...state.vendor }] : [])
        ),
      })),
    })),
  });

  /**
   * update chain: supports both
   *   .set().where().returning()   — activate endpoint
   *   await .set().where()         — dismiss endpoint (no returning)
   */
  const makeUpdateChain = () => ({
    set: vi.fn((vals: any) => {
      captured.setArgs = { ...vals };
      const whereResult: any = {
        // .returning() — returns the updated vendor with set values applied
        returning: vi.fn(() => {
          if (!state.vendor) return Promise.resolve([]);
          return Promise.resolve([{ ...state.vendor, ...vals }]);
        }),
      };
      // Make the where result itself awaitable (for dismiss which awaits without .returning())
      whereResult.then = (resolve: any, reject: any) =>
        Promise.resolve(undefined).then(resolve, reject);
      whereResult.catch = (reject: any) =>
        Promise.resolve(undefined).catch(reject);
      whereResult.finally = (fn: any) =>
        Promise.resolve(undefined).finally(fn);

      return { where: vi.fn(() => whereResult) };
    }),
  });

  const dbMock: any = {
    select:  vi.fn(() => makeSelectChain()),
    update:  vi.fn(() => makeUpdateChain()),
    insert:  vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })) })),
    execute: vi.fn(() => Promise.resolve({ rows: [{ nextval: "1" }] })),
  };

  return {
    db: dbMock,
    vendorsTable: tag("vendors", [
      "id", "name", "status", "ownerId", "contactEmail",
      "reactivationWelcomePending", "vendorId",
    ]),
    productsTable:              tag("products",     ["id", "vendorId"]),
    ordersTable:                tag("orders",       ["id", "status", "items", "total", "userId", "createdAt", "refundStatus"]),
    adminNotificationsTable:    tag("adminNotifs",  ["id"]),
    sellerNotificationsTable:   tag("sellerNotifs", ["id"]),
    auditLogsTable:             tag("auditLogs",    ["id"]),
    vendorSettlementsTable:     tag("settlements",  ["id", "vendorId"]),
    stockHistoryTable:          tag("stockHistory", ["id", "productId"]),
    mongoSellers: {
      findById: vi.fn(() => Promise.resolve(state.vendor)),
      findBySellerId: vi.fn(() => Promise.resolve(state.vendor)),
      findByVendorId: vi.fn(() => Promise.resolve(state.vendor)),
      findByOwnerId: vi.fn(() => Promise.resolve(state.vendor)),
      update: vi.fn((id: string, vals: any) => {
        if (state.vendor) {
          state.vendor = { ...state.vendor, ...vals };
        }
        return Promise.resolve(state.vendor);
      }),
    },
    mongoVendors: {
      findById: vi.fn(() => Promise.resolve(state.vendor)),
      findBySellerId: vi.fn(() => Promise.resolve(state.vendor)),
      findByVendorId: vi.fn(() => Promise.resolve(state.vendor)),
      findByOwnerId: vi.fn(() => Promise.resolve(state.vendor)),
      update: vi.fn((id: string, vals: any) => {
        if (state.vendor) {
          state.vendor = { ...state.vendor, ...vals };
        }
        return Promise.resolve(state.vendor);
      }),
    },
    CATEGORIES:    ["silk", "cotton"],
    FABRICS:       [],
    OCCASIONS:     [],
    COLORS:        [],
    CATEGORY_PREFIX: {},
  };
});

// ---------------------------------------------------------------------------
// Clerk mock
// ---------------------------------------------------------------------------

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  clerkClient: { users: { getUser: vi.fn() } },
}));

// ---------------------------------------------------------------------------
// isSeller middleware mock (injects vendor from state into req)
// ---------------------------------------------------------------------------

vi.mock("../middlewares/isSeller", () => ({
  isSeller: vi.fn((req: any, _res: any, next: any) => {
    if (!state.vendor) {
      return _res.status(403).json({ error: "No vendor account found for this user" });
    }
    req.vendor   = state.vendor;
    req.vendorId = state.vendor.id;
    req.userId   = OWNER_ID;
    next();
  }),
}));

// ---------------------------------------------------------------------------
// Stub fire-and-forget helpers so they don't throw
// ---------------------------------------------------------------------------

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorApprovalEmailForVendor:   vi.fn().mockResolvedValue(undefined),
  sendVendorSuspensionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmailForVendor:  vi.fn().mockResolvedValue(undefined),
  sendVendorReactivationEmailForVendor: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    trySetObjectEntityAclPolicy() { return Promise.resolve(); }
  },
}));
vi.mock("../lib/stockHistory", () => ({
  recordStockChange: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/orderNotifications", () => ({
  insertOrderStatusNotification: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// App builders (lazy imports so vi.mock hoisting applies before import)
// ---------------------------------------------------------------------------

async function buildVendorsApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _r: any, next: any) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  const { default: vendorsRouter } = await import("../routes/vendors");
  app.use("/api", vendorsRouter);
  return app;
}

async function buildSellerApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _r: any, next: any) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  const { default: sellerRouter } = await import("../routes/seller");
  app.use("/api", sellerRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests — activate endpoint
// ---------------------------------------------------------------------------

describe("POST /api/admin/vendors/:id/activate — reactivation_welcome_pending flag", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    captured.setArgs = null;
    app = await buildVendorsApp();
  });

  it("sets reactivationWelcomePending=true when the vendor was suspended", async () => {
    state.vendor = {
      id: VENDOR_ID,
      name: "Silk Emporium",
      status: "suspended",
      ownerId: OWNER_ID,
      contactEmail: "seller@example.com",
      reactivationWelcomePending: false,
    };

    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/activate`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.vendor.status).toBe("approved");
    // The DB update must include the welcome flag
    expect(captured.setArgs).toMatchObject({
      status: "approved",
      reactivationWelcomePending: true,
    });
  });

  it("does NOT set reactivationWelcomePending when the vendor is already approved", async () => {
    state.vendor = {
      id: VENDOR_ID,
      name: "Silk Emporium",
      status: "approved",
      ownerId: OWNER_ID,
      contactEmail: "seller@example.com",
      reactivationWelcomePending: false,
    };

    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/activate`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(200);
    // The DB update must NOT include the welcome flag
    expect(captured.setArgs).not.toHaveProperty("reactivationWelcomePending");
  });

  it("returns 404 when the vendor does not exist", async () => {
    state.vendor = null;

    const res = await request(app)
      .post(`/api/admin/vendors/nonexistent/activate`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(404);
  });

  it("returns 403 when the admin key is missing", async () => {
    state.vendor = {
      id: VENDOR_ID,
      name: "Silk Emporium",
      status: "suspended",
      ownerId: OWNER_ID,
      contactEmail: null,
      reactivationWelcomePending: false,
    };

    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/activate`)
      .send({});

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tests — dismiss endpoint
// ---------------------------------------------------------------------------

describe("POST /api/seller/reactivation-welcome/dismiss — flag clearing", () => {
  let app: Express;

  beforeEach(async () => {
    captured.setArgs = null;
    app = await buildSellerApp();
  });

  it("returns { ok: true } and sets reactivationWelcomePending=false", async () => {
    state.vendor = {
      id: VENDOR_ID,
      name: "Silk Emporium",
      status: "approved",
      ownerId: OWNER_ID,
      contactEmail: "seller@example.com",
      reactivationWelcomePending: true,
    };

    const res = await request(app)
      .post("/api/seller/reactivation-welcome/dismiss")
      .set("Authorization", "Bearer test-token")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Verify the DB update cleared the flag
    expect(captured.setArgs).toMatchObject({ reactivationWelcomePending: false });
  });

  it("returns 403 when not authenticated as a seller", async () => {
    state.vendor = null;

    const res = await request(app)
      .post("/api/seller/reactivation-welcome/dismiss")
      .send({});

    expect(res.status).toBe(403);
  });
});
