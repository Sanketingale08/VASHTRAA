import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { hashPassword } from "../lib/passwords";
import { signAccessToken } from "../lib/jwt";

const mockSellersMap = new Map<string, any>();
const mockUsersMap = new Map<string, any>();

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  let seqCounter = 100;

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
          orderBy: vi.fn(() => Promise.resolve([])),
          then: (res: any) => Promise.resolve([]).then(res),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((vals: any) => ({
          returning: vi.fn(() => {
            const id = vals.id || `vendor-sync-${Math.random()}`;
            const doc = { ...vals, id };
            return Promise.resolve([doc]);
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((updates: any) => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    },
    vendorsTable: tag("vendors", ["id", "vendorId", "name", "location", "status", "ownerId", "mobile", "panNumber", "panCardUrl", "bankHolder", "bankName", "bankAccount", "bankIfsc", "shopCity", "shopState", "shopPincode", "contactEmail"]),
    productsTable: tag("products", ["id", "vendorId"]),
    ordersTable: tag("orders", ["id", "status"]),
    mongoSellers: {
      findById: vi.fn(async (id: string) => mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id) || null),
      findBySellerId: vi.fn(async (id: string) => mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id) || null),
      findByVendorId: vi.fn(async (id: string) => mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id) || null),
      findByOwnerId: vi.fn(async (ownerId: string) => Array.from(mockSellersMap.values()).find((s) => s.ownerId === ownerId) || null),
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase();
        return Array.from(mockSellersMap.values()).find((s) => (s.email || "").toLowerCase() === clean || (s.contactEmail || "").toLowerCase() === clean) || null;
      }),
      findMany: vi.fn(async () => Array.from(new Set(mockSellersMap.values()))),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `vendor-sync-${Math.random()}`;
        const sellerDoc = { ...doc, id, sellerId: doc.sellerId || id, vendorId: doc.vendorId || id };
        mockSellersMap.set(id, sellerDoc);
        if (doc.email) mockSellersMap.set(doc.email.toLowerCase(), sellerDoc);
        if (doc.vendorId) mockSellersMap.set(doc.vendorId, sellerDoc);
        return sellerDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockSellersMap.set(existing.id, updated);
          if (existing.email) mockSellersMap.set(existing.email.toLowerCase(), updated);
          if (updated.vendorId) mockSellersMap.set(updated.vendorId, updated);
          return updated;
        }
        return null;
      }),
    },
    mongoVendors: {
      findById: vi.fn(async (id: string) => mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id) || null),
      findByOwnerId: vi.fn(async (ownerId: string) => Array.from(mockSellersMap.values()).find((s) => s.ownerId === ownerId) || null),
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase();
        return Array.from(mockSellersMap.values()).find((s) => (s.email || "").toLowerCase() === clean) || null;
      }),
    },
    mongoUsers: {
      findById: vi.fn(async (id: string) => mockUsersMap.get(id) || Array.from(mockUsersMap.values()).find((u) => u.id === id) || null),
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase();
        return Array.from(mockUsersMap.values()).find((u) => (u.email || "").toLowerCase() === clean) || null;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `usr_seller_${Math.random()}`;
        const userDoc = { ...doc, id };
        mockUsersMap.set(id, userDoc);
        if (doc.email) mockUsersMap.set(doc.email.toLowerCase(), userDoc);
        return userDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockUsersMap.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockUsersMap.set(id, updated);
          return updated;
        }
        return null;
      }),
    },
    mongoProducts: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    mongoOrders: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    mongoR2Assets: {
      findByObjectKey: vi.fn().mockResolvedValue(null),
      saveAsset: vi.fn().mockResolvedValue(undefined),
    },
    getNextSequenceValue: vi.fn(async () => ++seqCounter),
    formatVendorId: (seq: number) => `TDV${String(seq).padStart(6, "0")}`,
    isMongoDbConnected: vi.fn().mockReturnValue(true),
    setMongoConnected: vi.fn(),
  };
});

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: function () {
    return {
      trySetObjectEntityAclPolicy: vi.fn().mockResolvedValue(undefined),
    };
  },
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorApprovalEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorSuspensionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmailForVendor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sellerVerification", () => ({
  consumeSellerEmailVerification: vi.fn(),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import vendorsRouter from "../routes/vendors";
import authRouter from "../routes/auth";

const ADMIN_KEY = "test-admin-secret-key";
process.env.ADMIN_KEY = ADMIN_KEY;

