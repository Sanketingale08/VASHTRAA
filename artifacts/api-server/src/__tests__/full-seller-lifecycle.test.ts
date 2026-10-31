import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { hashPassword, verifyPassword } from "../lib/passwords";
import { signAccessToken } from "../lib/jwt";

const mockSellersMap = new Map<string, any>();
const mockUsersMap = new Map<string, any>();

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((vals: any) => ({
          returning: vi.fn(() => Promise.resolve([{ id: vals.id || "vendor-lifecycle-999", ...vals }])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((updates: any) => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: "vendor-lifecycle-999", ...updates }])),
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
        return Array.from(mockSellersMap.values()).find((s) => (s.email || "").toLowerCase() === clean || (s.contactEmail || "").toLowerCase() === clean || (s.ownerEmail || "").toLowerCase() === clean) || null;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || "vendor-lifecycle-999";
        const sellerDoc = { ...doc, id, sellerId: doc.sellerId || id, vendorId: doc.vendorId || id };
        mockSellersMap.set(id, sellerDoc);
        if (doc.email) mockSellersMap.set(doc.email.toLowerCase(), sellerDoc);
        return sellerDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockSellersMap.get(id) || Array.from(mockSellersMap.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id);
        if (existing) {
          const updated = { ...existing, ...updates, vendorId: existing.vendorId || updates.vendorId || `TDV${Math.floor(100000 + Math.random() * 900000)}` };
          mockSellersMap.set(existing.id, updated);
          if (existing.email) mockSellersMap.set(existing.email.toLowerCase(), updated);
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
    mongoR2Assets: {
      findByObjectKey: vi.fn().mockResolvedValue(null),
      saveAsset: vi.fn().mockResolvedValue(undefined),
    },
    isMongoDbConnected: vi.fn().mockReturnValue(true),
    setMongoConnected: vi.fn(),
    getCollection: vi.fn(() => ({
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      updateOne: vi.fn().mockResolvedValue({}),
      insertOne: vi.fn().mockResolvedValue({}),
    })),
    mongoSessions: {
      insert: vi.fn().mockResolvedValue({}),
      findById: vi.fn().mockResolvedValue(null),
    },
    eq: (a: any, b: any) => ({ a, b }),
    or: (...args: any[]) => ({ args }),
  };
});

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: () => "127.0.0.1",
}));

vi.mock("../lib/sellerVerification", () => ({
  consumeSellerEmailVerification: vi.fn(),
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorApprovalEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmailForVendor: vi.fn().mockResolvedValue(undefined),
}));

import vendorsRouter from "../routes/vendors";
import authRouter from "../routes/auth";

