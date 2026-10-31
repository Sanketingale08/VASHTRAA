import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db, vendorSettlementsTable, vendorsTable, mongoVendors } from "@workspace/db";
import { signAccessToken } from "../lib/jwt";

describe("Phase 2 API Endpoints & Pricing Engine Integration", () => {
  const sellerAId = "vendor-seller-a-id";
  const sellerBId = "vendor-seller-b-id";

  const tokenSellerA = signAccessToken({ sub: sellerAId, role: "seller", email: "sellera@example.com", sid: "session-a" });
  const tokenSellerB = signAccessToken({ sub: sellerBId, role: "seller", email: "sellerb@example.com", sid: "session-b" });

  const adminKey = "Admin@123";

  beforeAll(async () => {
    try {
      await mongoVendors.insert({
        id: sellerAId,
        ownerId: sellerAId,
        vendorId: sellerAId,
        sellerId: sellerAId,
        name: "Seller A Handlooms",
        contactEmail: "sellera@example.com",
        status: "approved",
      } as any).catch(() => {});

      await mongoVendors.insert({
        id: sellerBId,
        ownerId: sellerBId,
        vendorId: sellerBId,
        sellerId: sellerBId,
        name: "Seller B Crafts",
        contactEmail: "sellerb@example.com",
        status: "approved",
      } as any).catch(() => {});

      await db.insert(vendorsTable).values([
        {
          id: sellerAId,
          name: "Seller A Handlooms",
          contactEmail: "sellera@example.com",
          status: "approved",
          ownerId: sellerAId,
        },
        {
          id: sellerBId,
          name: "Seller B Crafts",
          contactEmail: "sellerb@example.com",
          status: "approved",
          ownerId: sellerBId,
        },
      ]).onConflictDoNothing();

      await db.insert(vendorSettlementsTable).values([
        {
          vendorId: sellerAId,
          type: "order_settlement",
          status: "pending",
          amount: 40050,
          sellerBasePrice: 50000,
          platformCommission: 9000,
          shippingFee: 10000,
          taxableAmount: 69000,
          gstRateBps: 500,
          gstAmount: 3450,
          cgst: 1725,
          sgst: 1725,
          igst: 0,
          customerPays: 72450,
          gstOnCommission: 450,
          tcsDeduction: 500,
          sellerSettlement: 40050,
          commissionBps: 1800,
          commissionGstBps: 500,
          tcsBps: 100,
        },
        {
          vendorId: sellerBId,
          type: "order_settlement",
          status: "paid",
          amount: 80100,
          sellerBasePrice: 100000,
          platformCommission: 18000,
          shippingFee: 10000,
          taxableAmount: 128000,
          gstRateBps: 500,
          gstAmount: 6400,
          cgst: 3200,
          sgst: 3200,
          igst: 0,
          customerPays: 134400,
          gstOnCommission: 900,
          tcsDeduction: 1000,
          sellerSettlement: 80100,
          commissionBps: 1800,
          commissionGstBps: 500,
          tcsBps: 100,
        },
      ]).onConflictDoNothing();
    } catch {}
  });

  describe("POST /api/pricing/quote", () => {
    it("returns 401 if unauthenticated", async () => {
      const res = await request(app)
        .post("/api/pricing/quote")
        .send({ basePrice: 1000 });

      expect(res.status).toBe(401);
    });

    it("returns full financial quote breakdown in paise and rupees for seller", async () => {
      const res = await request(app)
        .post("/api/pricing/quote")
        .set("Authorization", `Bearer ${tokenSellerA}`)
        .send({ basePrice: 1000, shipping: 100 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Integer paise
      expect(res.body.paise.pricingVersion).toBe("v2");
      expect(res.body.paise.sellerBasePrice).toBe(100000);
      expect(res.body.paise.platformCommission).toBe(18000);
      expect(res.body.paise.customerPays).toBe(115500);
      expect(res.body.paise.sellerSettlement).toBe(80100);
      expect(res.body.paise.platformKeeps).toBe(18900);

      // Formatted rupees
      expect(res.body.rupees.pricingVersion).toBe("v2");
      expect(res.body.rupees.sellerBasePrice).toBe(1000);
      expect(res.body.rupees.platformCommission).toBe(180);
      expect(res.body.rupees.customerPays).toBe(1155);
      expect(res.body.rupees.sellerSettlement).toBe(801);
      expect(res.body.rupees.platformKeeps).toBe(189);
    });
  });

  describe("GET /api/seller/settlements - Security & Isolation", () => {
    it("proves Seller A cannot read Seller B's settlements", async () => {
      const resA = await request(app)
        .get("/api/seller/settlements")
        .set("Authorization", `Bearer ${tokenSellerA}`);

      expect(resA.status).toBe(200);
      const settlementsA = resA.body.settlements || [];
      expect(settlementsA.every((s: any) => s.vendorId === sellerAId)).toBe(true);
      expect(settlementsA.some((s: any) => s.vendorId === sellerBId)).toBe(false);

      // Seller A passing vendorId query parameter of Seller B cannot bypass isolation
      const resBypassed = await request(app)
        .get(`/api/seller/settlements?vendorId=${sellerBId}`)
        .set("Authorization", `Bearer ${tokenSellerA}`);

      expect(resBypassed.status).toBe(200);
      const settlementsBypassed = resBypassed.body.settlements || [];
      expect(settlementsBypassed.some((s: any) => s.vendorId === sellerBId)).toBe(false);
    });

    it("returns Seller B's own settlements when Seller B calls API", async () => {
      const resB = await request(app)
        .get("/api/seller/settlements")
        .set("Authorization", `Bearer ${tokenSellerB}`);

      expect(resB.status).toBe(200);
      const settlementsB = resB.body.settlements || [];
      expect(settlementsB.every((s: any) => s.vendorId === sellerBId)).toBe(true);
      expect(settlementsB.some((s: any) => s.vendorId === sellerAId)).toBe(false);
    });
  });

  describe("Admin Financial Endpoints", () => {
    it("GET /api/admin/financials/summary returns GMV, commission, GST, TCS stats", async () => {
      const res = await request(app)
        .get("/api/admin/financials/summary")
        .set("x-admin-key", adminKey);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary).toHaveProperty("gmv");
      expect(res.body.summary).toHaveProperty("totalCommission");
      expect(res.body.summary).toHaveProperty("gstCollected");
      expect(res.body.summary).toHaveProperty("tcs");
      expect(res.body.summary).toHaveProperty("pendingSettlements");
      expect(res.body.summary).toHaveProperty("completedSettlements");
    });

    it("GET /api/admin/financials/ledger returns paginated audit ledger", async () => {
      const res = await request(app)
        .get("/api/admin/financials/ledger?page=1&limit=10")
        .set("x-admin-key", adminKey);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.ledger)).toBe(true);
      expect(res.body).toHaveProperty("total");
      expect(res.body.page).toBe(1);
    });
  });
});
