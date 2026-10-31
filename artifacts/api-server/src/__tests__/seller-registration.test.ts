import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const insertAdminNotificationMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mongoSellersInsertMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "vendor-123" }));
const mongoSellersFindByOwnerIdMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mongoSellersFindByEmailMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: insertAdminNotificationMock,
}));

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
          returning: vi.fn(() => Promise.resolve([{ id: "vendor-123", name: vals?.name || "Royal Heritage Silks", status: vals?.status || "pending" }])),
        })),
      })),
    },
    vendorsTable: tag("vendors", ["id", "name", "location", "status", "ownerId", "mobile", "panNumber", "panCardUrl", "bankHolder", "bankName", "bankAccount", "bankIfsc", "shopCity", "shopState", "shopPincode", "contactEmail"]),
    productsTable: tag("products", ["id", "vendorId"]),
    ordersTable: tag("orders", ["id", "status"]),
    mongoSellers: {
      findByOwnerId: mongoSellersFindByOwnerIdMock,
      findByEmail: mongoSellersFindByEmailMock,
      insert: mongoSellersInsertMock,
    },
    mongoR2Assets: {
      findByObjectKey: vi.fn().mockResolvedValue(null),
      saveAsset: vi.fn().mockResolvedValue(undefined),
    },
    mongoVendors: {
      findById: vi.fn().mockResolvedValue(null),
    },
    mongoProducts: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    mongoOrders: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    isMongoDbConnected: vi.fn().mockReturnValue(true),
  };
});

vi.mock("../middlewares/isAuthenticated", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = req.userId || "user_test_123";
    next();
  },
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: function () {
    return {
      trySetObjectEntityAclPolicy: vi.fn().mockResolvedValue(undefined),
    };
  },
}));

vi.mock("../lib/sellerVerification", () => ({
  consumeSellerEmailVerification: vi.fn(),
}));

import vendorsRouter from "../routes/vendors";

describe("POST /api/seller/register - Seller Registration", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api", vendorsRouter);
  });

  const validPayload = {
    name: "Royal Heritage Silks",
    location: "Varanasi, UP",
    mobile: "9876543210",
    panNumber: "ABCDE1234F",
    panCardUrl: "/storage/private/kyc/pan.pdf",
    bankHolder: "Test Seller",
    bankName: "State Bank of India",
    bankAccount: "123456789012",
    bankIfsc: "SBIN0001234",
    shopCity: "Varanasi",
    shopState: "Uttar Pradesh",
    shopPincode: "221001",
    termsAccepted: true,
    contactEmail: "seller@example.com",
  };

  it("successfully creates a vendor account", async () => {
    const res = await request(app)
      .post("/api/seller/register")
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id", "vendor-123");
    expect(res.body).toHaveProperty("name", "Royal Heritage Silks");
    expect(res.body.status).toBeDefined();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/seller/register")
      .send({ ...validPayload, name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Shop name");
  });

  it("succeeds even if admin notification fails", async () => {
    insertAdminNotificationMock.mockRejectedValueOnce(new Error("Notification DB error"));

    const res = await request(app)
      .post("/api/seller/register")
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
  });
});
