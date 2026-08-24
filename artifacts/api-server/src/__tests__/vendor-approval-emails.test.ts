/**
 * vendor-approval-emails.test.ts
 *
 * Confirms that POST /api/admin/vendors/:id/approve calls
 * sendVendorApprovalEmailForVendor with the correct contactEmail/ownerId
 * — including passing null contactEmail so the helper can fall back to Clerk.
 *
 * The approve handler uses db.execute() with one raw, atomic UPDATE that
 * allocates the next Vendor ID and marks the vendor approved together.
 * Side-effect helpers (insertSellerNotification, insertAdminNotification,
 * writeAuditLog) are mocked at the module level so they don't require a
 * fully-shaped DB mock chain.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports that pull the modules
// ---------------------------------------------------------------------------

const approvalEmailMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

/**
 * Hoisted execute mock so we can call mockReset() + mockImplementation() in
 * beforeEach without fighting module-cache ordering issues.
 */
const dbExecuteMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorApprovalEmailForVendor: approvalEmailMock,
  sendVendorSuspensionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmailForVendor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn().mockResolvedValue(undefined),
  insertSellerNotificationForVendors: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// ---------------------------------------------------------------------------
// @workspace/db mock
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  const dbMock: any = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    // execute is the hoisted mock — reset + re-implement in beforeEach
    execute: dbExecuteMock,
  };

  return {
    db: dbMock,
    vendorsTable: tag("vendors", ["id", "name", "status", "ownerId", "contactEmail", "statusReason", "reactivationWelcomePending"]),
    productsTable: tag("products", ["id", "vendorId"]),
    ordersTable: tag("orders", ["id", "status", "items"]),
    adminNotificationsTable: tag("adminNotifications", ["id", "type", "title", "body", "metadata", "createdAt"]),
    adminAuditLogsTable: tag("adminAuditLogs", ["id", "action", "module", "details", "ipAddress", "createdAt"]),
    sellerNotificationsTable: tag("sellerNotifications", ["id", "vendorId", "type", "title", "body", "metadata", "createdAt"]),
    notificationsTable: tag("notifications", ["id", "userId", "vendorId", "type", "title", "body", "metadata", "createdAt"]),
    auditLogsTable: tag("auditLogs", ["id"]),
    // Required by the isAdmin middleware (getStoredHash / get2faEnabled)
    siteSettingsTable: tag("siteSettings", ["key", "value"]),
    adminLoginSessionsTable: tag("adminLoginSessions", ["sessionTokenHash", "revokedAt", "twoFactorVerified"]),
  };
});

// ---------------------------------------------------------------------------
// Clerk mock
// ---------------------------------------------------------------------------

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: "owner-user-1" })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  clerkClient: { users: { getUser: vi.fn() } },
}));

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const ADMIN_KEY = "test-admin-key";
const VENDOR_ID = "vendor-uuid-1";
const OWNER_ID = "owner-user-1";
const CONTACT_EMAIL = "seller@example.com";
const VENDOR_NAME = "Silk Emporium";

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

/**
 * Configure dbExecuteMock for a successful approve of the given vendor row.
 * A successful approval requires one atomic UPDATE … RETURNING execution.
 */
function setupApprovalMock(vendorRow: Record<string, unknown>) {
  dbExecuteMock.mockReset();
  dbExecuteMock.mockResolvedValueOnce({ rows: [vendorRow] });
}

// ---------------------------------------------------------------------------
// POST /api/admin/vendors/:id/approve — email delivery
// ---------------------------------------------------------------------------