describe("Complete End-to-End Seller Registration -> Admin Approval -> Login -> Dashboard Flow", () => {
  let app: express.Express;

  beforeEach(() => {
    mockSellersMap.clear();
    mockUsersMap.clear();
    app = express();
    app.use(express.json());
    app.use("/api", vendorsRouter);
    app.use("/api", authRouter);
  });

  const testPayload = {
    email: "e2e_seller@vastraa.com",
    password: "E2ESellerPassword123!",
    name: "Kanchipuram Silks Emporium",
    location: "Kanchipuram, Tamil Nadu",
    mobile: "9123456789",
    panNumber: "ABCDE9999F",
    panCardUrl: "/storage/private/kyc/pan_kanchi.pdf",
    bankHolder: "Kanchipuram Silks",
    bankName: "HDFC Bank",
    bankAccount: "11223344556677",
    bankIfsc: "HDFC0001234",
    shopStreet: "Gandhi Road",
    shopCity: "Kanchipuram",
    shopState: "Tamil Nadu",
    shopPincode: "631501",
    termsAccepted: true,
  };

  it("Executes the complete lifecycle: Register -> Pending -> Pre-login Rejected -> Admin Approve -> Post-login Success -> Dashboard Access", async () => {
    // -------------------------------------------------------------
    // Stage 1: Register New Shop
    // -------------------------------------------------------------
    const regRes = await request(app)
      .post("/api/seller/register")
      .send(testPayload);

    expect(regRes.status).toBe(201);
    expect(regRes.body).toHaveProperty("id");
    expect(regRes.body.name).toBe("Kanchipuram Silks Emporium");
    const vendorId = regRes.body.id;

    // Verify stored seller status in MongoDB is "pending"
    const storedSeller = Array.from(mockSellersMap.values()).find((s) => s.email === testPayload.email);
    expect(storedSeller).toBeDefined();
    expect(storedSeller.status).toBe("pending");
    expect(storedSeller.passwordHash).toMatch(/^pbkdf2:/);

    // -------------------------------------------------------------
    // Stage 2: Pre-Approval Login Attempt (Should fail with 403 VENDOR_PENDING)
    // -------------------------------------------------------------
    const preApprovalLoginRes = await request(app)
      .post("/api/seller/login")
      .send({
        email: testPayload.email,
        password: testPayload.password,
      });

    expect(preApprovalLoginRes.status).toBe(403);
    expect(preApprovalLoginRes.body.code).toBe("VENDOR_PENDING");
    expect(preApprovalLoginRes.body.error).toMatch(/pending Super Admin approval/i);

    // -------------------------------------------------------------
    // Stage 3: Super Admin Approves Application
    // -------------------------------------------------------------
    const approveRes = await request(app)
      .post(`/api/admin/vendors/${vendorId}/approve`)
      .set("x-admin-key", process.env.ADMIN_API_KEY || "dev-admin-key")
      .send();

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.vendor).toBeDefined();
    expect(approveRes.body.vendor.status).toBe("approved");

    // Verify status in mock store is now "approved"
    const approvedSellerDoc = mockSellersMap.get(vendorId) || Array.from(mockSellersMap.values()).find(s => s.id === vendorId);
    expect(approvedSellerDoc.status).toBe("approved");

    // -------------------------------------------------------------
    // Stage 4: Post-Approval Seller Login (Should succeed with 200 & JWT token)
    // -------------------------------------------------------------
    const postApprovalLoginRes = await request(app)
      .post("/api/seller/login")
      .send({
        email: testPayload.email,
        password: testPayload.password,
      });

    expect(postApprovalLoginRes.status).toBe(200);
    expect(postApprovalLoginRes.body.success).toBe(true);
    expect(postApprovalLoginRes.body).toHaveProperty("token");
    expect(postApprovalLoginRes.body.user.email).toBe(testPayload.email);

    const token = postApprovalLoginRes.body.token;

    // -------------------------------------------------------------
    // Stage 5: Access Seller Profile / Dashboard Endpoint with Token
    // -------------------------------------------------------------
    const profileRes = await request(app)
      .get("/api/vendors/me")
      .set("Authorization", `Bearer ${token}`);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.name).toBe("Kanchipuram Silks Emporium");
    expect(profileRes.body.status).toBe("approved");
  });

  it("Executes Decline flow: Register -> Pending -> Admin Decline -> DB Updated in Mongo -> Login Denied -> Dashboard Denied", async () => {
    const declinePayload = {
      email: "declined_seller@vastraa.com",
      password: "DeclinedSellerPassword123!",
      name: "Declined Handlooms",
      location: "Varanasi, UP",
      mobile: "9876543210",
      panNumber: "XYZPD1234K",
      panCardUrl: "/storage/private/kyc/pan_declined.pdf",
      bankHolder: "Declined Handlooms",
      bankName: "SBI",
      bankAccount: "998877665544",
      bankIfsc: "SBIN0009999",
      shopCity: "Varanasi",
      shopState: "Uttar Pradesh",
      shopPincode: "221001",
      termsAccepted: true,
    };

    // 1. Register New Shop -> Status = PENDING
    const regRes = await request(app)
      .post("/api/seller/register")
      .send(declinePayload);

    expect(regRes.status).toBe(201);
    const vendorId = regRes.body.id;

    const storedBeforeDecline = Array.from(mockSellersMap.values()).find((s) => s.email === declinePayload.email);
    expect(storedBeforeDecline).toBeDefined();
    expect(storedBeforeDecline.status).toBe("pending");

    // 2. Admin Declines Application
    const declineRes = await request(app)
      .post(`/api/admin/vendors/${vendorId}/decline`)
      .set("x-admin-key", "dev-admin-key")
      .send({ reason: "Incomplete KYC document verification." });

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.vendor).toBeDefined();
    expect(declineRes.body.vendor.status).toBe("declined");
    expect(declineRes.body.vendor.statusReason).toBe("Incomplete KYC document verification.");

    // 3. Verify MongoDB updated: status = "declined", approvalStatus = "declined", credentials unchanged
    const storedAfterDecline = Array.from(mockSellersMap.values()).find((s) => s.email === declinePayload.email);
    expect(storedAfterDecline).toBeDefined();
    expect(storedAfterDecline.status).toBe("declined");
    expect(storedAfterDecline.approvalStatus).toBe("declined");
    expect(storedAfterDecline.statusReason).toBe("Incomplete KYC document verification.");
    expect(storedAfterDecline.email).toBe(declinePayload.email);

    // 4. Seller Login Attempt (Must fail with 403 VENDOR_REJECTED)
    const loginRes = await request(app)
      .post("/api/seller/login")
      .send({
        email: declinePayload.email,
        password: declinePayload.password,
      });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.code).toBe("VENDOR_REJECTED");
    expect(loginRes.body.error).toMatch(/Incomplete KYC document verification/i);

    // 5. Direct dashboard access attempt (Must fail with 403 VENDOR_REJECTED)
    const declinedToken = signAccessToken({
      sub: storedAfterDecline.ownerId || storedAfterDecline.id,
      role: "seller",
      email: declinePayload.email,
    });
    const dashboardRes = await request(app)
      .get("/api/vendors/me")
      .set("Authorization", `Bearer ${declinedToken}`);

    expect(dashboardRes.status).toBe(403);
    expect(dashboardRes.body.code).toBe("VENDOR_REJECTED");
  });
});
