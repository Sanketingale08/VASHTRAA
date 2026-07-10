import { db } from "@workspace/db";
import {
  vendorsTable, productsTable, ordersTable, vendorSettlementsTable, commissionRulesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import type { OrderItem } from "./vendorAnalytics";
import type { Period } from "./businessIntelligence";
import { resolveRange } from "./businessIntelligence";
import { DEFAULT_COMMISSION_RATE, loadActiveCommissionRules, effectiveRateFromRules, getEffectiveCommissionRate } from "./commission";

export { getEffectiveCommissionRate };

export interface RevenueReportFilters {
  from?: string;
  to?: string;
  vendorId?: string;
  category?: string;
  paymentStatus?: string;
}

function inRange(date: Date, from?: Date, to?: Date): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export async function computeRevenueReport(filters: RevenueReportFilters) {
  const [orders, products, rules] = await Promise.all([
    db.select().from(ordersTable),
    db.select().from(productsTable),
    loadActiveCommissionRules(),
  ]);
  const productById = new Map(products.map(p => [p.id, p]));

  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;

  function rateFor(vendorId: string | null | undefined, category: string | null | undefined): number {
    return effectiveRateFromRules(rules, vendorId, category);
  }

  let grossRevenue = 0, taxesCollected = 0, shippingRevenue = 0, commissionRevenue = 0, vendorRevenue = 0;
  const rows: any[] = [];

  for (const o of orders) {
    const createdAt = new Date(o.createdAt);
    if (!inRange(createdAt, from, to)) continue;
    if (["cancelled", "returned"].includes(o.status)) continue;
    if (filters.paymentStatus && o.status !== filters.paymentStatus) continue;

    const items = (o.items as OrderItem[]) ?? [];
    const hasLineFilter = !!filters.vendorId || !!filters.category;
    let orderMatchesFilter = !hasLineFilter;
    let orderCommission = 0;
    let orderVendorRevenue = 0;
    let matchedLineTotal = 0;
    const orderLineTotal = items.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0);
    for (const item of items) {
      const p = productById.get(item.productId);
      if (filters.vendorId && p?.vendorId !== filters.vendorId) continue;
      if (filters.category && p?.category !== filters.category) continue;
      orderMatchesFilter = true;
      const lineTotal = item.price * (item.quantity ?? 1);
      matchedLineTotal += lineTotal;
      const rate = rateFor(p?.vendorId, p?.category);
      const commission = Math.round(lineTotal * rate);
      orderCommission += commission;
      orderVendorRevenue += lineTotal - commission;
    }
    if (!orderMatchesFilter) continue;

    // When filtering by vendor/category, prorate order-level totals (tax, shipping, gross)
    // by the matched line items' share of the order, instead of counting the full order.
    const shareOfOrder = hasLineFilter ? (orderLineTotal > 0 ? matchedLineTotal / orderLineTotal : 0) : 1;
    const orderGross = hasLineFilter ? matchedLineTotal : o.total;
    const orderTax = Math.round(o.tax * shareOfOrder);
    const orderShipping = Math.round(o.shipping * shareOfOrder);

    grossRevenue += orderGross;
    taxesCollected += orderTax;
    shippingRevenue += orderShipping;
    commissionRevenue += orderCommission;
    vendorRevenue += orderVendorRevenue;

    rows.push({
      orderId: o.id,
      date: o.createdAt,
      total: orderGross,
      tax: orderTax,
      shipping: orderShipping,
      commission: orderCommission,
      vendorRevenue: orderVendorRevenue,
      paymentMethod: o.paymentMethod,
    });
  }

  const netRevenue = grossRevenue - taxesCollected - shippingRevenue;
  const platformRevenue = commissionRevenue;

  return {
    summary: { grossRevenue, netRevenue, platformRevenue, vendorRevenue, commissionRevenue, taxesCollected, shippingRevenue },
    rows: rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 500),
  };
}

export async function computePaymentReport(filters: { from?: string; to?: string }) {
  const orders = await db.select().from(ordersTable);
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;

  const filtered = orders.filter(o => inRange(new Date(o.createdAt), from, to));

  const failed = filtered.filter(o => o.status === "payment_failed");
  const pending = filtered.filter(o => o.status === "pending_payment");
  const successful = filtered.filter(o => o.status !== "cancelled" && o.status !== "payment_failed" && o.status !== "pending_payment");

  const methodBreakdown = new Map<string, { count: number; amount: number }>();
  for (const o of filtered) {
    const cur = methodBreakdown.get(o.paymentMethod) ?? { count: 0, amount: 0 };
    cur.count++;
    cur.amount += o.total;
    methodBreakdown.set(o.paymentMethod, cur);
  }

  return {
    successfulCount: successful.length,
    successfulAmount: successful.reduce((s, o) => s + o.total, 0),
    pendingCount: pending.length,
    pendingAmount: pending.reduce((s, o) => s + o.total, 0),
    failedCount: failed.length,
    failedAmount: failed.reduce((s, o) => s + o.total, 0),
    methodBreakdown: [...methodBreakdown.entries()].map(([method, d]) => ({ method, ...d })),
    transactions: filtered
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 500)
      .map(o => ({ orderId: o.id, date: o.createdAt, amount: o.total, method: o.paymentMethod, status: o.status })),
  };
}

