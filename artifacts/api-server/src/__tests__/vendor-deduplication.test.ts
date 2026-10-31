import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../lib/adminNotification", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorApprovalEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorSuspensionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  consumeSellerEmailVerification: vi.fn(),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    trySetObjectEntityAclPolicy = vi.fn().mockResolvedValue(undefined);
  },
  objectStorage: {
    trySetObjectEntityAclPolicy: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (_req: any, _res: any, next: any) => next(),
}));

import { mongoSellers, setMongoConnected } from "@workspace/db";
import vendorsRouter from "../routes/vendors.js";

const app = express();
app.use(express.json());
app.use("/api", vendorsRouter);

describe("Vendor Deduplication & Admin Listing", () => {
  beforeEach(async () => {
    setMongoConnected(false);
    vi.restoreAllMocks();
  });

  it("mongoSellers.findMany returns deduplicated seller records", async () => {
    const email = "unique_shop@example.com";
    await mongoSellers.insert({
      name: "Unique Saree Shop",
      email,
      contactEmail: email,
      status: "approved",
    });

    const allSellers = await mongoSellers.findMany({});
    const matching = allSellers.filter(
      (s) => (s.email || "").toLowerCase() === email || (s.contactEmail || "").toLowerCase() === email
    );

    expect(matching.length).toBe(1);
    expect(matching[0].name).toBe("Unique Saree Shop");
  });

  it("mongoSellers.insert updates existing seller record instead of creating duplicates", async () => {
    const email = "dup_test_shop@example.com";

    const seller1 = await mongoSellers.insert({
      name: "Original Shop",
      email,
      contactEmail: email,
      status: "pending",
    });

    const seller2 = await mongoSellers.insert({
      name: "Updated Shop Name",
      email,
      contactEmail: email,
      status: "approved",
    });

    expect(seller2.id).toBe(seller1.id);
    expect(seller2.name).toBe("Updated Shop Name");

    const allSellers = await mongoSellers.findMany({});
    const matching = allSellers.filter(
      (s) => (s.email || "").toLowerCase() === email || (s.contactEmail || "").toLowerCase() === email
    );

    expect(matching.length).toBe(1);
  });

  it("GET /api/admin/vendors returns only one entry per vendor account/email", async () => {
    const email = "abc_sarees@example.com";

    await mongoSellers.insert({
      id: "vend-abc-1",
      name: "ABC Sarees",
      email,
      contactEmail: email,
      vendorId: "TDV000100",
      status: "approved",
    });

    // Insert duplicate entry with same email to test deduplication in API
    await mongoSellers.insert({
      id: "vend-abc-dup",
      name: "ABC Sarees",
      email,
      contactEmail: email,
      vendorId: "TDV000100",
      status: "approved",
    });

    const res = await request(app)
      .get("/api/admin/vendors");

    expect(res.status).toBe(200);
    expect(res.body.vendors).toBeDefined();

    const abcVendors = res.body.vendors.filter(
      (v: any) => (v.contactEmail || v.email || "").toLowerCase() === email
    );

    expect(abcVendors.length).toBe(1);
    expect(abcVendors[0].name).toBe("ABC Sarees");
    expect(abcVendors[0].status).toBe("approved");
  });

  it("re-registering vendor with same email returns 409 Conflict and prevents duplicate creation", async () => {
    const email = "existing_vendor@example.com";

    await mongoSellers.insert({
      id: "vend-exist-1",
      name: "Existing Store",
      email,
      contactEmail: email,
      ownerId: "owner-exist-123",
      status: "pending",
    });

    const regRes = await request(app)
      .post("/api/seller/register")
      .send({
        shopName: "Duplicate Attempt Store",
        email: email,
        contactEmail: email,
        mobile: "9876543210",
        location: "Kanchipuram, Tamil Nadu",
        panNumber: "ABCDE1234F",
        panCardUrl: "https://example.com/pan.png",
        bankHolder: "Store Owner",
        bankName: "HDFC Bank",
        bankAccount: "1234567890",
        bankIfsc: "HDFC0001234",
        shopCity: "Kanchipuram",
        shopState: "Tamil Nadu",
        shopPincode: "631501",
        termsAccepted: true,
      });

    expect(regRes.status).toBe(409);
    expect(regRes.body.error).toMatch(/already/i);
  });
});
