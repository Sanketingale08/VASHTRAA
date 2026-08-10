/**
 * vendor-suspension-rejection-emails.test.ts
 *
 * Confirms that POST /api/admin/vendors/:id/suspend and
 * POST /api/admin/vendors/:id/reject call the correct email helpers with the
 * right address and vendor name — including passing null contactEmail so the
 * helper can fall back to Clerk.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports that pull the modules
// ---------------------------------------------------------------------------

const suspensionEmailMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const rejectionEmailMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorSuspensionEmailForVendor: suspensionEmailMock,
  sendVendorRejectionEmailForVendor: rejectionEmailMock,
  // Stubs for other exports imported by vendors.ts
  sendVendorApprovalEmail: vi.fn().mockResolvedValue(undefined),
  sendVendorApprovalEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorSuspensionEmail: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const ADMIN_KEY = "test-admin-key";
const VENDOR_ID = "vendor-uuid-1";
const OWNER_ID = "owner-user-1";
const CONTACT_EMAIL = "seller@example.com";
const VENDOR_NAME = "Silk Emporium";

const state = vi.hoisted(() => ({
  vendor: null as null | {
    id: string;
    name: string;
    status: string;
    ownerId: string | null;
    contactEmail: string | null;
  },
}));

// ---------------------------------------------------------------------------
// @workspace/db mock
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  /**
   * Build an update chain that applies vals to state.vendor and returns it.
   * This mirrors what the real DB does on UPDATE … RETURNING.
   */
  const makeUpdateChain = (table: any) => ({
    set: vi.fn((vals: any) => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => {
          if (table?._t === "vendors") {
            if (!state.vendor) return Promise.resolve([]);
            // Apply the update values so status/etc. reflect in the response
            const updated = { ...state.vendor, ...vals };
            return Promise.resolve([updated]);
          }
          return Promise.resolve([]);
        }),
      })),
    })),
  });

  const dbMock: any = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })) })),
    update: vi.fn((table: any) => makeUpdateChain(table)),
  };

  return {
    db: dbMock,
    vendorsTable: tag("vendors", ["id", "name", "status", "ownerId", "contactEmail"]),
    productsTable: tag("products", ["id", "vendorId"]),
    ordersTable: tag("orders", ["id", "status", "items"]),
    adminNotificationsTable: tag("adminNotifications", ["id", "type", "title", "body", "metadata", "createdAt"]),
    adminAuditLogsTable: tag("adminAuditLogs", ["id", "action", "module", "details", "ipAddress", "createdAt"]),
    sellerNotificationsTable: tag("sellerNotifications", ["id", "vendorId", "type", "title", "body", "metadata", "createdAt"]),
    auditLogsTable: tag("auditLogs", ["id"]),
  };
});

// ---------------------------------------------------------------------------
// Clerk mock
// ---------------------------------------------------------------------------

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  clerkClient: {
    users: { getUser: vi.fn() },
  },
}));

// ---------------------------------------------------------------------------
// App builder (lazy import so mocks are applied first)
// ---------------------------------------------------------------------------

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: unknown, next: () => void) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  const { default: vendorsRouter } = await import("../routes/vendors");
  app.use("/api", vendorsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// POST /api/admin/vendors/:id/suspend
// ---------------------------------------------------------------------------

describe("POST /api/admin/vendors/:id/suspend — email delivery", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.vendor = {
      id: VENDOR_ID,
      name: VENDOR_NAME,
      status: "approved",
      ownerId: OWNER_ID,
      contactEmail: CONTACT_EMAIL,
    };
    suspensionEmailMock.mockClear();
    app = await buildApp();
  });

  it("returns 200 and vendor with suspended status", async () => {
    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/suspend`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.vendor.status).toBe("suspended");
  });

  it("calls sendVendorSuspensionEmailForVendor with contactEmail when vendor has one", async () => {
    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/suspend`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    // The email call is fire-and-forget — allow the microtask queue to drain
    await new Promise((r) => setImmediate(r));

    expect(suspensionEmailMock).toHaveBeenCalledOnce();
    expect(suspensionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: CONTACT_EMAIL,
        ownerId: OWNER_ID,
      })
    );
  });

  it("calls sendVendorSuspensionEmailForVendor with null contactEmail (triggers Clerk fallback inside the helper) when vendor has no contactEmail", async () => {
    state.vendor = { ...state.vendor!, contactEmail: null };

    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/suspend`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    await new Promise((r) => setImmediate(r));

    expect(suspensionEmailMock).toHaveBeenCalledOnce();
    expect(suspensionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
      })
    );
  });

  it("passes reason to sendVendorSuspensionEmailForVendor when provided in request body", async () => {
    const reason = "Violated marketplace policy";

    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/suspend`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reason });

    await new Promise((r) => setImmediate(r));

    expect(suspensionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason })
    );
  });

  it("passes undefined reason (not the string 'undefined') when body has no reason field", async () => {
    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/suspend`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    await new Promise((r) => setImmediate(r));

    const call = suspensionEmailMock.mock.calls[0][0];
    expect(call.reason).toBeUndefined();
  });

  it("returns 403 when admin key is missing", async () => {
    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/suspend`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 404 and does NOT call the email helper when vendor is not found", async () => {
    state.vendor = null;
    const res = await request(app)
      .post(`/api/admin/vendors/nonexistent/suspend`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});
    expect(res.status).toBe(404);
    await new Promise((r) => setImmediate(r));
    expect(suspensionEmailMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/vendors/:id/reject
// ---------------------------------------------------------------------------

describe("POST /api/admin/vendors/:id/reject — email delivery", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    state.vendor = {
      id: VENDOR_ID,
      name: VENDOR_NAME,
      status: "pending",
      ownerId: OWNER_ID,
      contactEmail: CONTACT_EMAIL,
    };
    rejectionEmailMock.mockClear();
    app = await buildApp();
  });

  it("returns 200", async () => {
    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/reject`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.vendor).toBeDefined();
  });

  it("calls sendVendorRejectionEmailForVendor with contactEmail when vendor has one", async () => {
    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/reject`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    await new Promise((r) => setImmediate(r));

    expect(rejectionEmailMock).toHaveBeenCalledOnce();
    expect(rejectionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: CONTACT_EMAIL,
        ownerId: OWNER_ID,
      })
    );
  });

  it("calls sendVendorRejectionEmailForVendor with null contactEmail (triggers Clerk fallback inside the helper) when vendor has no contactEmail", async () => {
    state.vendor = { ...state.vendor!, contactEmail: null };

    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/reject`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    await new Promise((r) => setImmediate(r));

    expect(rejectionEmailMock).toHaveBeenCalledOnce();
    expect(rejectionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
      })
    );
  });

  it("passes reason to sendVendorRejectionEmailForVendor when provided in request body", async () => {
    const reason = "Incomplete KYC documentation";

    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/reject`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reason });

    await new Promise((r) => setImmediate(r));

    expect(rejectionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason })
    );
  });

  it("passes undefined reason (not the string 'undefined') when body has no reason field", async () => {
    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/reject`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    await new Promise((r) => setImmediate(r));

    const call = rejectionEmailMock.mock.calls[0][0];
    expect(call.reason).toBeUndefined();
  });

  it("returns 403 when admin key is missing", async () => {
    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/reject`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 404 and does NOT call the email helper when vendor is not found", async () => {
    state.vendor = null;
    const res = await request(app)
      .post(`/api/admin/vendors/nonexistent/reject`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});
    expect(res.status).toBe(404);
    await new Promise((r) => setImmediate(r));
    expect(rejectionEmailMock).not.toHaveBeenCalled();
  });
});
