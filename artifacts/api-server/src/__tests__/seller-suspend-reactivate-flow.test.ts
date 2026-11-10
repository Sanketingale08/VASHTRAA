import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { hashPassword } from "../lib/passwords";

const ADMIN_KEY = "test-super-admin-key";
const SELLER_EMAIL = "craftsman@royalweaves.com";
const SELLER_PASSWORD = "SecretPassword123!";
const SELLER_ID = "vend_royal_weaves_001";
const OWNER_ID = "usr_royal_owner_001";

const mockSellers = new Map<string, any>();
const mockUsers = new Map<string, any>();
const mockVendorsTable = new Map<string, any>();

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              const rows = Array.from(mockVendorsTable.values());
              return Promise.resolve(rows.length > 0 ? [{ ...rows[0] }] : []);
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: any) => {
          for (const [k, v] of mockVendorsTable.entries()) {
            mockVendorsTable.set(k, { ...v, ...vals });
          }
          return {
            where: vi.fn(() => {
              const res = Array.from(mockVendorsTable.values());
              const p = Promise.resolve(res);
              (p as any).returning = () => Promise.resolve(res);
              return p;
            }),
          };
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
    vendorsTable: tag("vendors", [
      "id",
      "name",
      "status",
      "statusReason",
      "ownerId",
      "contactEmail",
      "reactivationWelcomePending",
      "vendorId",
    ]),
    productsTable: tag("products", ["id", "vendorId"]),
    ordersTable: tag("orders", ["id", "status"]),
    mongoSellers: {
      findById: vi.fn(async (id: string) => {
        return mockSellers.get(id) || Array.from(mockSellers.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id) || null;
      }),
      findBySellerId: vi.fn(async (id: string) => {
        return mockSellers.get(id) || Array.from(mockSellers.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id) || null;
      }),
      findByVendorId: vi.fn(async (id: string) => {
        return mockSellers.get(id) || Array.from(mockSellers.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id) || null;
      }),
      findByOwnerId: vi.fn(async (ownerId: string) => {
        return Array.from(mockSellers.values()).find((s) => s.ownerId === ownerId) || null;
      }),
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase().trim();
        return Array.from(mockSellers.values()).find((s) => (s.email || "").toLowerCase() === clean || (s.contactEmail || "").toLowerCase() === clean) || null;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        let seller = mockSellers.get(id) || Array.from(mockSellers.values()).find((s) => s.id === id || s.ownerId === id || s.sellerId === id || s.vendorId === id);
        if (seller) {
          const updated = { ...seller, ...updates };
          mockSellers.set(seller.id, updated);
          if (updates.email) mockSellers.set(updates.email.toLowerCase(), updated);
          return updated;
        }
        return null;
      }),
      findMany: vi.fn(async () => Array.from(mockSellers.values())),
    },
    mongoUsers: {
      findById: vi.fn(async (id: string) => mockUsers.get(id) || null),
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase().trim();
        return Array.from(mockUsers.values()).find((u) => (u.email || "").toLowerCase() === clean) || null;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const u = mockUsers.get(id);
        if (u) {
          const updated = { ...u, ...updates };
          mockUsers.set(id, updated);
          return updated;
        }
        return null;
      }),
    },
    mongoVendors: {
      findById: vi.fn(async (id: string) => mockSellers.get(id) || null),
      findByOwnerId: vi.fn(async (ownerId: string) => Array.from(mockSellers.values()).find((s) => s.ownerId === ownerId) || null),
      findByEmail: vi.fn(async (email: string) => Array.from(mockSellers.values()).find((s) => (s.email || "").toLowerCase() === (email || "").toLowerCase()) || null),
      update: vi.fn(async (id: string, updates: any) => {
        const s = mockSellers.get(id);
        if (s) {
          const updated = { ...s, ...updates };
          mockSellers.set(id, updated);
          return updated;
        }
        return null;
      }),
    },
    adminNotificationsTable: tag("adminNotifs", ["id"]),
    sellerNotificationsTable: tag("sellerNotifs", ["id"]),
    auditLogsTable: tag("auditLogs", ["id"]),
    vendorSettlementsTable: tag("settlements", ["id", "vendorId"]),
    stockHistoryTable: tag("stockHistory", ["id", "productId"]),
    CATEGORIES: ["tops", "sarees"],
    FABRICS: [],
    OCCASIONS: [],
    COLORS: [],
    CATEGORY_PREFIX: {},
    isMongoDbConnected: vi.fn(() => false),
    isInternalRawId: vi.fn((id: any) => typeof id === "string" && (id.includes("-") || id.length === 24)),
    getCanonicalSellerId: vi.fn((v: any) => {
      if (!v) return "";
      if (typeof v === "string") return v;
      if (v.sellerId && !v.sellerId.includes("-")) return v.sellerId;
      if (v.vendorId && !v.vendorId.includes("-")) return v.vendorId;
      return v.sellerId || v.vendorId || v.id || "";
    }),
  };
});

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorApprovalEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorSuspensionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmailForVendor: vi.fn().mockResolvedValue(undefined),
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

async function createTestApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });

  const { default: authRouter } = await import("../routes/auth");
  const { default: vendorsRouter } = await import("../routes/vendors");
  const { default: sellerRouter } = await import("../routes/seller");

  app.use("/api", authRouter);
  app.use("/api", vendorsRouter);
  app.use("/api", sellerRouter);

  return app;
}

