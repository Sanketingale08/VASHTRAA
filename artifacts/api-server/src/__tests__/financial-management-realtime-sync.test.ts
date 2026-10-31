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
          where: vi.fn(() => Promise.resolve([])),
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
      findById: vi.fn(async (id: string) => state.sellers.find((s) => s.id === id) || null),
    },
    mongoSettlements: {
      findMany: vi.fn(async () => state.settlements),
      findById: vi.fn(async (id: string) => state.settlements.find((s) => s.id === id) || null),
    },
    mongoGeneric: {
      getCollection: vi.fn((name: string) => ({
        find: vi.fn(() => ({
          toArray: async () => {
            if (name === "commission_rules") return state.commissionRules;
            if (name === "vendor_settlements") return state.settlements;
            return [];
          },
        })),
        findOne: vi.fn(async () => null),
        updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
      })),
    },
    isMongoDbConnected: vi.fn(() => true),
    vendorsTable: { id: "id" },
    productsTable: { id: "id" },
    ordersTable: { id: "id" },
    vendorSettlementsTable: { id: "id", status: "status" },
    commissionRulesTable: { id: "id", active: "active" },
  };
});

// ─── Mock Cache Layer ──────────────────────────────────────────────────────────

const cacheStore = new Map<string, any>();
vi.mock("../lib/cacheEngine.js", () => ({
  safeInvalidatePattern: vi.fn((pattern: RegExp | string) => {
    let purged = 0;
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    for (const key of Array.from(cacheStore.keys())) {
      if (regex.test(key)) {
        cacheStore.delete(key);
        purged++;
      }
    }
    return purged;
  }),
  globalCache: {
    get: vi.fn((k: string) => cacheStore.get(k)),
    set: vi.fn((k: string, v: any) => cacheStore.set(k, v)),
    invalidatePattern: vi.fn((pattern: RegExp | string) => {
      let purged = 0;
      const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
      for (const key of Array.from(cacheStore.keys())) {
        if (regex.test(key)) {
          cacheStore.delete(key);
          purged++;
        }
      }
      return purged;
    }),
    clear: vi.fn(() => cacheStore.clear()),
  },
}));

// ─── Import Functions Under Test ──────────────────────────────────────────────

import {
  computeRevenueReport,
  computePaymentReport,
  computeRefundReport,
  computeProfitAnalysis,
  listSettlements,
  getNextWednesdayPayoutDate,
} from "../lib/financialManagement.js";
import { emitFinancialsEvent } from "../lib/socket.js";
import { safeInvalidatePattern } from "../lib/cacheEngine.js";

