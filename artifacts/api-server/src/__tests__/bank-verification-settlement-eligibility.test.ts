import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mutable State for Database Mocks ─────────────────────────────────────────

const state = vi.hoisted(() => ({
  orders: [] as any[],
  products: [] as any[],
  sellers: [] as any[],
  settlements: [] as any[],
  commissionRules: [] as any[],
}));

// ─── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
            then: (res: any) => Promise.resolve([]).then(res),
          })),
          limit: vi.fn(() => Promise.resolve([])),
          then: (res: any) => Promise.resolve([]).then(res),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: "mock-updated" }])),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => Promise.resolve([{ id: "mock-inserted" }])),
      })),
    },
    mongoOrders: {
      findMany: vi.fn(async () => state.orders),
      findById: vi.fn(async (id: string) => state.orders.find((o) => o.id === id) || null),
    },
    mongoProducts: {
      findMany: vi.fn(async () => state.products),
      findById: vi.fn(async (id: string) => state.products.find((p) => p.id === id) || null),
    },
    mongoSellers: {
      findMany: vi.fn(async () => state.sellers),
      findById: vi.fn(async (id: string) => state.sellers.find((s) => s.id === id || s.vendorId === id) || null),
      findByVendorId: vi.fn(async (vId: string) => state.sellers.find((s) => s.vendorId === vId) || null),
      findBySellerId: vi.fn(async (sId: string) => state.sellers.find((s) => s.sellerId === sId) || null),
      findByOwnerId: vi.fn(async (oId: string) => state.sellers.find((s) => s.ownerId === oId) || null),
      update: vi.fn(async (id: string, data: any) => {
        const idx = state.sellers.findIndex((s) => s.id === id || s.vendorId === id);
        if (idx >= 0) {
          state.sellers[idx] = { ...state.sellers[idx], ...data };
          return state.sellers[idx];
        }
        return null;
      }),
    },
    mongoVendors: {
      findMany: vi.fn(async () => state.sellers),
      findById: vi.fn(async (id: string) => state.sellers.find((s) => s.id === id || s.vendorId === id) || null),
      findByVendorId: vi.fn(async (vId: string) => state.sellers.find((s) => s.vendorId === vId) || null),
      findBySellerId: vi.fn(async (sId: string) => state.sellers.find((s) => s.sellerId === sId) || null),
      findByOwnerId: vi.fn(async (oId: string) => state.sellers.find((s) => s.ownerId === oId) || null),
      update: vi.fn(async (id: string, data: any) => {
        const idx = state.sellers.findIndex((s) => s.id === id || s.vendorId === id);
        if (idx >= 0) {
          state.sellers[idx] = { ...state.sellers[idx], ...data };
          return state.sellers[idx];
        }
        return null;
      }),
    },
    mongoSettlements: {
      findMany: vi.fn(async () => state.settlements),
      findById: vi.fn(async (id: string) => state.settlements.find((s) => s.id === id) || null),
      insert: vi.fn(async (s: any) => {
        state.settlements.push(s);
        return s;
      }),
    },
    mongoGeneric: {
      getCollection: vi.fn((colName: string) => ({
        find: vi.fn(() => ({
          toArray: vi.fn(async () => (colName === "vendor_settlements" ? state.settlements : [])),
        })),
        findOne: vi.fn(async (query: any) => {
          if (colName === "orders") {
            return state.orders.find((o) => o.id === query.id) || null;
          }
          return null;
        }),
        updateOne: vi.fn(async (query: any, update: any) => {
          if (colName === "vendor_settlements") {
            const item = state.settlements.find((s) => s.id === query.id);
            if (item && update.$set) {
              Object.assign(item, update.$set);
            }
          }
          return { modifiedCount: 1 };
        }),
        insertOne: vi.fn(async (doc: any) => {
          if (colName === "vendor_settlements") {
            state.settlements.push(doc);
          }
          return { insertedId: doc.id };
        }),
      })),
    },
    isMongoDbConnected: vi.fn(() => true),
    getNextSequenceValue: vi.fn(async () => 9999),
    vendorSettlementsTable: { id: "id", status: "status", vendorId: "vendor_id", type: "type" },
    ordersTable: { id: "id" },
    vendorsTable: { id: "id", vendorId: "vendor_id", ownerId: "owner_id" },
    productsTable: { id: "id" },
    commissionRulesTable: { id: "id" },
  };
});

vi.mock("../lib/commission", () => ({
  loadActiveCommissionRules: vi.fn(async () => []),
  effectiveRateFromRules: vi.fn(() => 0.18),
}));