describe("VASTRAA Seller Account Suspension & Reactivation Complete Flow", () => {
  let app: Express;

  beforeEach(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.JWT_SECRET = "super-secret-test-jwt-key-32-chars-long";

    mockSellers.clear();
    mockUsers.clear();
    mockVendorsTable.clear();

    const pwdHash = await hashPassword(SELLER_PASSWORD);

    const userDoc = {
      id: OWNER_ID,
      email: SELLER_EMAIL,
      role: "seller",
      name: "Master Weaver",
      passwordHash: pwdHash,
    };
    mockUsers.set(OWNER_ID, userDoc);

    const sellerDoc = {
      id: SELLER_ID,
      sellerId: "VEND_ROYAL_001",
      vendorId: "VEND_ROYAL_001",
      name: "Royal Weaves",
      shopName: "Royal Weaves",
      email: SELLER_EMAIL,
      contactEmail: SELLER_EMAIL,
      ownerId: OWNER_ID,
      status: "approved",
      statusReason: null,
      reactivationWelcomePending: false,
      location: "Varanasi, India",
      rating: 4.9,
    };
    mockSellers.set(SELLER_ID, sellerDoc);

    const pgVendor = {
      id: "44444444-4444-4444-4444-444444444444",
      name: "Royal Weaves",
      status: "approved",
      statusReason: null,
      ownerId: OWNER_ID,
      contactEmail: SELLER_EMAIL,
      vendorId: "VEND_ROYAL_001",
      reactivationWelcomePending: false,
    };
    mockVendorsTable.set(pgVendor.id, pgVendor);

    app = await createTestApp();
  });

  it("completes full lifecycle: Active -> Suspend (login blocked) -> Reactivate -> Login allowed with existing credentials -> Welcome Popup shown -> Dismissed -> Never shown again", async () => {
    // 1. Initial Login with valid credentials succeeds
    const loginRes1 = await request(app)
      .post("/api/seller/login")
      .send({ email: SELLER_EMAIL, password: SELLER_PASSWORD });

    expect(loginRes1.status).toBe(200);
    expect(loginRes1.body.success).toBe(true);
    expect(loginRes1.body.vendor.status).toBe("approved");
    const activeToken1 = loginRes1.body.token;
    expect(activeToken1).toBeDefined();

    // 2. Profile fetch succeeds
    const profileRes1 = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${activeToken1}`);
    expect(profileRes1.status).toBe(200);
    expect(profileRes1.body.reactivationWelcomePending).toBe(false);

    // 3. Admin suspends the seller account
    const suspendRes = await request(app)
      .post(`/api/admin/vendors/${SELLER_ID}/suspend`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ reason: "Routine quality compliance review" });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.vendor.status).toBe("suspended");

    // 4. Seller attempts to log in while suspended -> BLOCKED with 403 VENDOR_SUSPENDED
    const loginBlockedRes = await request(app)
      .post("/api/seller/login")
      .send({ email: SELLER_EMAIL, password: SELLER_PASSWORD });

    expect(loginBlockedRes.status).toBe(403);
    expect(loginBlockedRes.body.code).toBe("VENDOR_SUSPENDED");
    expect(loginBlockedRes.body.error).toBe("Your account has been suspended.");

    // 5. Old token cannot access vendor profile
    const profileBlockedRes = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${activeToken1}`);
    expect([401, 403]).toContain(profileBlockedRes.status);

    // 6. Admin reactivates the seller account
    const reactivateRes = await request(app)
      .post(`/api/admin/vendors/${SELLER_ID}/reactivate`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.vendor.status).toBe("approved");

    // 7. Seller logs in using the EXACT SAME credentials (no re-registration)
    const loginRes2 = await request(app)
      .post("/api/seller/login")
      .send({ email: SELLER_EMAIL, password: SELLER_PASSWORD });

    expect(loginRes2.status).toBe(200);
    expect(loginRes2.body.success).toBe(true);
    expect(loginRes2.body.vendor.reactivationWelcomePending).toBe(true);
    const activeToken2 = loginRes2.body.token;

    // 8. Seller visits dashboard / fetches profile -> Welcome popup is pending
    const profileRes2 = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${activeToken2}`);

    expect(profileRes2.status).toBe(200);
    expect(profileRes2.body.reactivationWelcomePending).toBe(true);

    // 9. Seller clicks "Continue to Dashboard" (popup dismissed)
    const dismissRes = await request(app)
      .post("/api/seller/reactivation-welcome/dismiss")
      .set("Authorization", `Bearer ${activeToken2}`);

    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.ok).toBe(true);

    // 10. Subsequent profile check verifies the popup flag is cleared
    const profileRes3 = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${activeToken2}`);

    expect(profileRes3.status).toBe(200);
    expect(profileRes3.body.reactivationWelcomePending).toBe(false);

    // 11. Seller logs out and logs in again -> popup does NOT reappear
    const loginRes3 = await request(app)
      .post("/api/seller/login")
      .send({ email: SELLER_EMAIL, password: SELLER_PASSWORD });

    expect(loginRes3.status).toBe(200);
    expect(loginRes3.body.vendor.reactivationWelcomePending).toBe(false);

    const profileRes4 = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${loginRes3.body.token}`);

    expect(profileRes4.status).toBe(200);
    expect(profileRes4.body.reactivationWelcomePending).toBe(false);
  });
});