describe("Seller Registration -> Admin Vendor Synchronization Lifecycle", () => {
  let app: express.Express;

  beforeEach(() => {
    mockSellersMap.clear();
    mockUsersMap.clear();
    app = express();
    app.use(express.json());
    app.use("/api", vendorsRouter);
    app.use("/api/auth", authRouter);
  });

  const createPayload = (suffix: string) => ({
    name: `Store ${suffix}`,
    shopName: `Store ${suffix}`,
    location: `City ${suffix}, India`,
    mobile: `98765${suffix.padStart(5, "0")}`,
    panNumber: `PAN${suffix}1234F`,
    panCardUrl: `/storage/private/kyc/pan_${suffix}.pdf`,
    bankHolder: `Owner ${suffix}`,
    bankName: "HDFC Bank",
    bankAccount: `12345678${suffix}`,
    bankIfsc: "HDFC0001234",
    shopCity: `City ${suffix}`,
    shopState: "State",
    shopPincode: "110001",
    termsAccepted: true,
    email: `seller_${suffix.toLowerCase()}@example.com`,
    password: "Password@123",
  });

  it("1. Registers 5 distinct sellers, verifies unique vendorId, status=pending, and MongoDB persistence", async () => {
    const sellers = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];

    for (const name of sellers) {
      const payload = createPayload(name);
      const regRes = await request(app)
        .post("/api/seller/register")
        .send(payload);

      expect(regRes.status).toBe(201);
      expect(regRes.body).toHaveProperty("id");
      expect(regRes.body).toHaveProperty("vendorId");
      expect(regRes.body.vendorId).toMatch(/^TDV\d{6}$/);
      expect(regRes.body.status).toBe("pending");
    }

    // Verify Admin Vendor API retrieves all 5 registered pending vendors
    const adminRes = await request(app)
      .get("/api/admin/vendors")
      .set("x-admin-key", ADMIN_KEY);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.vendors).toHaveLength(5);

    const pendingVendors = adminRes.body.vendors.filter((v: any) => v.status === "pending");
    expect(pendingVendors).toHaveLength(5);
  });

  it("2. Prevents duplicate vendor registrations with the same email", async () => {
    const payload = createPayload("DupCheck");
    const firstRes = await request(app)
      .post("/api/seller/register")
      .send(payload);
    expect(firstRes.status).toBe(201);

    const secondRes = await request(app)
      .post("/api/seller/register")
      .send(payload);
    expect(secondRes.status).toBe(409);
    expect(secondRes.body.error).toMatch(/already/i);
  });

  it("3. Admin Review & Status Lifecycle: Approve, Reject, Suspend, Deactivate", async () => {
    // Register 4 vendors
    const sA = createPayload("SellerA");
    const sB = createPayload("SellerB");
    const sC = createPayload("SellerC");
    const sD = createPayload("SellerD");

    const resA = await request(app).post("/api/seller/register").send(sA);
    const resB = await request(app).post("/api/seller/register").send(sB);
    const resC = await request(app).post("/api/seller/register").send(sC);
    const resD = await request(app).post("/api/seller/register").send(sD);

    const idA = resA.body.id;
    const idB = resB.body.id;
    const idC = resC.body.id;
    const idD = resD.body.id;

    // Approve Seller A
    const approveRes = await request(app)
      .post(`/api/admin/vendors/${idA}/approve`)
      .set("x-admin-key", ADMIN_KEY);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.vendor.status).toBe("approved");

    // Reject Seller B
    const rejectRes = await request(app)
      .post(`/api/admin/vendors/${idB}/reject`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reason: "Incomplete KYC documents" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.vendor.status).toBe("declined");

    // Approve then Suspend Seller C
    await request(app).post(`/api/admin/vendors/${idC}/approve`).set("x-admin-key", ADMIN_KEY);
    const suspendRes = await request(app)
      .post(`/api/admin/vendors/${idC}/suspend`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reason: "Policy violation" });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.vendor.status).toBe("suspended");

    // Approve then Deactivate Seller D
    await request(app).post(`/api/admin/vendors/${idD}/approve`).set("x-admin-key", ADMIN_KEY);
    const deactivateRes = await request(app)
      .post(`/api/admin/vendors/${idD}/deactivate`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reason: "Requested account closure" });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.vendor.status).toBe("deactivated");

    // Check Seller A Login works
    const loginA = await request(app)
      .post("/api/auth/seller/login")
      .send({ email: sA.email, password: sA.password });
    expect(loginA.status).toBe(200);
    expect(loginA.body.vendor).toBeDefined();

    // Check Seller B (Rejected) Login fails
    const loginB = await request(app)
      .post("/api/auth/seller/login")
      .send({ email: sB.email, password: sB.password });
    expect(loginB.status).toBe(403);
    expect(loginB.body.code).toBe("VENDOR_REJECTED");

    // Check Seller C (Suspended) Login fails
    const loginC = await request(app)
      .post("/api/auth/seller/login")
      .send({ email: sC.email, password: sC.password });
    expect(loginC.status).toBe(403);
    expect(loginC.body.code).toBe("VENDOR_SUSPENDED");

    // Check Seller D (Deactivated) Login fails
    const loginD = await request(app)
      .post("/api/auth/seller/login")
      .send({ email: sD.email, password: sD.password });
    expect(loginD.status).toBe(403);
    expect(loginD.body.code).toBe("VENDOR_DEACTIVATED");
  });

  it("4. Retrieves full vendor profile details via GET /api/admin/vendors/:id", async () => {
    const payload = createPayload("DetailCheck");
    const regRes = await request(app).post("/api/seller/register").send(payload);
    const vendorId = regRes.body.id;

    const detailRes = await request(app)
      .get(`/api/admin/vendors/${vendorId}`)
      .set("x-admin-key", ADMIN_KEY);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.name).toBe("Store DetailCheck");
    expect(detailRes.body.contactEmail).toBe("seller_detailcheck@example.com");
    expect(detailRes.body.mobile).toBe(payload.mobile);
    expect(detailRes.body.panNumber).toBe(payload.panNumber.toUpperCase());
    expect(detailRes.body.bankHolder).toBe(payload.bankHolder);
    expect(detailRes.body.bankName).toBe(payload.bankName);
    expect(detailRes.body.bankAccount).toBe(payload.bankAccount);
    expect(detailRes.body.shopCity).toBe("City DetailCheck");
  });
});
