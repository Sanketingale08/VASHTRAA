import { db } from "@workspace/db";
import {
  vendorsTable, productsTable, ordersTable, productReviewsTable,
  searchQueriesTable, wishlistsTable,
} from "@workspace/db";
import { computeAllVendorAggregates, computeResponseScores, computePerformanceScore, type OrderItem } from "./vendorAnalytics";
import { loadActiveCommissionRules, effectiveRateFromRules } from "./commission";

export type Period = "daily" | "weekly" | "monthly" | "yearly";

export interface DateRange {
  from: Date;
  to: Date;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function resolveRange(period: Period | undefined, from?: string, to?: string): DateRange {
  const now = new Date();
  if (from && to) {
    const f = new Date(from);
    const t = new Date(to);
    if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
      return { from: startOfDay(f), to: new Date(t.getTime() + 24 * 60 * 60 * 1000 - 1) };
    }
  }
  const to2 = now;
  let days = 30;
  switch (period) {
    case "daily": days = 1; break;
    case "weekly": days = 7; break;
    case "monthly": days = 30; break;
    case "yearly": days = 365; break;
    default: days = 30;
  }
  const from2 = new Date(startOfDay(now).getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from2, to: to2 };
}

function previousRange(range: DateRange): DateRange {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: new Date(range.from.getTime() - 1) };
}