export async function computeRefundReport(filters: { from?: string; to?: string }) {
  const orders = await db.select().from(ordersTable);
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;

  const withRefund = orders.filter(o => o.refundStatus && inRange(new Date(o.createdAt), from, to));
  const approved = withRefund.filter(o => o.refundStatus === "approved" || o.refundStatus === "processed");
  const rejected = withRefund.filter(o => o.refundStatus === "rejected");
  const pending = withRefund.filter(o => o.refundStatus === "pending");

  const reasonCounts = new Map<string, number>();
  for (const o of withRefund) {
    const reason = o.returnReason || o.cancelReason || "Not specified";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const processingTimes: number[] = [];
  for (const o of withRefund) {
    if (o.refundStatus !== "pending" && o.deliveredAt) {
      const hours = (new Date(o.updatedAt).getTime() - new Date(o.deliveredAt).getTime()) / 3600000;
      if (hours > 0) processingTimes.push(hours);
    }
  }
  const avgProcessingHours = processingTimes.length > 0
    ? Math.round((processingTimes.reduce((s, h) => s + h, 0) / processingTimes.length) * 10) / 10
    : 0;

  return {
    totalRequests: withRefund.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    pendingCount: pending.length,
    totalRefundAmount: approved.reduce((s, o) => s + o.total, 0),
    reasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })),
    avgProcessingHours,
    requests: withRefund
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 500)
      .map(o => ({
        orderId: o.id, amount: o.total, status: o.refundStatus,
        reason: o.returnReason || o.cancelReason || "Not specified", date: o.createdAt,
      })),
  };
}

export async function computeProfitAnalysis(period: Period, from?: string, to?: string) {
  const range = resolveRange(period, from, to);
  const [orders, settlements, products, rules] = await Promise.all([
    db.select().from(ordersTable),
    db.select().from(vendorSettlementsTable),
    db.select().from(productsTable),
    loadActiveCommissionRules(),
  ]);
  const productById = new Map(products.map(p => [p.id, p]));

  function orderCommission(o: typeof orders[number]): number {
    const items = (o.items as OrderItem[]) ?? [];
    let commission = 0;
    for (const item of items) {
      const p = productById.get(item.productId);
      const rate = effectiveRateFromRules(rules, p?.vendorId, p?.category);
      commission += Math.round(item.price * (item.quantity ?? 1) * rate);
    }
    return commission;
  }

  const inR = orders.filter(o => new Date(o.createdAt) >= range.from && new Date(o.createdAt) <= range.to);
  const nonCancelled = inR.filter(o => !["cancelled", "returned"].includes(o.status));

  const grossRevenue = nonCancelled.reduce((s, o) => s + o.total, 0);
  const commissionEarnings = nonCancelled.reduce((s, o) => s + orderCommission(o), 0);
  const vendorSettlementsPaid = settlements
    .filter(s => s.status === "completed" && new Date(s.createdAt) >= range.from && new Date(s.createdAt) <= range.to)
    .reduce((s, x) => s + x.amount, 0);
  const operationalCosts = 0;
  const grossProfit = commissionEarnings;
  const netProfit = grossProfit - operationalCosts;

  const monthlyBuckets = new Map<string, { revenue: number; commission: number }>();
  for (const o of nonCancelled) {
    const key = new Date(o.createdAt).toISOString().slice(0, 7);
    const cur = monthlyBuckets.get(key) ?? { revenue: 0, commission: 0 };
    cur.revenue += o.total;
    cur.commission += orderCommission(o);
    monthlyBuckets.set(key, cur);
  }
  const monthlyProfit = [...monthlyBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, d]) => ({ month, profit: d.commission, revenue: d.revenue }));

  const yearlyBuckets = new Map<string, number>();
  for (const o of orders.filter(o => !["cancelled", "returned"].includes(o.status))) {
    const key = String(new Date(o.createdAt).getFullYear());
    yearlyBuckets.set(key, (yearlyBuckets.get(key) ?? 0) + orderCommission(o));
  }
  const yearlyProfit = [...yearlyBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([year, profit]) => ({ year, profit }));

  const prevMonthProfit = monthlyProfit.length >= 2 ? monthlyProfit[monthlyProfit.length - 2].profit : 0;
  const curMonthProfit = monthlyProfit.length >= 1 ? monthlyProfit[monthlyProfit.length - 1].profit : 0;
  const growthPercent = prevMonthProfit > 0
    ? Math.round(((curMonthProfit - prevMonthProfit) / prevMonthProfit) * 1000) / 10
    : (curMonthProfit > 0 ? 100 : 0);

  return {
    grossProfit,
    netProfit,
    marketplaceExpenses: operationalCosts,
    vendorSettlementsPaid,
    commissionEarnings,
    operationalCosts,
    monthlyProfit,
    yearlyProfit,
    profitGrowthPercent: growthPercent,
  };
}

export async function listSettlements(status?: string) {
  const rows = await db.select().from(vendorSettlementsTable).orderBy(desc(vendorSettlementsTable.createdAt));
  const filtered = status ? rows.filter(r => r.status === status) : rows;
  const vendors = await db.select().from(vendorsTable);
  const vendorById = new Map(vendors.map(v => [v.id, v]));

  return filtered.map(s => ({
    id: s.id,
    vendorId: s.vendorId,
    vendorName: vendorById.get(s.vendorId)?.name ?? "Unknown",
    amount: s.amount,
    type: s.type,
    status: s.status,
    paymentMethod: s.paymentMethod,
    transactionId: s.transactionId,
    note: s.note,
    createdAt: s.createdAt,
    reviewedAt: s.reviewedAt,
  }));
}