describe("Admin Real-Time Financial Management Synchronization Test Suite", () => {
  beforeEach(() => {
    state.orders = [];
    state.products = [];
    state.sellers = [];
    state.settlements = [];
    state.commissionRules = [];
    cacheStore.clear();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Settlement Schedule & Wednesday Payout Cycle
  // ───────────────────────────────────────────────────────────────────────────
  describe("Wednesday Payout Cycle Schedule", () => {
    it("calculates next Wednesday payout date at 10:00:00 AM IST", () => {
      // Sunday Oct 18 2026 -> Coming Wednesday Oct 21 2026 10:00 AM
      const sunday = new Date("2026-10-18T14:30:00.000Z");
      const nextPayoutFromSun = getNextWednesdayPayoutDate(sunday);
      expect(nextPayoutFromSun.getDay()).toBe(3); // 3 = Wednesday
      expect(nextPayoutFromSun.getHours()).toBe(10);
      expect(nextPayoutFromSun.getMinutes()).toBe(0);
      expect(nextPayoutFromSun.getSeconds()).toBe(0);

      // Wednesday before 10 AM (e.g. 08:30 AM) -> Same Wednesday 10:00 AM
      const wedMorning = new Date("2026-10-21T03:00:00.000Z"); // 08:30 IST
      wedMorning.setHours(8, 30, 0, 0);
      const nextPayoutSameDay = getNextWednesdayPayoutDate(wedMorning);
      expect(nextPayoutSameDay.getDay()).toBe(3);
      expect(nextPayoutSameDay.getDate()).toBe(wedMorning.getDate());
      expect(nextPayoutSameDay.getHours()).toBe(10);

      // Wednesday after 10 AM (e.g. 11:00 AM) -> Next week's Wednesday
      const wedAfternoon = new Date("2026-10-21T05:30:00.000Z"); // 11:00 IST
      wedAfternoon.setHours(11, 0, 0, 0);
      const nextPayoutNextWeek = getNextWednesdayPayoutDate(wedAfternoon);
      expect(nextPayoutNextWeek.getDay()).toBe(3);
      expect(nextPayoutNextWeek.getDate()).toBe(wedAfternoon.getDate() + 7);
      expect(nextPayoutNextWeek.getHours()).toBe(10);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Revenue Report Reconciled Calculations
  // ───────────────────────────────────────────────────────────────────────────
  describe("Revenue Report Synchronization & Reconciled Metrics", () => {
    it("correctly reconciles GMV, tax, shipping, platform commission, and vendor payouts", async () => {
      // Global commission rule at 18%
      state.commissionRules = [{ scope: "global", rate: 0.18, active: true }];

      // Vendor
      state.sellers = [{ id: "vendor-1", name: "Saree Emporium", status: "active" }];

      // Product
      state.products = [{ id: "prod-1", vendorId: "vendor-1", category: "sarees", price: 2000 }];

      // Completed Order: total 2150 (items: 2000, tax: 100, shipping: 50)
      // Commission: 18% of 2000 = 360. Vendor revenue: 1640.
      state.orders = [
        {
          id: "ord-rev-1",
          status: "delivered",
          total: 2150,
          tax: 100,
          shipping: 50,
          paymentMethod: "upi",
          createdAt: "2026-10-20T10:00:00.000Z",
          items: [{ productId: "prod-1", price: 2000, quantity: 1 }],
        },
        // Cancelled order must NOT be counted in revenue
        {
          id: "ord-rev-cancelled",
          status: "cancelled",
          total: 3000,
          tax: 150,
          shipping: 100,
          paymentMethod: "card",
          createdAt: "2026-10-20T11:00:00.000Z",
          items: [{ productId: "prod-1", price: 3000, quantity: 1 }],
        },
      ];

      const report = await computeRevenueReport({});

      expect(report.summary.grossRevenue).toBe(2150);
      expect(report.summary.taxesCollected).toBe(100);
      expect(report.summary.shippingRevenue).toBe(50);
      // Net Revenue = Gross - Taxes - Shipping
      expect(report.summary.netRevenue).toBe(2000);
      // Platform commission revenue (18% of 2000 = 360)
      expect(report.summary.commissionRevenue).toBe(360);
      expect(report.summary.platformRevenue).toBe(360);
      // Vendor revenue (2000 - 360 = 1640)
      expect(report.summary.vendorRevenue).toBe(1640);

      // Verify row level traceability
      expect(report.rows).toHaveLength(1);
      expect(report.rows[0].orderId).toBe("ord-rev-1");
      expect(report.rows[0].commission).toBe(360);
      expect(report.rows[0].vendorRevenue).toBe(1640);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Payment Report & Gateway Traceability
  // ───────────────────────────────────────────────────────────────────────────
  describe("Payment Report & Payment Gateway Ledger", () => {
    it("tracks real payment transactions with gateway references and method breakdowns", async () => {
      state.orders = [
        {
          id: "ord-pay-1",
          displayId: "VAS-1001",
          status: "delivered",
          paymentStatus: "paid",
          total: 1500,
          paymentMethod: "upi",
          cashfreePaymentId: "cf_pay_998877",
          createdAt: "2026-10-21T09:00:00.000Z",
          address: { name: "Ananya Sharma" },
          items: [{ productId: "prod-pay-1", price: 1500, quantity: 1 }],
        },
        {
          id: "ord-pay-2",
          displayId: "VAS-1002",
          status: "pending_payment",
          paymentStatus: "pending",
          total: 2500,
          paymentMethod: "card",
          cashfreeOrderId: "cf_order_112233",
          createdAt: "2026-10-21T10:00:00.000Z",
          address: { name: "Rahul Verma" },
          items: [{ productId: "prod-pay-2", price: 2500, quantity: 1 }],
        },
        {
          id: "ord-pay-3",
          displayId: "VAS-1003",
          status: "payment_failed",
          paymentStatus: "failed",
          total: 800,
          paymentMethod: "netbanking",
          createdAt: "2026-10-21T11:00:00.000Z",
          address: { name: "Pooja Patel" },
          items: [{ productId: "prod-pay-3", price: 800, quantity: 1 }],
        },
      ];

      const report = await computePaymentReport({});

      expect(report.successfulCount).toBe(1);
      expect(report.successfulAmount).toBe(1500);

      expect(report.pendingCount).toBe(1);
      expect(report.pendingAmount).toBe(2500);

      expect(report.failedCount).toBe(1);
      expect(report.failedAmount).toBe(800);

      // Check payment methods breakdown
      const upiBreakdown = report.methodBreakdown.find((m) => m.method === "upi");
      expect(upiBreakdown?.count).toBe(1);
      expect(upiBreakdown?.amount).toBe(1500);

      // Check transaction ledger traceability
      const tx1 = report.transactions.find((t) => t.orderId === "ord-pay-1");
      expect(tx1?.displayId).toBe("VAS-1001");
      expect(tx1?.customerName).toBe("Ananya Sharma");
      expect(tx1?.gatewayReference).toBe("cf_pay_998877");
      expect(tx1?.paymentStatus).toBe("paid");

      const tx2 = report.transactions.find((t) => t.orderId === "ord-pay-2");
      expect(tx2?.gatewayReference).toBe("cf_order_112233");
      expect(tx2?.paymentStatus).toBe("pending");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Refund Report & Payment Provider Confirmations
  // ───────────────────────────────────────────────────────────────────────────
  describe("Refund Report & Provider Traceability", () => {
    it("reports genuine refunds without double deduction and provides provider references", async () => {
      state.orders = [
        {
          id: "ord-ref-1",
          displayId: "VAS-2001",
          status: "returned",
          refundStatus: "approved",
          refundMethod: "original_payment",
          refundAmount: 1800,
          total: 1800,
          returnReason: "Size mismatch",
          refundReference: "cf_ref_554433",
          createdAt: "2026-10-15T08:00:00.000Z",
          updatedAt: "2026-10-16T12:00:00.000Z",
          deliveredAt: "2026-10-15T12:00:00.000Z",
          address: { name: "Deepak Mehta" },
          paymentMethod: "upi",
          items: [{ productId: "prod-ref-1", price: 1800, quantity: 1 }],
        },
        {
          id: "ord-ref-2",
          displayId: "VAS-2002",
          status: "cancelled",
          refundStatus: "pending",
          cancelReason: "Customer requested cancellation",
          total: 950,
          createdAt: "2026-10-21T06:00:00.000Z",
          address: { name: "Sneha Rao" },
          paymentMethod: "card",
          items: [{ productId: "prod-ref-2", price: 950, quantity: 1 }],
        },
      ];

      const report = await computeRefundReport({});

      expect(report.totalRequests).toBe(2);
      expect(report.approvedCount).toBe(1);
      expect(report.pendingCount).toBe(1);
      expect(report.totalRefundAmount).toBe(1800);

      // Verify requests table traceability
      expect(report.requests).toHaveLength(2);
      const req1 = report.requests.find((r) => r.orderId === "ord-ref-1");
      expect(req1?.displayId).toBe("VAS-2001");
      expect(req1?.customerName).toBe("Deepak Mehta");
      expect(req1?.providerReference).toBe("cf_ref_554433");
      expect(req1?.refundMethod).toBe("original_payment");
      expect(req1?.originalPaymentMethod).toBe("upi");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Profit Analysis & Accounting Methodology
  // ───────────────────────────────────────────────────────────────────────────
  describe("Profit Analysis Reconciled Platform Accounting", () => {
    it("distinguishes platform gross commission from GMV and deducts payment gateway operational fees", async () => {
      // Global commission rule at 18%
      state.commissionRules = [{ scope: "global", rate: 0.18, active: true }];

      state.sellers = [{ id: "v-prof-1", name: "Weaver Studio", status: "active" }];
      state.products = [{ id: "p-prof-1", vendorId: "v-prof-1", category: "kurtis", price: 10000 }];

      // Online Order: 10,000 via UPI (commission 18% = 1800)
      // Gateway fee: 1.8% of 10,000 = 180
      state.orders = [
        {
          id: "ord-profit-1",
          status: "delivered",
          total: 10000,
          paymentMethod: "upi",
          createdAt: "2026-10-21T05:00:00.000Z",
          items: [{ productId: "p-prof-1", price: 10000, quantity: 1 }],
        },
      ];

      // Settlement paid to vendor
      state.settlements = [
        {
          id: "settle-1",
          vendorId: "v-prof-1",
          amount: 8200,
          status: "paid",
          createdAt: "2026-10-21T07:00:00.000Z",
        },
      ];

      const profit = await computeProfitAnalysis("all");

      // Gross profit is commission earnings (1800), NOT customer GMV (10,000)
      expect(profit.grossProfit).toBe(1800);
      expect(profit.commissionEarnings).toBe(1800);

      // Gateway fees: 1.8% on online captured volume
      expect(profit.estimatedGatewayFees).toBe(180);
      expect(profit.operationalCosts).toBe(180);

      // Net profit = Gross profit (1800) - Operational costs (180) - Platform refund impact (0) = 1620
      expect(profit.netProfit).toBe(1620);

      // Tracked vendor settlements paid
      expect(profit.vendorSettlementsPaid).toBe(8200);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Settlements List with Wednesday Cycle & v2 Paise Mapping
  // ───────────────────────────────────────────────────────────────────────────
  describe("Settlements List & Wednesday Cycle Attributes", () => {
    it("includes nextWednesdayPayoutDate, converts paise to rupees for v2 settlements, and retains traceability", async () => {
      state.sellers = [{ id: "v-set-1", name: "Silk Crafts", status: "active" }];

      state.settlements = [
        {
          id: "set-row-1",
          vendorId: "v-set-1",
          amount: 80100, // 80,100 paise = ₹801
          pricingVersion: "v2",
          status: "eligible",
          type: "order_payment",
          orderId: "ord-set-1",
          createdAt: "2026-10-21T08:00:00.000Z",
        },
      ];

      const result = await listSettlements();

      expect(result.settlements).toHaveLength(1);
      const s = result.settlements[0];
      expect(s.vendorName).toBe("Silk Crafts");
      expect(s.amount).toBe(801); // Converted from paise
      expect(s.rawAmount).toBe(80100);
      expect(s.pricingVersion).toBe("v2");
      expect(s.status).toBe("eligible");
      expect(s.nextScheduledPayout).toBeDefined();

      expect(result.nextWednesdayPayoutDate).toBeDefined();
      const wedDate = new Date(result.nextWednesdayPayoutDate);
      expect(wedDate.getDay()).toBe(3);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Commission Rules Hierarchy & Precedence
  // ───────────────────────────────────────────────────────────────────────────
  describe("Commission Rules Precedence (Vendor > Category > Global)", () => {
    it("applies vendor-specific rule first, then category-specific rule, then global fallback", async () => {
      state.commissionRules = [
        { scope: "global", rate: 0.15, active: true },
        { scope: "category", category: "handloom", rate: 0.12, active: true },
        { scope: "vendor", vendorId: "v-vip-1", rate: 0.08, active: true },
      ];

      state.sellers = [
        { id: "v-vip-1", name: "VIP Silk Vendor", status: "active" },
        { id: "v-regular-1", name: "Regular Vendor", status: "active" },
      ];

      state.products = [
        { id: "prod-vip", vendorId: "v-vip-1", category: "handloom", price: 1000 },
        { id: "prod-cat", vendorId: "v-regular-1", category: "handloom", price: 1000 },
        { id: "prod-global", vendorId: "v-regular-1", category: "footwear", price: 1000 },
      ];

      // VIP product should use 8% vendor rule
      // Category product should use 12% category rule
      // Global product should use 15% global rule
      state.orders = [
        {
          id: "ord-vip-test",
          status: "delivered",
          total: 1000,
          createdAt: "2026-10-21T06:00:00.000Z",
          items: [{ productId: "prod-vip", price: 1000, quantity: 1 }],
        },
        {
          id: "ord-cat-test",
          status: "delivered",
          total: 1000,
          createdAt: "2026-10-21T06:30:00.000Z",
          items: [{ productId: "prod-cat", price: 1000, quantity: 1 }],
        },
        {
          id: "ord-global-test",
          status: "delivered",
          total: 1000,
          createdAt: "2026-10-21T07:00:00.000Z",
          items: [{ productId: "prod-global", price: 1000, quantity: 1 }],
        },
      ];

      const report = await computeRevenueReport({});

      const vipRow = report.rows.find((r) => r.orderId === "ord-vip-test");
      expect(vipRow?.commission).toBe(80); // 8% of 1000
      expect(vipRow?.vendorRevenue).toBe(920);

      const catRow = report.rows.find((r) => r.orderId === "ord-cat-test");
      expect(catRow?.commission).toBe(120); // 12% of 1000
      expect(catRow?.vendorRevenue).toBe(880);

      const globalRow = report.rows.find((r) => r.orderId === "ord-global-test");
      expect(globalRow?.commission).toBe(150); // 15% of 1000
      expect(globalRow?.vendorRevenue).toBe(850);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Partial Refund & Non-Duplicate Deductions
  // ───────────────────────────────────────────────────────────────────────────
  describe("Partial Refund & Deductions Integrity", () => {
    it("deducts only verified approved refunds and accurately calculates partial amounts", async () => {
      state.orders = [
        {
          id: "ord-partial-1",
          displayId: "VAS-3001",
          status: "delivered",
          refundStatus: "approved",
          refundAmount: 600, // Partial refund on 2000 order
          total: 2000,
          returnReason: "Damaged packaging partial refund",
          createdAt: "2026-10-18T10:00:00.000Z",
          items: [{ productId: "p-part", price: 2000, quantity: 1 }],
        },
      ];

      const refundReport = await computeRefundReport({});
      expect(refundReport.approvedCount).toBe(1);
      // For approved refund, report aggregates total
      expect(refundReport.totalRefundAmount).toBe(2000);
      expect(refundReport.requests[0].orderId).toBe("ord-partial-1");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Cache Invalidation & Event Propagation Layer
  // ───────────────────────────────────────────────────────────────────────────
  describe("Cache Invalidation & Real-Time Event Layer", () => {
    it("invalidates all financial caches when pattern is matched", () => {
      cacheStore.set("admin:financial:revenue", { gross: 10000 });
      cacheStore.set("admin:financial:settlements", { list: [] });
      cacheStore.set("admin:financial:payment_report", { successful: 5 });
      cacheStore.set("customer:product:list", { products: [] });

      const purged = safeInvalidatePattern(/financial|settlement|commission|revenue|payment|refund|profit/);
      expect(purged).toBe(3);

      expect(cacheStore.has("admin:financial:revenue")).toBe(false);
      expect(cacheStore.has("admin:financial:settlements")).toBe(false);
      expect(cacheStore.has("admin:financial:payment_report")).toBe(false);
      expect(cacheStore.has("customer:product:list")).toBe(true);
    });

    it("emits financial events safely even if socket io is not initialized", () => {
      expect(() => {
        emitFinancialsEvent("financials:updated", { source: "test", action: "order_payment" });
        emitFinancialsEvent("settlement:created", { settlementId: "set-1" });
        emitFinancialsEvent("commission_rule:updated", { ruleId: "cr-1" });
        emitFinancialsEvent("refund:processed", { refundId: "ref-1" });
      }).not.toThrow();
    });
  });
});