function inRange(date: Date, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

function bucketKey(date: Date, period: Period): string {
  if (period === "yearly") return String(date.getFullYear());
  if (period === "monthly") return date.toISOString().slice(0, 7);
  if (period === "weekly") {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function growthPercent(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function computeBusinessIntelligence(period: Period, from?: string, to?: string) {
  const range = resolveRange(period, from, to);
  const prevRange = previousRange(range);

  const [vendors, products, orders, reviews, searches, commissionRules] = await Promise.all([
    db.select().from(vendorsTable),
    db.select().from(productsTable),
    db.select().from(ordersTable),
    db.select().from(productReviewsTable),
    db.select().from(searchQueriesTable),
    loadActiveCommissionRules(),
  ]);

  const productById = new Map(products.map(p => [p.id, p]));
  const vendorAggMap = await computeAllVendorAggregates();
  const responseScores = await computeResponseScores();

  const ordersInRange = orders.filter(o => inRange(new Date(o.createdAt), range));
  const ordersInPrevRange = orders.filter(o => inRange(new Date(o.createdAt), prevRange));

  function orderRevenue(o: typeof orders[number]): number {
    return o.total;
  }

  const nonCancelled = (o: typeof orders[number]) => !["cancelled", "returned"].includes(o.status);

  const totalRevenue = ordersInRange.filter(nonCancelled).reduce((s, o) => s + orderRevenue(o), 0);
  const prevRevenue = ordersInPrevRange.filter(nonCancelled).reduce((s, o) => s + orderRevenue(o), 0);
  const totalOrders = ordersInRange.length;
  const prevOrders = ordersInPrevRange.length;
  const totalRefundAmount = ordersInRange
    .filter(o => o.refundStatus === "processed" || o.refundStatus === "approved")
    .reduce((s, o) => s + orderRevenue(o), 0);

  function orderCommission(o: typeof orders[number]): number {
    const items = (o.items as OrderItem[]) ?? [];
    let commission = 0;
    for (const item of items) {
      const p = productById.get(item.productId);
      const rate = effectiveRateFromRules(commissionRules, p?.vendorId, p?.category);
      commission += Math.round(item.price * (item.quantity ?? 1) * rate);
    }
    return commission;
  }

  const commissionRevenue = ordersInRange.filter(nonCancelled).reduce((s, o) => s + orderCommission(o), 0);
  const totalProfit = commissionRevenue - totalRefundAmount * 0.02;

  const customerIdsInRange = new Set(ordersInRange.map(o => o.userId));
  const allCustomerIds = new Set(orders.map(o => o.userId));

  const overview = {
    totalRevenue,
    totalOrders,
    totalProducts: products.length,
    totalCustomers: allCustomerIds.size,
    totalVendors: vendors.length,
    totalProfit: Math.round(totalProfit),
    totalRefundAmount,
    marketplaceGrowthPercent: growthPercent(totalRevenue, prevRevenue),
    orderGrowthPercent: growthPercent(totalOrders, prevOrders),
    activeCustomersInPeriod: customerIdsInRange.size,
  };

  const topVendors = [...vendorAggMap.entries()].map(([id, agg]) => {
    const perf = computePerformanceScore(agg, responseScores.get(id) ?? 100);
    return {
      id,
      name: agg.vendor.name,
      shopCity: agg.vendor.shopCity ?? agg.vendor.location,
      totalRevenue: agg.grossRevenue,
      totalOrders: agg.ordersReceived,
      productsSold: agg.ordersDelivered,
      rating: agg.avgRating,
      performanceScore: perf.score,
      performanceBadge: perf.badge,
      fulfillmentRate: perf.fulfillmentRate,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 20);

  const productSalesMap = new Map<string, { unitsSold: number; revenue: number }>();
  for (const o of ordersInRange.filter(nonCancelled)) {
    const items = (o.items as OrderItem[]) ?? [];
    for (const item of items) {
      const cur = productSalesMap.get(item.productId) ?? { unitsSold: 0, revenue: 0 };
      cur.unitsSold += item.quantity ?? 1;
      cur.revenue += item.price * (item.quantity ?? 1);
      productSalesMap.set(item.productId, cur);
    }
  }

  const topProducts = [...productSalesMap.entries()].map(([productId, d]) => {
    const p = productById.get(productId);
    if (!p) return null;
    return {
      id: productId,
      name: p.name,
      vendorName: p.vendorName,
      category: p.category,
      unitsSold: d.unitsSold,
      revenue: d.revenue,
      rating: p.rating,
      stock: p.stock,
    };
  }).filter(Boolean).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 20);

  const mostViewedProducts = [...products]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 20)
    .map(p => {
      const sales = productSalesMap.get(p.id);
      const orderCount = sales?.unitsSold ?? 0;
      return {
        id: p.id,
        name: p.name,
        totalViews: p.viewCount,
        vendorName: p.vendorName,
        category: p.category,
        conversionRate: p.viewCount > 0 ? Math.round((orderCount / p.viewCount) * 1000) / 10 : 0,
      };
    });

  const wishlistCounts = await db.select().from(wishlistsTable);
  const wishlistByProduct = new Map<string, number>();
  for (const w of wishlistCounts) {
    wishlistByProduct.set(w.productId, (wishlistByProduct.get(w.productId) ?? 0) + 1);
  }
  for (const item of mostViewedProducts as any[]) {
    item.wishlistCount = wishlistByProduct.get(item.id) ?? 0;
  }

  const searchByTerm = new Map<string, { count: number; resultCount: number; latest: Date }>();
  for (const s of searches) {
    const cur = searchByTerm.get(s.term) ?? { count: 0, resultCount: 0, latest: new Date(0) };
    cur.count++;
    cur.resultCount = s.resultCount;
    const createdAt = new Date(s.createdAt);
    if (createdAt > cur.latest) cur.latest = createdAt;
    searchByTerm.set(s.term, cur);
  }
  const mostSearchedTerms = [...searchByTerm.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([term, d]) => ({
      term,
      searchCount: d.count,
      resultCount: d.resultCount,
      availability: d.resultCount > 0 ? "In Stock" : "No Results",
    }));

  const trendingKeywords = [...searchByTerm.entries()]
    .filter(([, d]) => inRange(d.latest, range))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([term]) => term);

  const highestRevenueShops = [...vendorAggMap.entries()].map(([id, agg]) => {
    const perf = computePerformanceScore(agg, responseScores.get(id) ?? 100);
    return {
      id,
      shopName: agg.vendor.name,
      vendorName: agg.vendor.name,
      totalRevenue: agg.grossRevenue,
      totalOrders: agg.ordersReceived,
      averageOrderValue: agg.ordersReceived > 0 ? Math.round(agg.grossRevenue / agg.ordersReceived) : 0,
      rating: agg.avgRating,
      performanceScore: perf.score,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 15);

  const customerFirstOrderDate = new Map<string, Date>();
  for (const o of orders) {
    const createdAt = new Date(o.createdAt);
    if (!customerFirstOrderDate.has(o.userId) || createdAt < customerFirstOrderDate.get(o.userId)!) {
      customerFirstOrderDate.set(o.userId, createdAt);
    }
  }
  const customerOrderCounts = new Map<string, number>();
  for (const o of orders) {
    customerOrderCounts.set(o.userId, (customerOrderCounts.get(o.userId) ?? 0) + 1);
  }
  const newCustomersInRange = [...customerFirstOrderDate.entries()].filter(([, d]) => inRange(d, range));
  const returningCustomers = [...customerOrderCounts.entries()].filter(([, c]) => c > 1).length;

  const customerGrowthBuckets = new Map<string, number>();
  for (const [, d] of customerFirstOrderDate) {
    const key = bucketKey(d, period);
    customerGrowthBuckets.set(key, (customerGrowthBuckets.get(key) ?? 0) + 1);
  }

  const customerGrowth = {
    newRegistrations: newCustomersInRange.length,
    activeCustomers: customerIdsInRange.size,
    returningCustomers,
    retentionRate: allCustomerIds.size > 0 ? Math.round((returningCustomers / allCustomerIds.size) * 1000) / 10 : 0,
    trend: [...customerGrowthBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([p, count]) => ({ period: p, count })),
  };

  const vendorGrowthBuckets = new Map<string, number>();
  for (const v of vendors) {
    if (v.termsAcceptedAt) {
      const key = bucketKey(new Date(v.termsAcceptedAt), period);
      vendorGrowthBuckets.set(key, (vendorGrowthBuckets.get(key) ?? 0) + 1);
    }
  }
  const newVendorsInRange = vendors.filter(v => v.termsAcceptedAt && inRange(new Date(v.termsAcceptedAt), range));
  const vendorGrowth = {
    newRegistrations: newVendorsInRange.length,
    activeVendors: vendors.filter(v => v.status === "approved").length,
    pendingApprovals: vendors.filter(v => v.status === "pending").length,
    suspendedVendors: vendors.filter(v => v.status === "suspended").length,
    trend: [...vendorGrowthBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([p, count]) => ({ period: p, count })),
  };

  const revenueBuckets = new Map<string, number>();
  for (const o of orders.filter(nonCancelled)) {
    const key = bucketKey(new Date(o.createdAt), period);
    revenueBuckets.set(key, (revenueBuckets.get(key) ?? 0) + orderRevenue(o));
  }
  const revenueTrend = [...revenueBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([p, revenue]) => ({ period: p, revenue }));

  const revenueGrowth = {
    currentPeriodRevenue: totalRevenue,
    previousPeriodRevenue: prevRevenue,
    growthPercent: growthPercent(totalRevenue, prevRevenue),
    trend: revenueTrend,
  };

  const categoryBuckets = new Map<string, { orders: number; unitsSold: number; revenue: number }>();
  const vendorSalesBuckets = new Map<string, { orders: number; revenue: number }>();
  for (const o of ordersInRange.filter(nonCancelled)) {
    const items = (o.items as OrderItem[]) ?? [];
    const touchedVendors = new Set<string>();
    for (const item of items) {
      const p = productById.get(item.productId);
      if (!p) continue;
      const catKey = p.category;
      const cur = categoryBuckets.get(catKey) ?? { orders: 0, unitsSold: 0, revenue: 0 };
      cur.unitsSold += item.quantity ?? 1;
      cur.revenue += item.price * (item.quantity ?? 1);
      categoryBuckets.set(catKey, cur);
      if (p.vendorId) touchedVendors.add(p.vendorId);
    }
    for (const vId of touchedVendors) {
      const cur = vendorSalesBuckets.get(vId) ?? { orders: 0, revenue: 0 };
      cur.orders += 1;
      vendorSalesBuckets.set(vId, cur);
    }
  }
  for (const [catKey, cur] of categoryBuckets) {
    cur.orders = ordersInRange.filter(nonCancelled).filter(o =>
      ((o.items as OrderItem[]) ?? []).some(i => productById.get(i.productId)?.category === catKey)
    ).length;
  }

  const salesTrends = {
    totalOrders,
    productsSold: [...productSalesMap.values()].reduce((s, d) => s + d.unitsSold, 0),
    averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    salesByCategory: [...categoryBuckets.entries()].map(([category, d]) => ({ category, ...d })),
    salesByVendor: [...vendorSalesBuckets.entries()].map(([vendorId, d]) => ({
      vendorId,
      vendorName: vendorAggMap.get(vendorId)?.vendor.name ?? "Unknown",
      ...d,
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 15),
  };

  const returnedOrders = ordersInRange.filter(o => o.status === "returned" || o.refundStatus);
  const returnReasonCounts = new Map<string, number>();
  for (const o of returnedOrders) {
    const reason = o.returnReason || "Not specified";
    returnReasonCounts.set(reason, (returnReasonCounts.get(reason) ?? 0) + 1);
  }
  const returnsByProduct = new Map<string, number>();
  const returnsByVendor = new Map<string, number>();
  for (const o of returnedOrders) {
    const items = (o.items as OrderItem[]) ?? [];
    for (const item of items) {
      returnsByProduct.set(item.productId, (returnsByProduct.get(item.productId) ?? 0) + 1);
      const p = productById.get(item.productId);
      if (p?.vendorId) returnsByVendor.set(p.vendorId, (returnsByVendor.get(p.vendorId) ?? 0) + 1);
    }
  }
  const returnTrendBuckets = new Map<string, number>();
  for (const o of returnedOrders) {
    const key = bucketKey(new Date(o.createdAt), period);
    returnTrendBuckets.set(key, (returnTrendBuckets.get(key) ?? 0) + 1);
  }

  const returnTrends = {
    totalReturns: returnedOrders.length,
    returnRate: totalOrders > 0 ? Math.round((returnedOrders.length / totalOrders) * 1000) / 10 : 0,
    returnReasons: [...returnReasonCounts.entries()].map(([reason, count]) => ({ reason, count })),
    refundAmount: totalRefundAmount,
    topReturnedProducts: [...returnsByProduct.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([productId, count]) => ({ productId, name: productById.get(productId)?.name ?? "Unknown", count })),
    topReturnVendors: [...returnsByVendor.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([vendorId, count]) => ({ vendorId, name: vendorAggMap.get(vendorId)?.vendor.name ?? "Unknown", count })),
    trend: [...returnTrendBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([p, count]) => ({ period: p, count })),
  };

  return {
    period,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    overview,
    topVendors,
    topProducts,
    mostViewedProducts,
    mostSearchedProducts: mostSearchedTerms,
    trendingKeywords,
    highestRevenueShops,
    customerGrowth,
    vendorGrowth,
    revenueGrowth,
    salesTrends,
    returnTrends,
  };
}
