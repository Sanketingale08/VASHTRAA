import { describe, it, expect } from "vitest";
import { getCanonicalSellerId, isInternalRawId, formatVendorId } from "@workspace/db";
import { mongoSellers } from "@workspace/db";

describe("Seller ID Consistency Across All Portals", () => {
  describe("getCanonicalSellerId Helper & ID Verification", () => {
    it("identifies raw UUIDs and raw ObjectIds as internal raw IDs", () => {
      expect(isInternalRawId("b192305a-4b92-411a-8bb8-123456789abc")).toBe(true);
      expect(isInternalRawId("65e3b2c1f4a9b8e7d6c5b4a3")).toBe(true);
      expect(isInternalRawId("TDV000042")).toBe(false);
      expect(isInternalRawId("VASTRAA-SELLER-00123")).toBe(false);
      expect(isInternalRawId("VEND_SELLER_01")).toBe(false);
      expect(isInternalRawId("")).toBe(false);
      expect(isInternalRawId(null)).toBe(false);
    });

    it("extracts formatted canonical sellerId over internal raw UUID id", () => {
      const vendorRecord = {
        id: "b192305a-4b92-411a-8bb8-123456789abc",
        vendorId: "TDV000123",
        sellerId: "TDV000123",
        shopName: "Kanchipuram Silks",
      };
      expect(getCanonicalSellerId(vendorRecord)).toBe("TDV000123");
    });

    it("prioritizes formatted vendorId if sellerId is a raw UUID", () => {
      const record = {
        id: "b192305a-4b92-411a-8bb8-123456789abc",
        sellerId: "b192305a-4b92-411a-8bb8-123456789abc",
        vendorId: "TDV000456",
      };
      expect(getCanonicalSellerId(record)).toBe("TDV000456");
    });

    it("prioritizes formatted sellerId if vendorId is a raw UUID", () => {
      const record = {
        id: "b192305a-4b92-411a-8bb8-123456789abc",
        sellerId: "TDV000789",
        vendorId: "b192305a-4b92-411a-8bb8-123456789abc",
      };
      expect(getCanonicalSellerId(record)).toBe("TDV000789");
    });

    it("handles string input directly", () => {
      expect(getCanonicalSellerId("TDV000999")).toBe("TDV000999");
    });
  });

  describe("Repository Permanence & Immutability", () => {
    it("generates a canonical formatted Seller ID on insert if none is provided", async () => {
      const uniqueEmail = `seller_${Date.now()}@testvashtraa.com`;
      const created = await mongoSellers.insert({
        shopName: "Royal Paithani Emporium",
        email: uniqueEmail,
        status: "pending",
      });

      expect(created.vendorId).toBeDefined();
      expect(created.sellerId).toBeDefined();
      expect(created.vendorId).toMatch(/^TDV\d{6}$/);
      expect(created.sellerId).toBe(created.vendorId);
    });

    it("retains the exact same Seller ID across account status updates (suspend / reactivate)", async () => {
      const uniqueEmail = `immutable_${Date.now()}@testvashtraa.com`;
      const original = await mongoSellers.insert({
        shopName: "Heritage Weaves",
        email: uniqueEmail,
        status: "approved",
      });

      const initialSellerId = original.sellerId;
      const initialVendorId = original.vendorId;
      expect(initialSellerId).toMatch(/^TDV\d{6}$/);

      // Admin suspends the seller
      const suspended = await mongoSellers.update(original.id, {
        status: "suspended",
        statusReason: "KYC document expired",
      });

      expect(suspended?.sellerId).toBe(initialSellerId);
      expect(suspended?.vendorId).toBe(initialVendorId);

      // Admin reactivates the seller
      const reactivated = await mongoSellers.update(original.id, {
        status: "active",
        statusReason: null,
      });

      expect(reactivated?.sellerId).toBe(initialSellerId);
      expect(reactivated?.vendorId).toBe(initialVendorId);
      expect(reactivated?.status).toBe("active");
    });

    it("prevents overwriting canonical Seller ID even if update payload passes a raw UUID", async () => {
      const uniqueEmail = `protected_${Date.now()}@testvashtraa.com`;
      const original = await mongoSellers.insert({
        shopName: "Banarasi Silks Co",
        email: uniqueEmail,
        status: "approved",
      });

      const canonicalId = original.sellerId;

      const updated = await mongoSellers.update(original.id, {
        shopName: "Banarasi Silks Deluxe",
        vendorId: "c2834571-0000-4000-8000-000000000000",
        sellerId: "c2834571-0000-4000-8000-000000000000",
      } as any);

      // The canonical ID must be protected from being overwritten with a raw UUID
      expect(updated?.sellerId).toBe(canonicalId);
      expect(updated?.vendorId).toBe(canonicalId);
    });
  });
});
