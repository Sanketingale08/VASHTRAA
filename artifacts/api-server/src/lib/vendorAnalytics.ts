import { db } from "@workspace/db";
import {
  vendorsTable, productsTable, ordersTable, productReviewsTable,
  productQueriesTable, vendorSettlementsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadActiveCommissionRules, effectiveRateFromRules } from "./commission";

export type OrderItem = { productId: string; price: number; quantity: number; name?: string };

export interface VendorAggregate {
  vendor: typeof vendorsTable.$inferSelect;
  productIds: Set<string>;
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  featuredProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  ordersReceived: number;
  ordersDelivered: number;
  ordersDispatched: number;
  ordersCancelled: number;
  ordersReturned: number;
  ordersConfirmed: number;
  grossRevenue: number;
  netRevenue: number;
  commissionEarned: number;
  refundedAmount: number;
  registeredAt: Date | null;
  totalCustomers: number;
  newCustomers30d: number;
  repeatCustomers: number;
  avgRating: number;
  reviewCount: number;
  ratingDistribution: Record<string, number>;
  pendingSettlement: number;
  completedSettlement: number;
  monthlyRevenue: { period: string; revenue: number; orders: number }[];
}

export async function computeAllVendorAggregates(): Promise<Map<string, VendorAggregate>> {
  const vendors = await db.select().from(vendorsTable);
  const products = await db
    .select({
      id: productsTable.id, vendorId: productsTable.vendorId, active: productsTable.active,
      stock: productsTable.stock, lowStockThreshold: productsTable.lowStockThreshold,
      isFeatured: productsTable.isFeatured,
    })
    .from(productsTable);
  const orders = await db.select().from(ordersTable);
  const reviews = await db.select().from(productReviewsTable);
  const settlements = await db.select().from(vendorSettlementsTable);
  const commissionRules = await loadActiveCommissionRules();

  const productToVendor = new Map(products.filter(p => p.vendorId).map(p => [p.id, p.vendorId as string]));

  const map = new Map<string, VendorAggregate>();
  for (const v of vendors) {
    const vendorProducts = products.filter(p => p.vendorId === v.id);
    map.set(v.id, {
      vendor: v,
      productIds: new Set(vendorProducts.map(p => p.id)),
      totalProducts: vendorProducts.length,
      activeProducts: vendorProducts.filter(p => p.active).length,
      inactiveProducts: vendorProducts.filter(p => !p.active).length,
      featuredProducts: vendorProducts.filter(p => p.isFeatured).length,
      outOfStockProducts: vendorProducts.filter(p => p.stock <= 0).length,
      lowStockProducts: vendorProducts.filter(p => p.stock > 0 && p.stock <= p.lowStockThreshold).length,
      ordersReceived: 0,
      ordersDelivered: 0,
      ordersDispatched: 0,
      ordersCancelled: 0,
      ordersReturned: 0,
      ordersConfirmed: 0,
      grossRevenue: 0,
      netRevenue: 0,
      commissionEarned: 0,
      refundedAmount: 0,
      registeredAt: v.termsAcceptedAt ?? null,
      totalCustomers: 0,
      newCustomers30d: 0,
      repeatCustomers: 0,
      avgRating: v.rating,
      reviewCount: 0,
      ratingDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      pendingSettlement: 0,
      completedSettlement: 0,
      monthlyRevenue: [],
    });
  }

  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthlyMap = new Map<string, Map<string, { revenue: number; orders: number }>>();
  const customerFirstOrder = new Map<string, Date>();
  const customerOrderCount = new Map<string, Map<string, number>>();

  for (const order of orders) {
    const items = (order.items as OrderItem[]) ?? [];
    if (!Array.isArray(items)) continue;
    const touchedVendors = new Set<string>();
    for (const item of items) {
      const vendorId = productToVendor.get(item.productId);
      if (!vendorId) continue;
      touchedVendors.add(vendorId);
    }
    for (const vendorId of touchedVendors) {
      const agg = map.get(vendorId);
      if (!agg) continue;
      agg.ordersReceived++;
      if (order.status === "delivered") agg.ordersDelivered++;
      if (order.status === "dispatched") agg.ordersDispatched++;
      if (order.status === "cancelled") agg.ordersCancelled++;
      if (order.status === "returned") agg.ordersReturned++;
      if (order.status === "confirmed") agg.ordersConfirmed++;

      const vendorItems = items.filter(i => productToVendor.get(i.productId) === vendorId);
      const vendorTotal = vendorItems.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0);

      if (!["cancelled", "returned"].includes(order.status)) {
        agg.grossRevenue += vendorTotal;
      }
      if (order.refundStatus === "processed") {
        agg.refundedAmount += vendorTotal;
      }

      const monthKey = new Date(order.createdAt).toISOString().slice(0, 7);
      if (!monthlyMap.has(vendorId)) monthlyMap.set(vendorId, new Map());
      const vMonthly = monthlyMap.get(vendorId)!;
      const prev = vMonthly.get(monthKey) ?? { revenue: 0, orders: 0 };
      if (!["cancelled", "returned"].includes(order.status)) {
        vMonthly.set(monthKey, { revenue: prev.revenue + vendorTotal, orders: prev.orders + 1 });
      } else if (!vMonthly.has(monthKey)) {
        vMonthly.set(monthKey, prev);
      }

      if (!customerOrderCount.has(vendorId)) customerOrderCount.set(vendorId, new Map());
      const vCustomers = customerOrderCount.get(vendorId)!;
      vCustomers.set(order.userId, (vCustomers.get(order.userId) ?? 0) + 1);

      const key = `${vendorId}:${order.userId}`;
      const createdAt = new Date(order.createdAt);
      if (!customerFirstOrder.has(key) || createdAt < customerFirstOrder.get(key)!) {
        customerFirstOrder.set(key, createdAt);
      }
    }
  }

  for (const [vendorId, agg] of map) {
    const vendorRate = effectiveRateFromRules(commissionRules, vendorId, undefined);
    agg.netRevenue = Math.round(agg.grossRevenue * (1 - vendorRate));
    agg.commissionEarned = Math.round(agg.grossRevenue * vendorRate);

    const vMonthly = monthlyMap.get(vendorId) ?? new Map();
    agg.monthlyRevenue = [...vMonthly.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([period, d]) => ({ period, revenue: d.revenue, orders: d.orders }));

    const vCustomers = customerOrderCount.get(vendorId) ?? new Map();
    agg.totalCustomers = vCustomers.size;
    agg.repeatCustomers = [...vCustomers.values()].filter(c => c > 1).length;
    let newCustomers = 0;
    for (const [key, firstOrderDate] of customerFirstOrder) {
      if (key.startsWith(`${vendorId}:`) && firstOrderDate >= cutoff30d) newCustomers++;
    }
    agg.newCustomers30d = newCustomers;
  }

  for (const r of reviews) {
    const vendorId = r.vendorId ?? productToVendor.get(r.productId);
    if (!vendorId) continue;
    const agg = map.get(vendorId);
    if (!agg) continue;
    agg.reviewCount++;
    const bucket = String(Math.max(1, Math.min(5, Math.round(r.rating))));
    agg.ratingDistribution[bucket] = (agg.ratingDistribution[bucket] ?? 0) + 1;
  }
  for (const agg of map.values()) {
    if (agg.reviewCount > 0) {
      const sum = Object.entries(agg.ratingDistribution).reduce((s, [star, count]) => s + Number(star) * count, 0);
      agg.avgRating = Math.round((sum / agg.reviewCount) * 10) / 10;
    }
  }

  for (const s of settlements) {
    const agg = map.get(s.vendorId);
    if (!agg) continue;
    if (s.status === "completed") agg.completedSettlement += s.amount;
  }
  for (const agg of map.values()) {
    const deliveredRevenue = Math.round(
      (agg.ordersDelivered / Math.max(1, agg.ordersReceived)) * agg.netRevenue
    );
    agg.pendingSettlement = Math.max(0, deliveredRevenue - agg.completedSettlement);
  }

  return map;
}

