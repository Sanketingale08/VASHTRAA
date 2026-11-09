import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const ADMIN_KEY = "test-admin-key";
const VENDOR_ID = "vend-test-suspend-1";
const OWNER_ID = "owner-user-suspend-1";
const VENDOR_NAME = "Silk Heritage Weavers";

const captured = vi.hoisted(() => ({ setArgs: null as any }));

const state = vi.hoisted(() => ({
  vendor: null as null | {
    id: string;
    name: string;
    status: string;
    statusReason: string | null;
    ownerId: string | null;
    contactEmail: string | null;
    reactivationWelcomePending?: boolean;
  },
}));

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  const makeUpdateChain = (table: any) => ({
    set: vi.fn((vals: any) => {
      captured.setArgs = { ...vals };
      return {
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            if (table?._t === "vendors") {
              if (!state.vendor) return Promise.resolve([]);
              const updated = { ...state.vendor, ...vals };
              state.vendor = updated;
              return Promise.resolve([updated]);
            }
            return Promise.resolve([]);
          }),
        })),
      };
    }),
  });

  const dbMock: any = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(state.vendor ? [{ ...state.vendor }] : [])),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })) })),
    update: vi.fn((table: any) => makeUpdateChain(table)),
  };

  return {
    db: dbMock,
    vendorsTable: tag("vendors", ["id", "name", "status", "statusReason", "ownerId", "contactEmail", "reactivationWelcomePending"]),
    productsTable: tag("products", ["id", "vendorId"]),
    ordersTable: tag("orders", ["id", "status", "items"]),
    adminNotificationsTable: tag("adminNotifications", ["id"]),
    adminAuditLogsTable: tag("adminAuditLogs", ["id"]),
    sellerNotificationsTable: tag("sellerNotifications", ["id"]),
    auditLogsTable: tag("auditLogs", ["id"]),
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
  };
});

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  clerkClient: { users: { getUser: vi.fn() } },
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorApprovalEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorSuspensionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorReactivationEmailForVendor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: vi.fn(() => "127.0.0.1"),
}));

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

describe("Vendor Account Suspension & Reactivation Workflow API Tests", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    captured.setArgs = null;
    state.vendor = {
      id: VENDOR_ID,
      name: VENDOR_NAME,
      status: "approved",
      statusReason: null,
      ownerId: OWNER_ID,
      contactEmail: "seller@silkheritage.com",
      reactivationWelcomePending: false,
    };
    app = await buildApp();
  });

  describe("POST /api/admin/vendors/:id/suspend", () => {
    it("suspends vendor account and sets statusReason", async () => {
      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/suspend`)
        .set("x-admin-key", ADMIN_KEY)
        .send({ reason: "Quality audit pending" });

      expect(res.status).toBe(200);
      expect(res.body.vendor.status).toBe("suspended");
      expect(captured.setArgs).toMatchObject({
        status: "suspended",
        statusReason: "Quality audit pending",
      });
    });
  });

  describe("POST /api/admin/vendors/:id/reactivate", () => {
    it("reactivates a suspended vendor, setting status to approved and setting reactivationWelcomePending=true", async () => {
      state.vendor = {
        id: VENDOR_ID,
        name: VENDOR_NAME,
        status: "suspended",
        statusReason: "Compliance review",
        ownerId: OWNER_ID,
        contactEmail: "seller@silkheritage.com",
        reactivationWelcomePending: false,
      };

      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/reactivate`)
        .set("x-admin-key", ADMIN_KEY)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.vendor.status).toBe("approved");
      expect(captured.setArgs).toMatchObject({
        status: "approved",
        statusReason: null,
        reactivationWelcomePending: true,
      });
    });
  });

  describe("GET /api/vendors/me status blocking for suspended vendors", () => {
    it("returns HTTP 403 Forbidden with VENDOR_SUSPENDED when vendor is suspended", async () => {
      state.vendor = {
        id: VENDOR_ID,
        name: VENDOR_NAME,
        status: "suspended",
        statusReason: "Temporary suspension",
        ownerId: OWNER_ID,
        contactEmail: "seller@silkheritage.com",
      };

      const res = await request(app)
        .get("/api/vendors/me")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: "Your account has been suspended.",
        code: "VENDOR_SUSPENDED",
        status: "suspended",
        statusReason: "Temporary suspension",
      });
    });
  });
});