describe("POST /api/admin/vendors/:id/approve — email delivery", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    approvalEmailMock.mockClear();

    // Default: vendor present with contactEmail and ownerId
    setupApprovalMock({
      id: VENDOR_ID,
      name: VENDOR_NAME,
      status: "approved",
      owner_id: OWNER_ID,
      contact_email: CONTACT_EMAIL,
      vendor_id: "TDV000001",
    });

    app = await buildApp();
  });

  it("returns the generated Vendor ID with the approved status", async () => {
    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.vendor.status).toBe("approved");
    expect(res.body.vendor.vendorId).toBe("TDV000001");
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("calls sendVendorApprovalEmailForVendor with contactEmail when vendor has one", async () => {
    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    // The email call is fire-and-forget — allow the microtask queue to drain
    await new Promise((r) => setImmediate(r));

    expect(approvalEmailMock).toHaveBeenCalledOnce();
    expect(approvalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: CONTACT_EMAIL,
        ownerId: OWNER_ID,
      })
    );
  });

  it("calls sendVendorApprovalEmailForVendor with null contactEmail (triggers Clerk fallback inside the helper) when vendor has no contactEmail", async () => {
    setupApprovalMock({
      id: VENDOR_ID,
      name: VENDOR_NAME,
      status: "approved",
      owner_id: OWNER_ID,
      contact_email: null,
      vendor_id: "TDV000001",
    });

    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    await new Promise((r) => setImmediate(r));

    expect(approvalEmailMock).toHaveBeenCalledOnce();
    expect(approvalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
      })
    );
  });

  it("calls sendVendorApprovalEmailForVendor with null ownerId when vendor has no owner", async () => {
    setupApprovalMock({
      id: VENDOR_ID,
      name: VENDOR_NAME,
      status: "approved",
      owner_id: null,
      contact_email: CONTACT_EMAIL,
      vendor_id: "TDV000001",
    });

    await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    await new Promise((r) => setImmediate(r));

    expect(approvalEmailMock).toHaveBeenCalledOnce();
    expect(approvalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: CONTACT_EMAIL,
        ownerId: null,
      })
    );
  });

  it("returns 403 when admin key is missing", async () => {
    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/approve`)
      .send({});
    expect(res.status).toBe(403);
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  it("returns 404 and does NOT call the email helper when vendor is not found", async () => {
    // The atomic UPDATE has no match, and the follow-up lookup confirms it is absent.
    dbExecuteMock.mockReset();
    dbExecuteMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post(`/api/admin/vendors/nonexistent/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(404);
    await new Promise((r) => setImmediate(r));
    expect(approvalEmailMock).not.toHaveBeenCalled();
  });

  it("keeps an existing permanent Vendor ID when approval is retried", async () => {
    setupApprovalMock({
      id: VENDOR_ID,
      name: VENDOR_NAME,
      status: "approved",
      owner_id: OWNER_ID,
      contact_email: CONTACT_EMAIL,
      vendor_id: "TDV000123",
    });

    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.vendor.vendorId).toBe("TDV000123");
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("returns the same ID to concurrent approval retries", async () => {
    const approvedVendor = {
      id: VENDOR_ID,
      name: VENDOR_NAME,
      status: "approved",
      owner_id: OWNER_ID,
      contact_email: CONTACT_EMAIL,
      vendor_id: "TDV000001",
    };
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue({ rows: [approvedVendor] });

    const [first, second] = await Promise.all([
      request(app).post(`/api/admin/vendors/${VENDOR_ID}/approve`).set("x-admin-key", ADMIN_KEY).send({}),
      request(app).post(`/api/admin/vendors/${VENDOR_ID}/approve`).set("x-admin-key", ADMIN_KEY).send({}),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.vendor.vendorId).toBe("TDV000001");
    expect(second.body.vendor.vendorId).toBe("TDV000001");
  });

  it("does not assign an ID to a historical vendor that is already approved without one", async () => {
    dbExecuteMock.mockReset();
    dbExecuteMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: "approved", vendor_id: null }] });

    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already approved without a generated Vendor ID");
    expect(approvalEmailMock).not.toHaveBeenCalled();
  });

  it("does not approve a vendor when ID allocation fails", async () => {
    dbExecuteMock.mockReset();
    dbExecuteMock.mockRejectedValueOnce(new Error("sequence unavailable"));

    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Vendor approval could not be completed. Please retry.");
    expect(approvalEmailMock).not.toHaveBeenCalled();
  });
});
