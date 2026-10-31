import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeAllVendorAggregates } from "../lib/vendorAnalytics";
import { mongoSellers, mongoProducts, mongoOrders, mongoGeneric } from "@workspace/db";

describe("Real-Time Vendor Analytics for All Sellers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("filters demo orders and calculates accurate gross revenue and commission", async () => {
    // 1. Mock Sellers in MongoDB (3 sellers: 2 active, 1 pending)
    const mockSellers = [
      {
        id: "seller_sanket_001",
        vendorId: "TDV001",
        sellerId: "TDV001",
        shopName: "Kange Collection",
        status: "approved",
      },
      {
        id: "seller_yeola_002",
        vendorId: "TDV002",
        sellerId: "TDV002",
        shopName: "SS Paithani Yeola",
        status: "active",
      },
      {
        id: "seller_pending_003",
        vendorId: "TDV003",
        sellerId: "TDV003",
        shopName: "New Handlooms",
        status: "pending",
      },
    ];

    // 2. Mock Products in MongoDB
    const mockProducts = [
      { id: "PROD_1", vendorId: "seller_sanket_001", active: true, price: 1000 },
      { id: "PROD_2", vendorId: "seller_yeola_002", active: true, price: 2000 },
    ];

    // 3. Mock Orders in MongoDB (2 genuine customer orders + 1 demo order)
    const mockOrders = [
      {
        id: "ORD_REAL_1",
        status: "dispatched",
        customerName: "Real Customer 1",
        items: [
          { productId: "PROD_1", price: 1000, quantity: 2, vendorId: "seller_sanket_001" }, // 2000
        ],
      },
      {
        id: "ORD_REAL_2",
        status: "processing",
        customerName: "Real Customer 2",
        items: [
          // Even without PROD_99 in product list, item.vendorId directs it to seller_yeola_002
          { productId: "PROD_99_CUSTOM", price: 3000, quantity: 1, vendorId: "seller_yeola_002" }, // 3000
        ],
      },
      {
        id: "ORD_DEMO_99",
        isDemo: true,
        customerName: "Checkout Tester",
        items: [
          { productId: "PROD_1", price: 50000, quantity: 1, vendorId: "seller_sanket_001" },
        ],
      },
    ];

    vi.spyOn(mongoSellers, "findMany").mockResolvedValue(mockSellers as any);
    vi.spyOn(mongoProducts, "findMany").mockResolvedValue(mockProducts as any);
    vi.spyOn(mongoOrders, "findMany").mockResolvedValue(mockOrders as any);
    vi.spyOn(mongoGeneric, "getCollection").mockReturnValue({
      find: () => ({ toArray: async () => [] }),
    } as any);

    const aggMap = await computeAllVendorAggregates();
    const allAggs = [...aggMap.values()];

    // Summary calculation matching routes/vendorAnalytics.ts
    const totalGrossRevenue = allAggs.reduce((sum, a) => sum + (a.grossRevenue || 0), 0);
    const totalPlatformCommission = allAggs.reduce((sum, a) => sum + (a.commissionEarned || 0), 0);
    const totalSellerEarnings = allAggs.reduce((sum, a) => sum + (a.netRevenue || 0), 0);
    const totalSellers = allAggs.length;
    const activeSellers = allAggs.filter(a => {
      const s = String(a.vendor.status || "").toLowerCase();
      return s === "approved" || s === "active";
    }).length;
    const inactiveSellers = totalSellers - activeSellers;
    const totalOrders = allAggs.reduce((sum, a) => sum + (a.ordersReceived || 0), 0);

    // Assertions
    // Total gross revenue: 2000 (from ORD_REAL_1) + 3000 (from ORD_REAL_2) = 5000. Demo order (50,000) ignored!
    expect(totalGrossRevenue).toBe(5000);

    // Platform commission at 18%: 2000 * 0.18 = 360; 3000 * 0.18 = 540 -> 360 + 540 = 900
    expect(totalPlatformCommission).toBe(900);

    // Total seller earnings = 5000 - 900 = 4100
    expect(totalSellerEarnings).toBe(4100);

    // Total sellers: 3
    expect(totalSellers).toBe(3);
    expect(activeSellers).toBe(2);
    expect(inactiveSellers).toBe(1);

    // Total orders: 2 genuine orders
    expect(totalOrders).toBe(2);

    // Specific vendor verification
    const sanketAgg = aggMap.get("seller_sanket_001");
    expect(sanketAgg).toBeDefined();
    expect(sanketAgg?.ordersReceived).toBe(1);
    expect(sanketAgg?.grossRevenue).toBe(2000);
    expect(sanketAgg?.commissionEarned).toBe(360);
    expect(sanketAgg?.netRevenue).toBe(1640);

    const yeolaAgg = aggMap.get("seller_yeola_002");
    expect(yeolaAgg).toBeDefined();
    expect(yeolaAgg?.ordersReceived).toBe(1);
    expect(yeolaAgg?.grossRevenue).toBe(3000);
    expect(yeolaAgg?.commissionEarned).toBe(540);
    expect(yeolaAgg?.netRevenue).toBe(2460);

    const pendingAgg = aggMap.get("seller_pending_003");
    expect(pendingAgg).toBeDefined();
    expect(pendingAgg?.ordersReceived).toBe(0);
    expect(pendingAgg?.grossRevenue).toBe(0);
    expect(pendingAgg?.commissionEarned).toBe(0);
    expect(pendingAgg?.netRevenue).toBe(0);
  });

  it("calculates gross revenue and 18% commission using stored basePrice snapshot, not customer checkout price or current price", async () => {
    const mockSellers = [
      { id: "seller_artisan_99", shopName: "Kanchipuram Silks", status: "approved" },
    ];
    // Product current price has changed to 15000, but historical order item basePrice was 10000
    const mockProducts = [
      { id: "PROD_HISTORIC", vendorId: "seller_artisan_99", active: true, price: 15000, basePrice: 13000 },
    ];
    // Seller sells 5 units with basePrice 10000 each (customer price is 11550 including GST and fees)
    const mockOrders = [
      {
        id: "ORD_HISTORIC_5UNITS",
        status: "confirmed",
        customerName: "Silk Buyer",
        items: [
          {
            productId: "PROD_HISTORIC",
            basePrice: 10000, // Stored base price snapshot
            price: 11550,     // Stored checkout customer price with GST & fees
            quantity: 5,
            vendorId: "seller_artisan_99",
          },
        ],
      },
    ];

    vi.spyOn(mongoSellers, "findMany").mockResolvedValue(mockSellers as any);
    vi.spyOn(mongoProducts, "findMany").mockResolvedValue(mockProducts as any);
    vi.spyOn(mongoOrders, "findMany").mockResolvedValue(mockOrders as any);
    vi.spyOn(mongoGeneric, "getCollection").mockReturnValue({
      find: () => ({ toArray: async () => [] }),
    } as any);

    const aggMap = await computeAllVendorAggregates();
    const agg = aggMap.get("seller_artisan_99");

    expect(agg).toBeDefined();
    expect(agg?.ordersReceived).toBe(1);
    // 5 units * 10,000 basePrice = 50,000 Gross Revenue (checkout price 11550 * 5 = 57750 is excluded)
    expect(agg?.grossRevenue).toBe(50000);
    // 18% commission on base price = 50,000 * 0.18 = 9,000
    expect(agg?.commissionEarned).toBe(9000);
    // Seller earnings before other adjustments = 50,000 - 9,000 = 41,000
    expect(agg?.netRevenue).toBe(41000);
  });

  it("handles cancelled and returned orders without counting them towards gross revenue", async () => {
    const mockSellers = [
      { id: "seller_pune_001", shopName: "Pune Saree Store", status: "approved" },
    ];
    const mockProducts = [
      { id: "P1", vendorId: "seller_pune_001", active: true, price: 1500 },
    ];
    const mockOrders = [
      {
        id: "ORD_CANCELLED",
        status: "cancelled",
        customerName: "Buyer",
        items: [{ productId: "P1", basePrice: 1500, price: 1732, quantity: 1, vendorId: "seller_pune_001" }],
      },
      {
        id: "ORD_ACTIVE",
        status: "delivered",
        customerName: "Buyer",
        items: [{ productId: "P1", basePrice: 1500, price: 1732, quantity: 1, vendorId: "seller_pune_001" }],
      },
    ];

    vi.spyOn(mongoSellers, "findMany").mockResolvedValue(mockSellers as any);
    vi.spyOn(mongoProducts, "findMany").mockResolvedValue(mockProducts as any);
    vi.spyOn(mongoOrders, "findMany").mockResolvedValue(mockOrders as any);
    vi.spyOn(mongoGeneric, "getCollection").mockReturnValue({
      find: () => ({ toArray: async () => [] }),
    } as any);

    const aggMap = await computeAllVendorAggregates();
    const agg = aggMap.get("seller_pune_001");

    expect(agg).toBeDefined();
    expect(agg?.ordersReceived).toBe(2);
    expect(agg?.ordersCancelled).toBe(1);
    expect(agg?.ordersDelivered).toBe(1);
    // Only the delivered order counts toward grossRevenue: 1500
    expect(agg?.grossRevenue).toBe(1500);
    expect(agg?.commissionEarned).toBe(Math.round(1500 * 0.18)); // 270
    expect(agg?.netRevenue).toBe(1500 - 270); // 1230
  });

  it("verifies Step 5 example: Gross Revenue ₹7,775 yields Commission ₹1,399.50 and Earnings ₹6,375.50 with 2-decimal precision", async () => {
    const mockSellers = [
      { id: "seller_step5", shopName: "Step 5 Seller", status: "approved" },
    ];
    const mockOrders = [
      {
        id: "ORD_7775",
        status: "delivered",
        customerName: "Buyer",
        items: [
          {
            productId: "P_7775",
            basePrice: 7775,
            price: 8979, // customer checkout price including GST/fees
            quantity: 1,
            vendorId: "seller_step5",
          },
        ],
      },
    ];

    vi.spyOn(mongoSellers, "findMany").mockResolvedValue(mockSellers as any);
    vi.spyOn(mongoProducts, "findMany").mockResolvedValue([] as any);
    vi.spyOn(mongoOrders, "findMany").mockResolvedValue(mockOrders as any);
    vi.spyOn(mongoGeneric, "getCollection").mockReturnValue({
      find: () => ({ toArray: async () => [] }),
    } as any);

    const aggMap = await computeAllVendorAggregates();
    const agg = aggMap.get("seller_step5");

    expect(agg).toBeDefined();
    // Gross Revenue = 7,775.00
    expect(agg?.grossRevenue).toBe(7775);
    // Platform Commission (18%) = 7,775 * 0.18 = 1,399.50
    expect(agg?.commissionEarned).toBe(1399.5);
    // Seller Earnings = 7,775.00 - 1,399.50 = 6,375.50
    expect(agg?.netRevenue).toBe(6375.5);
  });

  it("handles multiple sellers with separate products in one multi-vendor order, failed payments, and deduplication", async () => {
    const mockSellers = [
      { id: "v_alpha", shopName: "Alpha Boutique", status: "approved" },
      { id: "v_beta", shopName: "Beta Handlooms", status: "approved" },
    ];
    const mockOrders = [
      // 1. Multi-vendor order: Product A for Alpha (3000), Product B for Beta (5000)
      {
        id: "ORD_MULTI_VENDOR",
        status: "delivered",
        customerName: "Customer Multi",
        items: [
          { productId: "PROD_A", basePrice: 3000, price: 3465, quantity: 1, vendorId: "v_alpha" },
          { productId: "PROD_B", basePrice: 5000, price: 5775, quantity: 1, vendorId: "v_beta" },
        ],
      },
      // 2. Duplicate order (e.g. webhook retry or duplicate record) - MUST be deduplicated
      {
        id: "ORD_MULTI_VENDOR",
        status: "delivered",
        customerName: "Customer Multi",
        items: [
          { productId: "PROD_A", basePrice: 3000, price: 3465, quantity: 1, vendorId: "v_alpha" },
          { productId: "PROD_B", basePrice: 5000, price: 5775, quantity: 1, vendorId: "v_beta" },
        ],
      },
      // 3. Unpaid / failed payment order - MUST NOT be counted
      {
        id: "ORD_FAILED_PAYMENT",
        status: "pending",
        paymentStatus: "failed",
        customerName: "Customer Failed",
        items: [
          { productId: "PROD_A", basePrice: 3000, price: 3465, quantity: 1, vendorId: "v_alpha" },
        ],
      },
    ];

    vi.spyOn(mongoSellers, "findMany").mockResolvedValue(mockSellers as any);
    vi.spyOn(mongoProducts, "findMany").mockResolvedValue([] as any);
    vi.spyOn(mongoOrders, "findMany").mockResolvedValue(mockOrders as any);
    vi.spyOn(mongoGeneric, "getCollection").mockReturnValue({
      find: () => ({ toArray: async () => [] }),
    } as any);

    const aggMap = await computeAllVendorAggregates();
    const alphaAgg = aggMap.get("v_alpha");
    const betaAgg = aggMap.get("v_beta");

    // Alpha Boutique verification:
    // Only 1 order counted (duplicate was ignored, failed payment was ignored)
    expect(alphaAgg?.grossRevenue).toBe(3000);
    expect(alphaAgg?.commissionEarned).toBe(540); // 3000 * 0.18 = 540
    expect(alphaAgg?.netRevenue).toBe(2460); // 3000 - 540 = 2460

    // Beta Handlooms verification:
    expect(betaAgg?.grossRevenue).toBe(5000);
    expect(betaAgg?.commissionEarned).toBe(900); // 5000 * 0.18 = 900
    expect(betaAgg?.netRevenue).toBe(4100); // 5000 - 900 = 4100

    // Platform-wide reconciliation:
    const totalGross = (alphaAgg?.grossRevenue ?? 0) + (betaAgg?.grossRevenue ?? 0);
    const totalCommission = (alphaAgg?.commissionEarned ?? 0) + (betaAgg?.commissionEarned ?? 0);
    const totalEarnings = (alphaAgg?.netRevenue ?? 0) + (betaAgg?.netRevenue ?? 0);

    expect(totalGross).toBe(8000);
    expect(totalCommission).toBe(1440);
    expect(totalEarnings).toBe(6560);
    expect(totalEarnings).toBe(totalGross - totalCommission);
  });

  it("accurately tracks pending and completed settlements", async () => {
    const mockSellers = [
      { id: "v_settled", shopName: "Settled Artisan", status: "approved" },
    ];
    const mockOrders = [
      {
        id: "ORD_SETTLED_1",
        status: "delivered",
        items: [
          { productId: "PROD_S1", basePrice: 10000, price: 11550, quantity: 1, vendorId: "v_settled" },
        ],
      },
    ];
    // Completed settlement record of ₹5,000 in vendor_settlements
    const mockSettlements = [
      { id: "SETTLE_1", vendorId: "v_settled", amount: 5000, status: "completed" },
    ];

    vi.spyOn(mongoSellers, "findMany").mockResolvedValue(mockSellers as any);
    vi.spyOn(mongoProducts, "findMany").mockResolvedValue([] as any);
    vi.spyOn(mongoOrders, "findMany").mockResolvedValue(mockOrders as any);
    vi.spyOn(mongoGeneric, "getCollection").mockReturnValue({
      find: (query: any) => ({
        toArray: async () => mockSettlements,
      }),
    } as any);

    const aggMap = await computeAllVendorAggregates();
    const agg = aggMap.get("v_settled");

    expect(agg).toBeDefined();
    expect(agg?.grossRevenue).toBe(10000);
    expect(agg?.commissionEarned).toBe(1800); // 18% of 10,000
    expect(agg?.netRevenue).toBe(8200); // 10,000 - 1800
    expect(agg?.completedSettlement).toBe(5000);
    // Pending settlement = deliveredRevenue (8200) - completedSettlement (5000) = 3200
    expect(agg?.pendingSettlement).toBe(3200);
  });

  it("handles multiple products with different base prices in one single order", async () => {
    const mockSellers = [
      { id: "v_multi_prod", shopName: "Multi Product Store", status: "approved" },
    ];
    const mockOrders = [
      {
        id: "ORD_MULTI_PROD_1",
        status: "delivered",
        items: [
          { productId: "PROD_P1", basePrice: 1500, price: 1732, quantity: 2, vendorId: "v_multi_prod" }, // 3000
          { productId: "PROD_P2", basePrice: 2500, price: 2887, quantity: 1, vendorId: "v_multi_prod" }, // 2500
          { productId: "PROD_P3", basePrice: 500, price: 577, quantity: 4, vendorId: "v_multi_prod" },   // 2000
        ],
      },
    ];

    vi.spyOn(mongoSellers, "findMany").mockResolvedValue(mockSellers as any);
    vi.spyOn(mongoProducts, "findMany").mockResolvedValue([] as any);
    vi.spyOn(mongoOrders, "findMany").mockResolvedValue(mockOrders as any);
    vi.spyOn(mongoGeneric, "getCollection").mockReturnValue({
      find: () => ({ toArray: async () => [] }),
    } as any);

    const aggMap = await computeAllVendorAggregates();
    const agg = aggMap.get("v_multi_prod");

    // Total base: 1500*2 + 2500*1 + 500*4 = 3000 + 2500 + 2000 = 7500
    expect(agg?.grossRevenue).toBe(7500);
    // 18% commission: 7500 * 0.18 = 1350
    expect(agg?.commissionEarned).toBe(1350);
    // Seller earnings: 7500 - 1350 = 6150
    expect(agg?.netRevenue).toBe(6150);
  });

  it("handles full refunds and partial refunds without double subtraction", async () => {
    const mockSellers = [
      { id: "v_refunds", shopName: "Refunds Test Vendor", status: "approved" },
    ];
    const mockOrders = [
      // 1. Fully delivered active order: base price 4,000
      {
        id: "ORD_REF_DELIVERED",
        status: "delivered",
        items: [
          { productId: "P_REF_1", basePrice: 4000, price: 4620, quantity: 1, vendorId: "v_refunds" },
        ],
      },
      // 2. Fully refunded order (refundStatus: processed): base price 2,000 -> must NOT count in grossRevenue
      {
        id: "ORD_REF_FULL",
        status: "delivered",
        refundStatus: "processed",
        items: [
          { productId: "P_REF_2", basePrice: 2000, price: 2310, quantity: 1, vendorId: "v_refunds" },
        ],
      },
      // 3. Partially refunded order: 2 units at base 1,500 each (3,000 total), with 1 unit returned/refunded
      {
        id: "ORD_REF_PARTIAL",
        status: "delivered",
        items: [
          {
            productId: "P_REF_3",
            basePrice: 1500,
            price: 1732,
            quantity: 2,
            returnedQuantity: 1,
            vendorId: "v_refunds",
          },
        ],
      },
      // 4. Cancelled order: base price 1,000 -> must NOT count in grossRevenue
      {
        id: "ORD_REF_CANCELLED",
        status: "cancelled",
        items: [
          { productId: "P_REF_4", basePrice: 1000, price: 1155, quantity: 1, vendorId: "v_refunds" },
        ],
      },
    ];

    vi.spyOn(mongoSellers, "findMany").mockResolvedValue(mockSellers as any);
    vi.spyOn(mongoProducts, "findMany").mockResolvedValue([] as any);
    vi.spyOn(mongoOrders, "findMany").mockResolvedValue(mockOrders as any);
    vi.spyOn(mongoGeneric, "getCollection").mockReturnValue({
      find: () => ({ toArray: async () => [] }),
    } as any);

    const aggMap = await computeAllVendorAggregates();
    const agg = aggMap.get("v_refunds");

    // Eligible Gross Revenue:
    // Order 1: 4000
    // Order 2: 0 (full refund)
    // Order 3: 1500 (1 unit remaining out of 2)
    // Order 4: 0 (cancelled)
    // Total Eligible Base Price = 4000 + 1500 = 5500
    expect(agg?.grossRevenue).toBe(5500);

    // Platform Commission (18% on eligible base revenue):
    // 5500 * 0.18 = 990
    expect(agg?.commissionEarned).toBe(990);

    // Seller Earnings:
    // 5500 - 990 = 4510
    expect(agg?.netRevenue).toBe(4510);

    // Refunded Amount tracked:
    // Order 2 (2000) + Order 3 partial (1500) = 3500
    expect(agg?.refundedAmount).toBe(3500);
  });
});