export interface PerformanceScoreBreakdown {
  score: number;
  badge: "Excellent" | "Good" | "Average" | "Needs Improvement";
  fulfillmentRate: number;
  ratingScore: number;
  cancellationRate: number;
  returnRate: number;
  inventoryAvailability: number;
  responseScore: number;
}

export async function computeResponseScores(): Promise<Map<string, number>> {
  const queries = await db.select().from(productQueriesTable);
  const byVendor = new Map<string, { total: number; withinDay: number }>();
  for (const q of queries) {
    if (!q.vendorId || !q.sellerRepliedAt) continue;
    const hours = (new Date(q.sellerRepliedAt).getTime() - new Date(q.createdAt).getTime()) / 3600000;
    const cur = byVendor.get(q.vendorId) ?? { total: 0, withinDay: 0 };
    cur.total++;
    if (hours <= 24) cur.withinDay++;
    byVendor.set(q.vendorId, cur);
  }
  const scores = new Map<string, number>();
  for (const [vendorId, d] of byVendor) {
    scores.set(vendorId, d.total > 0 ? Math.round((d.withinDay / d.total) * 100) : 100);
  }
  return scores;
}

export function computePerformanceScore(agg: VendorAggregate, responseScore: number): PerformanceScoreBreakdown {
  const fulfillmentRate = agg.ordersReceived > 0
    ? Math.round((agg.ordersDelivered / agg.ordersReceived) * 100)
    : 100;
  const cancellationRate = agg.ordersReceived > 0
    ? Math.round((agg.ordersCancelled / agg.ordersReceived) * 100)
    : 0;
  const returnRate = agg.ordersReceived > 0
    ? Math.round((agg.ordersReturned / agg.ordersReceived) * 100)
    : 0;
  const ratingScore = Math.round((agg.avgRating / 5) * 100);
  const inventoryAvailability = agg.totalProducts > 0
    ? Math.round(((agg.totalProducts - agg.outOfStockProducts) / agg.totalProducts) * 100)
    : 100;

  const score = Math.round(
    0.25 * fulfillmentRate +
    0.20 * ratingScore +
    0.15 * (100 - cancellationRate) +
    0.15 * (100 - returnRate) +
    0.15 * inventoryAvailability +
    0.10 * responseScore
  );

  const clamped = Math.max(0, Math.min(100, score));
  const badge: PerformanceScoreBreakdown["badge"] =
    clamped >= 85 ? "Excellent" : clamped >= 70 ? "Good" : clamped >= 50 ? "Average" : "Needs Improvement";

  return { score: clamped, badge, fulfillmentRate, ratingScore, cancellationRate, returnRate, inventoryAvailability, responseScore };
}
