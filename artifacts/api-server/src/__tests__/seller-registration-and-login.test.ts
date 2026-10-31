import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { hashPassword, verifyPassword } from "../lib/passwords";

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
          returning: vi.fn(() => Promise.resolve([{ id: "vendor-test-999", ...vals }])),
        })),
      })),
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
        const id = doc.id || "vendor-test-999";
        const sellerDoc = { ...doc, id, sellerId: doc.sellerId || id, vendorId: doc.vendorId || id };
        mockSellersMap.set(id, sellerDoc);
        if (doc.email) mockSellersMap.set(doc.email.toLowerCase(), sellerDoc);
        return sellerDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockSellersMap.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockSellersMap.set(id, updated);
          return updated;
        }
        return null;
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
    mongoVendors: {
      findById: vi.fn().mockResolvedValue(null),
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

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: () => "127.0.0.1",
}));

vi.mock("../lib/sellerVerification", () => ({
  consumeSellerEmailVerification: vi.fn(),
}));

import vendorsRouter from "../routes/vendors";
import authRouter from "../routes/auth";

describe("Seller Registration & Login End-to-End Flow", () => {
  let app: express.Express;

  beforeEach(() => {
    mockSellersMap.clear();
    mockUsersMap.clear();
    app = express();
    app.use(express.json());
    app.use("/api", vendorsRouter);
    app.use("/api", authRouter);
  });

  const testSellerPayload = {
    email: "new_registered_seller@vashtraa.com",
    password: "MySecurePassword123!",
    name: "Pure Silk Heritage Shop",
    location: "Varanasi, UP",
    mobile: "9876543210",
    panNumber: "ABCDE1234F",
    panCardUrl: "/storage/private/kyc/pan_silk.pdf",
    bankHolder: "Pure Silk Heritage Shop",
    bankName: "State Bank of India",
    bankAccount: "98765432109876",
    bankIfsc: "SBIN0001234",
    shopStreet: "Godowlia Chowk",
    shopCity: "Varanasi",
    shopState: "Uttar Pradesh",
    shopPincode: "221001",
    termsAccepted: true,
  };

  it("1. Successfully registers a seller and securely stores hashed credentials in MongoDB", async () => {
    const regRes = await request(app)
      .post("/api/seller/register")
      .send(testSellerPayload);

    expect(regRes.status).toBe(201);
    expect(regRes.body).toHaveProperty("id");
    expect(regRes.body).toHaveProperty("name", "Pure Silk Heritage Shop");

    // Verify stored user & seller records in MongoDB mock
    const userDoc = Array.from(mockUsersMap.values()).find((u) => u.email === testSellerPayload.email);
    expect(userDoc).toBeDefined();
    expect(userDoc.role).toBe("seller");
    expect(userDoc.passwordHash).toMatch(/^pbkdf2:/);
    expect(verifyPassword(testSellerPayload.password, userDoc.passwordHash)).toBe(true);

    const sellerDoc = Array.from(mockSellersMap.values()).find((s) => s.email === testSellerPayload.email);
    expect(sellerDoc).toBeDefined();
    expect(sellerDoc.passwordHash).toBe(userDoc.passwordHash);
  });

  it("2. Successfully logs in using the exact same credentials created during registration", async () => {
    // Step A: Register
    const regRes = await request(app)
      .post("/api/seller/register")
      .send(testSellerPayload);

    const sellerId = regRes.body.id;

    // Step B: Admin approves seller
    await request(app)
      .post(`/api/admin/vendors/${sellerId}/approve`)
      .set("x-admin-key", "dev-admin-key")
      .send();

    // Step C: Login with exact registered credentials
    const loginRes = await request(app)
      .post("/api/seller/login")
      .send({
        email: testSellerPayload.email,
        password: testSellerPayload.password,
      });

    if (loginRes.status !== 200) console.log("Login error body:", loginRes.body);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body).toHaveProperty("token");
    expect(loginRes.body.user).toMatchObject({
      email: testSellerPayload.email,
      role: "seller",
    });
    expect(loginRes.body.vendor).toHaveProperty("name", testSellerPayload.name);
  });

  it("3. Rejects login with invalid password", async () => {
    await request(app)
      .post("/api/seller/register")
      .send(testSellerPayload);

    const loginRes = await request(app)
      .post("/api/seller/login")
      .send({
        email: testSellerPayload.email,
        password: "WrongPassword123!",
      });

    expect(loginRes.status).toBe(401);
    expect(loginRes.body.success).toBe(false);
    expect(loginRes.body.error).toMatch(/Invalid (ID|email) or Password/i);
  });

  it("4. Allows seller login using Seller ID as the identifier", async () => {
    const regRes = await request(app)
      .post("/api/seller/register")
      .send(testSellerPayload);

    const sellerId = regRes.body.id;

    // Admin approves seller
    await request(app)
      .post(`/api/admin/vendors/${sellerId}/approve`)
      .set("x-admin-key", "dev-admin-key")
      .send();

    const loginRes = await request(app)
      .post("/api/seller/login")
      .send({
        identifier: sellerId,
        password: testSellerPayload.password,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body).toHaveProperty("token");
  });
});