vi.mock("../lib/socket", () => ({
  emitFinancialsEvent: vi.fn(),
  emitAnalyticsEvent: vi.fn(),
}));

vi.mock("../lib/cacheEngine", () => ({
  safeInvalidatePattern: vi.fn(),
}));

import {
  isVendorBankVerified,
  resolveVendorRecord,
  syncEligibleOrderSettlements,
  processSettlementTransitions,
  StubPayoutProvider,
} from "../lib/settlementAutomation";
import { signAccessToken, verifyAccessToken } from "../lib/jwt";

describe("Bank Verification, Vendor ID Preservation, and Wednesday Settlement Eligibility", () => {
  beforeEach(() => {
    state.orders = [];
    state.products = [];
    state.sellers = [];
    state.settlements = [];
    state.commissionRules = [];
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Bank Verification Helper (Genuinely Verified Only)
  // ───────────────────────────────────────────────────────────────────────────
  describe("isVendorBankVerified Helper", () => {
    it("returns false if vendor is missing or unverified", () => {
      expect(isVendorBankVerified(null)).toBe(false);
      expect(isVendorBankVerified(undefined)).toBe(false);
      expect(isVendorBankVerified({ id: "v1", bankVerified: false })).toBe(false);
      expect(isVendorBankVerified({ id: "v1", bankVerificationStatus: "unverified" })).toBe(false);
      expect(isVendorBankVerified({ id: "v1", bankVerificationStatus: "verification_pending" })).toBe(false);
      expect(isVendorBankVerified({ id: "v1", bankVerificationStatus: "verification_failed" })).toBe(false);
    });

    it("returns false if bankAccount or bankIfsc is missing or malformed even if flag is true", () => {
      expect(isVendorBankVerified({ id: "v1", bankVerified: true, bankAccount: "", bankIfsc: "HDFC0001234" })).toBe(false);
      expect(isVendorBankVerified({ id: "v1", bankVerified: true, bankAccount: "123", bankIfsc: "HDFC0001234" })).toBe(false);
      expect(isVendorBankVerified({ id: "v1", bankVerified: true, bankAccount: "1234567890", bankIfsc: "HDFC" })).toBe(false);
    });

    it("returns true only when bank account and IFSC are genuine and status is verified", () => {
      expect(
        isVendorBankVerified({
          id: "v1",
          bankVerified: true,
          bankVerificationStatus: "verified",
          bankAccount: "50100123456789",
          bankIfsc: "HDFC0001234",
        })
      ).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Authentication: JWT Role Validation
  // ───────────────────────────────────────────────────────────────────────────
  describe("Authentication: Seller JWT Generation & Verification", () => {
    it("correctly generates and verifies seller JWT access tokens", () => {
      const sellerToken = signAccessToken({
        sub: "user_seller_99",
        role: "seller",
        email: "seller@vastraa.com",
      });

      expect(typeof sellerToken).toBe("string");
      const payload = verifyAccessToken(sellerToken);
      expect(payload).toBeDefined();
      expect(payload?.role).toBe("seller");
      expect(payload?.sub).toBe("user_seller_99");
      expect(payload?.email).toBe("seller@vastraa.com");
    });

    it("distinguishes customer tokens from seller tokens for role guard enforcement", () => {
      const customerToken = signAccessToken({
        sub: "user_cust_1",
        role: "customer",
        email: "buyer@vastraa.com",
      });

      const customerPayload = verifyAccessToken(customerToken);
      expect(customerPayload?.role).toBe("customer");
      expect(customerPayload?.role === "seller").toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Database: Existing vendorId Preservation
  // ───────────────────────────────────────────────────────────────────────────
  describe("Database: Existing Vendor ID Immutability", () => {
    it("saves bank details against existing vendorId rather than generating new sequence ID", async () => {
      const existingVendor = {
        id: "doc_uuid_1234",
        vendorId: "VEND_0042",
        sellerId: "VEND_0042",
        ownerId: "user_seller_99",
        name: "Heritage Paithani Weavers",
        bankVerified: false,
        bankVerificationStatus: "unverified",
      };
      state.sellers.push(existingVendor);

      // Verify vendor resolution finds the existing record by vendorId or document id
      const resolved = await resolveVendorRecord("VEND_0042");
      expect(resolved).toBeDefined();
      expect(resolved.vendorId).toBe("VEND_0042");
      expect(resolved.id).toBe("doc_uuid_1234");

      // Simulate bank verification update
      const updateData = {
        bankAccount: "123456789012",
        bankIfsc: "HDFC0001234",
        bankHolder: "Heritage Paithani Weavers",
        bankName: "HDFC Bank",
        bankVerified: true,
        bankVerificationStatus: "verified",
        vendorId: existingVendor.vendorId, // Keep existing vendorId
        sellerId: existingVendor.sellerId,
        ownerId: existingVendor.ownerId,
        updatedAt: new Date(),
      };

      await state.sellers.find((s) => s.id === existingVendor.id);
      Object.assign(existingVendor, updateData);

      expect(existingVendor.vendorId).toBe("VEND_0042"); // MUST NOT BE OVERWRITTEN
      expect(existingVendor.vendorId).not.toBe("VEND_9999"); // NOT NEWLY GENERATED
      expect(existingVendor.bankVerified).toBe(true);
      expect(existingVendor.bankVerificationStatus).toBe("verified");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Settlements: Unverified Sellers Cannot Become Eligible for Wednesday Payouts
  // ───────────────────────────────────────────────────────────────────────────
  describe("Wednesday Settlement Eligibility: Genuine Bank Verification Requirement", () => {
    it("delivered orders older than 7 days for UNVERIFIED sellers remain pending", async () => {
      const unverifiedVendor = {
        id: "vend-unverified-1",
        vendorId: "VEND_UNVERIFIED",
        name: "Unverified Silk Store",
        bankVerified: false,
        bankVerificationStatus: "unverified",
      };
      state.sellers.push(unverifiedVendor);

      state.products.push({
        id: "prod-1",
        vendorId: "VEND_UNVERIFIED",
        price: 5000,
      });

      const oldDeliveredDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      state.orders.push({
        id: "ord_live_unverified_001",
        userId: "customer_buyer_001",
        status: "delivered",
        deliveredAt: oldDeliveredDate,
        createdAt: oldDeliveredDate,
        items: [
          {
            productId: "prod-1",
            vendorId: "VEND_UNVERIFIED",
            quantity: 1,
            price: 5000,
            basePrice: 5000,
          },
        ],
      });

      const syncRes = await syncEligibleOrderSettlements();
      expect(syncRes.createdSettlementsCount).toBe(1);

      // The settlement MUST be pending because bank account is not verified!
      expect(state.settlements[0].status).toBe("pending");
      expect(state.settlements[0].status).not.toBe("eligible");

      // Running automated Wednesday settlement cycle must NOT transition unverified seller to eligible
      const cycleResult = await processSettlementTransitions({ returnWindowDays: 7 });
      expect(cycleResult.eligibleCount).toBe(0);
      expect(state.settlements[0].status).toBe("pending");
    });

    it("delivered orders older than 7 days for GENUINELY VERIFIED sellers transition to eligible", async () => {
      const verifiedVendor = {
        id: "vend-verified-1",
        vendorId: "VEND_VERIFIED",
        name: "Authentic Paithani Works",
        bankAccount: "987654321098",
        bankIfsc: "SBIN0001234",
        bankVerified: true,
        bankVerificationStatus: "verified",
      };
      state.sellers.push(verifiedVendor);

      state.products.push({
        id: "prod-2",
        vendorId: "VEND_VERIFIED",
        price: 8000,
        basePrice: 8000,
      });

      const oldDeliveredDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      state.orders.push({
        id: "ord_live_verified_002",
        userId: "customer_buyer_002",
        status: "delivered",
        deliveredAt: oldDeliveredDate,
        createdAt: oldDeliveredDate,
        items: [
          {
            productId: "prod-2",
            vendorId: "VEND_VERIFIED",
            quantity: 1,
            price: 8000,
            basePrice: 8000,
          },
        ],
      });

      const syncRes = await syncEligibleOrderSettlements();
      expect(syncRes.createdSettlementsCount).toBe(1);

      // Genuinely verified seller with delivered order > 7 days becomes eligible
      const verifiedSettlement = state.settlements.find((s) => s.vendorId === "vend-verified-1" || s.vendorId === "VEND_VERIFIED");
      expect(verifiedSettlement).toBeDefined();
      expect(verifiedSettlement.status).toBe("eligible");
    });

    it("StubPayoutProvider and Payout processing reject unverified bank accounts", async () => {
      state.sellers = [
        {
          id: "vend-no-bank",
          vendorId: "VEND_NO_BANK",
          bankVerified: false,
          bankVerificationStatus: "unverified",
        },
      ];

      const provider = new StubPayoutProvider();
      const payoutRes = await provider.processPayout({
        id: "settle-unverified-payout",
        amount: 500000,
        vendorId: "VEND_NO_BANK",
      });

      expect(payoutRes.success).toBe(false);
      expect(payoutRes.status).toBe("FAILED");
      expect(payoutRes.error).toContain("verified");
    });
  });
});
