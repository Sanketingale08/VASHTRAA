import { describe, it, expect } from "vitest";
import path from "path";
try {
  const envPath = path.resolve(process.cwd(), "../../.env");
  (process as any).loadEnvFile?.(envPath);
} catch {}
import { connectToMongoDB } from "@workspace/db";
import { computeAllVendorAggregates, getItemBasePrice, getItemCommissionRate } from "../lib/vendorAnalytics";

describe("Live MongoDB Vendor Analytics Calculation Verification", () => {
  it("computes gross revenue and 18% commission on actual product base price", async () => {
    await connectToMongoDB();
    const aggMap = await computeAllVendorAggregates();
    const allAggs = [...aggMap.values()];

    const totalGrossRevenue = allAggs.reduce((sum, a) => sum + (a.grossRevenue || 0), 0);
    const totalPlatformCommission = allAggs.reduce((sum, a) => sum + (a.commissionEarned || 0), 0);
    const totalSellerEarnings = allAggs.reduce((sum, a) => sum + (a.netRevenue || 0), 0);
    const totalOrders = allAggs.reduce((sum, a) => sum + (a.ordersReceived || 0), 0);
    const totalSellers = allAggs.length;

    const { mongoOrders } = await import("@workspace/db");
    const rawOrders = await mongoOrders.findMany({});
    console.log("=== REALTIME ORDERS BREAKDOWN ===");
    for (const ro of rawOrders) {
      const oid = String(ro.orderId || ro.id || "");
      if (["V80", "V126", "V129", "V133", "V152", "V159"].includes(oid)) {
        console.log(`REALTIME ORDER ${oid}: status=${ro.status}, total=${ro.totalAmount || ro.total}`);
        for (const it of (ro.items || [])) {
          console.log(`  item: name=${it.name}, price=${it.price}, basePrice=${it.basePrice}, originalPrice=${it.originalPrice}, qty=${it.quantity}, vendorId=${it.vendorId}`);
        }
      }
    }

    const { mongoGeneric } = await import("@workspace/db");
    const rules = await mongoGeneric.getCollection("commission_rules").find({}).toArray();
    console.log("=== MONGODB COMMISSION RULES ===", rules);
    console.log("Total Sellers:", totalSellers);
    console.log("Total Orders:", totalOrders);
    console.log("Total Gross Revenue (Base Price): RS:", totalGrossRevenue);
    console.log("Total Platform Commission (18%): RS:", totalPlatformCommission);
    console.log("Total Seller Earnings: RS:", totalSellerEarnings);

    for (const agg of allAggs) {
      if (agg.ordersReceived > 0 || agg.grossRevenue > 0) {
        console.log(`Vendor: ${agg.vendor.shopName || agg.vendor.name || agg.vendor.id}`);
        console.log(`  Orders: ${agg.ordersReceived}`);
        console.log(`  Gross Revenue: RS: ${agg.grossRevenue}`);
        console.log(`  Commission (18%): RS: ${agg.commissionEarned}`);
        console.log(`  Seller Earnings: RS: ${agg.netRevenue}`);
      }
    }

    // Verify mathematical reconciliation:
    // Total Seller Earnings must equal Total Gross Revenue minus Total Platform Commission (adjusted for refunds)
    const expectedSellerEarnings = totalGrossRevenue - totalPlatformCommission;
    expect(totalSellerEarnings).toBe(expectedSellerEarnings);

    // Verify 18% commission rule on base price:
    expect(totalPlatformCommission).toBe(Math.round(totalGrossRevenue * 0.18));
  }, 30000);

  it("verifies getItemBasePrice ignores customer markup price and extracts basePrice", () => {
    // Standard order item snapshot with 1000 basePrice and 1155 checkout price
    const item1 = { productId: "p1", basePrice: 1000, price: 1155, quantity: 1 };
    expect(getItemBasePrice(item1)).toBe(1000);

    // Order item with multiple units at 10,000 base price each
    const item2 = { productId: "p2", basePrice: 10000, price: 11550, quantity: 5 };
    expect(getItemBasePrice(item2)).toBe(10000);

    // Fallback item with legacy price snapshot
    const item3 = { productId: "p3", price: 1000, quantity: 1 };
    expect(getItemBasePrice(item3)).toBe(1000);
  });

  it("verifies getItemCommissionRate returns 18% (0.18) for order items", () => {
    const itemWithBps = { productId: "p1", basePrice: 1000, commissionBps: 1800 };
    expect(getItemCommissionRate(itemWithBps, [], "vendor1")).toBe(0.18);

    const itemWithoutBps = { productId: "p2", basePrice: 1000 };
    expect(getItemCommissionRate(itemWithoutBps, [], "vendor1")).toBe(0.18);
  });
});
