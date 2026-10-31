import { db, mongoSellers, mongoProducts, mongoOrders, mongoSettlements, mongoGeneric } from "@workspace/db";
import {
  vendorsTable, productsTable, ordersTable, vendorSettlementsTable, commissionRulesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import type { OrderItem } from "./vendorAnalytics";
import type { Period } from "./businessIntelligence";
import { resolveRange } from "./businessIntelligence";
import { DEFAULT_COMMISSION_RATE, loadActiveCommissionRules, effectiveRateFromRules, getEffectiveCommissionRate } from "./commission";
import { validateDatabaseRecords } from "./dataValidation";
import { syncEligibleOrderSettlements } from "./settlementAutomation";

export { getEffectiveCommissionRate };

export interface RevenueReportFilters {
  from?: string;
  to?: string;
  vendorId?: string;
  category?: string;
  paymentStatus?: string;
}

function inRange(date: Date, from?: Date, to?: Date): boolean {
  if (isNaN(date.getTime())) return false;
  if (from && !isNaN(from.getTime()) && date < from) return false;
  if (to && !isNaN(to.getTime()) && date > to) return false;
  return true;
}

async function getBaseFinancialData() {
  try {
    await syncEligibleOrderSettlements();
  } catch {}

  let rawOrders: any[] = [];
  let rawProducts: any[] = [];
  let vendors: any[] = [];
  let settlements: any[] = [];

  try {
    rawOrders = await mongoOrders.findMany({});
    rawProducts = await mongoProducts.findMany({});
    vendors = await mongoSellers.findMany({});
    settlements = await mongoSettlements.findMany({});
  } catch {}

  if (rawOrders.length === 0) {
    try { rawOrders = await db.select().from(ordersTable); } catch {}
  }
  if (rawProducts.length === 0) {
    try { rawProducts = await db.select().from(productsTable); } catch {}
  }
  if (vendors.length === 0) {
    try { vendors = await db.select().from(vendorsTable); } catch {}
  }
  if (settlements.length === 0) {
    try { settlements = await db.select().from(vendorSettlementsTable); } catch {}
  } else {
    try {
      const sqlSettlements = await db.select().from(vendorSettlementsTable);
      const seen = new Set(settlements.map((s) => String(s.id)));
      for (const ss of sqlSettlements) {
        if (!seen.has(String(ss.id))) {
          settlements.push(ss);
          seen.add(String(ss.id));
        }
      }
    } catch {}
  }

  const rules = await loadActiveCommissionRules();
  return { rawOrders, rawProducts, vendors, settlements, rules };
}

export async function computeRevenueReport(filters: RevenueReportFilters) {
  const { rawOrders, rawProducts, vendors, rules } = await getBaseFinancialData();
  const { validOrders: orders, validProducts: products, summary: dataValidation } =
    validateDatabaseRecords(rawOrders, rawProducts, vendors);
  const productById = new Map(products.map(p => [p.id, p]));

  const vendorById = new Map<string, any>();
  for (const v of vendors) {
    if (!v) continue;
    const aliases = [v.id, v.vendorId, v.sellerId, v.ownerId, v.userId, v._id ? String(v._id) : null].filter(Boolean);
    for (const a of aliases) {
      vendorById.set(String(a), v);
      vendorById.set(String(a).toLowerCase(), v);
    }
  }

  let allowedVendorFilterIds: Set<string> | null = null;
  if (filters.vendorId) {
    const matchedVendor = vendorById.get(filters.vendorId) || vendorById.get(filters.vendorId.toLowerCase());
    if (matchedVendor) {
      allowedVendorFilterIds = new Set([
        filters.vendorId,
        filters.vendorId.toLowerCase(),
        matchedVendor.id,
        matchedVendor.vendorId,
        matchedVendor.sellerId,
        matchedVendor.ownerId,
        matchedVendor.userId,
        matchedVendor._id ? String(matchedVendor._id) : null,
      ].filter(Boolean).map(String));
    }
  }

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
    if (!Array.isArray(items)) continue;

    const hasLineFilter = !!filters.vendorId || !!filters.category;
    let orderMatchesFilter = !hasLineFilter;
    let orderCommission = 0;
    let orderVendorRevenue = 0;
    let matchedLineTotal = 0;
    const orderLineTotal = items.reduce((s, i) => {
      const p = typeof i?.price === "number" ? i.price : parseFloat(i?.price as any) || 0;
      const q = typeof i?.quantity === "number" && i.quantity > 0 ? i.quantity : 1;
      return s + p * q;
    }, 0);

    for (const item of items) {
      if (!item) continue;
      const price = typeof item.price === "number" ? item.price : parseFloat(item.price as any);
      if (isNaN(price) || price < 0) continue;
      const qty = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;

      const p = productById.get(item.productId);
      if (filters.vendorId) {
        if (allowedVendorFilterIds) {
          if (!allowedVendorFilterIds.has(p?.vendorId) && !allowedVendorFilterIds.has(String(p?.vendorId).toLowerCase())) continue;
        } else if (p?.vendorId !== filters.vendorId) {
          continue;
        }
      }
      if (filters.category && p?.category !== filters.category) continue;
      orderMatchesFilter = true;

      const lineTotal = price * qty;
      matchedLineTotal += lineTotal;
      const rate = rateFor(p?.vendorId, p?.category);
      const commission = Math.round(lineTotal * rate);
      orderCommission += commission;
      orderVendorRevenue += lineTotal - commission;
    }
    if (!orderMatchesFilter) continue;

    const shareOfOrder = hasLineFilter ? (orderLineTotal > 0 ? matchedLineTotal / orderLineTotal : 0) : 1;
    const orderGross = hasLineFilter ? matchedLineTotal : (typeof o.total === "number" ? o.total : parseFloat(o.total as any) || 0);
    const taxVal = typeof o.tax === "number" ? o.tax : parseFloat(o.tax as any) || 0;
    const shipVal = typeof o.shipping === "number" ? o.shipping : parseFloat(o.shipping as any) || 0;

    const orderTax = Math.round(taxVal * shareOfOrder);
    const orderShipping = Math.round(shipVal * shareOfOrder);

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
      paymentMethod: o.paymentMethod || "unknown",
    });
  }

  const netRevenue = grossRevenue - taxesCollected - shippingRevenue;
  const platformRevenue = commissionRevenue;

  return {
    summary: { grossRevenue, netRevenue, platformRevenue, vendorRevenue, commissionRevenue, taxesCollected, shippingRevenue },
    rows: rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 500),
    dataValidation,
  };
}

export function getNextWednesdayPayoutDate(from: Date = new Date()): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  // If today is Wednesday and before 10 AM, next cycle is today at 10 AM. Otherwise next Wednesday.
  let diff = (3 - day + 7) % 7;
  if (diff === 0 && d.getHours() >= 10) {
    diff = 7;
  }
  d.setDate(d.getDate() + diff);
  d.setHours(10, 0, 0, 0);
  return d;
}

export async function computePaymentReport(filters: { from?: string; to?: string }) {
  const { rawOrders, rawProducts, vendors } = await getBaseFinancialData();
  const { validOrders: orders, summary: dataValidation } = validateDatabaseRecords(rawOrders, rawProducts, vendors);
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;

  const filtered = orders.filter(o => inRange(new Date(o.createdAt), from, to));

  const failed = filtered.filter(o => o.status === "payment_failed" || o.paymentStatus === "failed");
  const pending = filtered.filter(o => o.status === "pending_payment" || o.paymentStatus === "pending");
  const successful = filtered.filter(o => o.paymentStatus === "paid" || (!["cancelled", "payment_failed", "pending_payment"].includes(o.status)));
  const refunded = filtered.filter(o => o.refundStatus === "approved" || o.refundStatus === "processed" || o.refundStatus === "completed");

  const methodBreakdown = new Map<string, { count: number; amount: number }>();
  for (const o of filtered) {
    const method = o.paymentMethod || "unknown";
    const cur = methodBreakdown.get(method) ?? { count: 0, amount: 0 };
    cur.count++;
    const tot = typeof o.total === "number" ? o.total : parseFloat(o.total as any) || 0;
    cur.amount += tot;
    methodBreakdown.set(method, cur);
  }

  const getTot = (o: any) => typeof o.total === "number" ? o.total : parseFloat(o.total as any) || 0;

  return {
    successfulCount: successful.length,
    successfulAmount: successful.reduce((s, o) => s + getTot(o), 0),
    pendingCount: pending.length,
    pendingAmount: pending.reduce((s, o) => s + getTot(o), 0),
    failedCount: failed.length,
    failedAmount: failed.reduce((s, o) => s + getTot(o), 0),
    refundedCount: refunded.length,
    refundedAmount: refunded.reduce((s, o) => s + getTot(o), 0),
    methodBreakdown: [...methodBreakdown.entries()].map(([method, d]) => ({ method, ...d })),
    transactions: filtered
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 500)
      .map(o => ({
        orderId: o.id,
        displayId: o.displayId || o.id,
        customerName: (o.address as any)?.name || "Customer",
        date: o.createdAt,
        paymentVerifiedAt: o.paymentVerifiedAt || o.createdAt,
        amount: getTot(o),
        method: o.paymentMethod || "unknown",
        paymentStatus: o.paymentStatus || (o.status === "payment_failed" ? "failed" : o.status === "pending_payment" ? "pending" : "paid"),
        orderStatus: o.status,
        gatewayReference: o.cashfreePaymentId || o.cashfreeOrderId || null,
      })),
    dataValidation,
  };
}

export async function computeRefundReport(filters: { from?: string; to?: string }) {
  const { rawOrders, rawProducts, vendors } = await getBaseFinancialData();
  const { validOrders: orders, summary: dataValidation } = validateDatabaseRecords(rawOrders, rawProducts, vendors);
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;

  const withRefund = orders.filter(o => o.refundStatus && o.refundStatus !== "none" && inRange(new Date(o.createdAt), from, to));
  const approved = withRefund.filter(o => o.refundStatus === "approved" || o.refundStatus === "processed" || o.refundStatus === "completed");
  const rejected = withRefund.filter(o => o.refundStatus === "rejected");
  const pending = withRefund.filter(o => o.refundStatus === "pending");

  const reasonCounts = new Map<string, number>();
  for (const o of withRefund) {
    const reason = o.returnReason || o.cancelReason || "Not specified";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const processingTimes: number[] = [];
  for (const o of withRefund) {
    if (o.refundStatus !== "pending" && o.deliveredAt && o.updatedAt) {
      const hours = (new Date(o.updatedAt).getTime() - new Date(o.deliveredAt).getTime()) / 3600000;
      if (!isNaN(hours) && hours > 0) processingTimes.push(hours);
    }
  }
  const avgProcessingHours = processingTimes.length > 0
    ? Math.round((processingTimes.reduce((s, h) => s + h, 0) / processingTimes.length) * 10) / 10
    : 0;

  const getTot = (o: any) => typeof o.total === "number" ? o.total : parseFloat(o.total as any) || 0;

  return {
    totalRequests: withRefund.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    pendingCount: pending.length,
    totalRefundAmount: approved.reduce((s, o) => s + getTot(o), 0),
    reasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })),
    avgProcessingHours,
    requests: withRefund
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 500)
      .map(o => ({
        orderId: o.id,
        displayId: o.displayId || o.id,
        customerName: (o.address as any)?.name || "Customer",
        amount: getTot(o),
        status: o.refundStatus,
        refundStatus: o.refundStatus,
        refundMethod: o.refundMethod || "original_payment",
        reason: o.returnReason || o.cancelReason || "Customer request",
        date: o.createdAt,
        refundProcessedAt: o.refundProcessedAt || null,
        providerReference: o.refundReference || o.refundId || o.cashfreePaymentId || null,
        originalPaymentMethod: o.paymentMethod || "unknown",
      })),
    dataValidation,
  };
}

export async function computeProfitAnalysis(period: Period, from?: string, to?: string) {
  const range = resolveRange(period, from, to);
  const { rawOrders, settlements, rawProducts, vendors: rawVendors, rules } = await getBaseFinancialData();
  const { validOrders: orders, validProducts: products, validSettlements: validSettlements, summary: dataValidation } =
    validateDatabaseRecords(rawOrders, rawProducts, rawVendors, settlements);
  const productById = new Map(products.map(p => [p.id, p]));

  function orderCommission(o: typeof orders[number]): number {
    const items = (o.items as OrderItem[]) ?? [];
    if (!Array.isArray(items)) return 0;
    let commission = 0;
    for (const item of items) {
      if (!item) continue;
      const price = typeof item.price === "number" ? item.price : parseFloat(item.price as any);
      if (isNaN(price) || price < 0) continue;
      const qty = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;

      const p = productById.get(item.productId);
      const rate = effectiveRateFromRules(rules, p?.vendorId, p?.category);
      commission += Math.round(price * qty * rate);
    }
    return commission;
  }

  const getTot = (o: any) => typeof o.total === "number" ? o.total : parseFloat(o.total as any) || 0;

  const inR = orders.filter(o => inRange(new Date(o.createdAt), range.from, range.to));
  const nonCancelled = inR.filter(o => !["cancelled", "returned", "payment_failed"].includes(o.status));

  const grossRevenue = nonCancelled.reduce((s, o) => s + getTot(o), 0);
  const commissionEarnings = nonCancelled.reduce((s, o) => s + orderCommission(o), 0);

  // Completed / paid settlements in the period
  const vendorSettlementsPaid = validSettlements
    .filter(s => (s.status === "completed" || s.status === "paid") && inRange(new Date(s.createdAt), range.from, range.to))
    .reduce((s, x) => s + (typeof x.amount === "number" ? x.amount : parseFloat(x.amount as any) || 0), 0);

  // Refund deductions: refunded amounts during this period
  const refundedOrders = inR.filter(o => ["approved", "processed", "completed"].includes(o.refundStatus));
  const refundsDeducted = refundedOrders.reduce((s, o) => s + (typeof o.refundAmount === "number" ? o.refundAmount : getTot(o)), 0);

  // Estimated payment gateway fees: 1.8% on online captured payments (excluding COD)
  const onlinePaymentsTotal = nonCancelled
    .filter(o => o.paymentMethod !== "cod")
    .reduce((s, o) => s + getTot(o), 0);
  const estimatedGatewayFees = Math.round(onlinePaymentsTotal * 0.018);

  const operationalCosts = estimatedGatewayFees;
  const grossProfit = commissionEarnings;
  const netProfit = Math.max(0, grossProfit - operationalCosts - Math.round(refundsDeducted * 0.1)); // Platform share of refund impact

  const monthlyBuckets = new Map<string, { revenue: number; commission: number; refunds: number }>();
  for (const o of nonCancelled) {
    const key = new Date(o.createdAt).toISOString().slice(0, 7);
    const cur = monthlyBuckets.get(key) ?? { revenue: 0, commission: 0, refunds: 0 };
    cur.revenue += getTot(o);
    cur.commission += orderCommission(o);
    monthlyBuckets.set(key, cur);
  }
  for (const o of refundedOrders) {
    const key = new Date(o.createdAt).toISOString().slice(0, 7);
    const cur = monthlyBuckets.get(key) ?? { revenue: 0, commission: 0, refunds: 0 };
    cur.refunds += getTot(o);
    monthlyBuckets.set(key, cur);
  }

  const monthlyProfit = [...monthlyBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, d]) => ({
      month,
      profit: Math.max(0, d.commission - Math.round(d.revenue * 0.018)),
      revenue: d.revenue,
      commission: d.commission,
      refunds: d.refunds,
    }));

  const yearlyBuckets = new Map<string, number>();
  for (const o of nonCancelled) {
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
    estimatedGatewayFees,
    refundsDeducted,
    vendorSettlementsPaid,
    commissionEarnings,
    operationalCosts,
    monthlyProfit,
    yearlyProfit,
    profitGrowthPercent: growthPercent,
    dataValidation,
  };
}

export async function listSettlements(status?: string, vendorIdFilter?: string) {
  const { settlements: rows, vendors } = await getBaseFinancialData();
  const vendorById = new Map<string, any>();
  for (const v of vendors) {
    if (!v) continue;
    const aliases = [
      v.id,
      v.vendorId,
      v.sellerId,
      v.ownerId,
      v.userId,
      v._id ? String(v._id) : null,
    ].filter((val): val is string => typeof val === "string" && val.trim().length > 0);

    for (const a of aliases) {
      vendorById.set(a, v);
      vendorById.set(a.toLowerCase(), v);
    }
    if (v.name) vendorById.set(String(v.name).toLowerCase(), v);
    if (v.shopName) vendorById.set(String(v.shopName).toLowerCase(), v);
  }

  const { validSettlements: filtered, summary: dataValidation } = validateDatabaseRecords([], [], vendors, rows);
  let result = status ? filtered.filter(r => r.status === status) : filtered;
  if (vendorIdFilter) {
    const matchedVendor = vendorById.get(vendorIdFilter) || vendorById.get(vendorIdFilter.toLowerCase());
    if (matchedVendor) {
      const allowed = new Set([
        vendorIdFilter,
        vendorIdFilter.toLowerCase(),
        matchedVendor.id,
        matchedVendor.vendorId,
        matchedVendor.sellerId,
        matchedVendor.ownerId,
        matchedVendor.userId,
        matchedVendor._id ? String(matchedVendor._id) : null,
      ].filter(Boolean).map(String));
      result = result.filter(r => r.vendorId === vendorIdFilter || allowed.has(r.vendorId) || allowed.has(String(r.vendorId).toLowerCase()));
    } else {
      result = result.filter(r => r.vendorId === vendorIdFilter || String(r.vendorId).toLowerCase() === vendorIdFilter.toLowerCase());
    }
  }

  const nextWednesdayPayout = getNextWednesdayPayoutDate();

  const mapped = result.map(s => {
    const isPaise = s.pricingVersion === "v2" || (typeof s.amount === "number" && s.amount > 10000 && !s.netPayout && !s.productAmount);
    const amountInRupees = isPaise
      ? Math.round(Number(s.sellerSettlement ?? s.amount) / 100)
      : Number(s.netPayout ?? s.amount ?? 0);
    const vendor = vendorById.get(s.vendorId) || vendorById.get(String(s.vendorId).toLowerCase());
    const resolvedVendorName = vendor?.shopName || vendor?.name || vendor?.sellerName || "Unknown Vendor";
    const resolvedSellerId = vendor?.sellerId || vendor?.vendorId || s.vendorId;

    return {
      id: s.id,
      vendorId: s.vendorId,
      sellerId: resolvedSellerId,
      vendorName: resolvedVendorName,
      shopName: vendor?.shopName || resolvedVendorName,
      amount: amountInRupees,
      rawAmount: s.amount,
      type: s.type,
      status: s.status,
      paymentMethod: s.paymentMethod,
      transactionId: s.transactionId,
      utrNumber: s.utrNumber,
      note: s.note,
      createdAt: s.createdAt,
      reviewedAt: s.reviewedAt,
      paidAt: s.paidAt,
      orderId: s.orderId,
      productAmount: s.productAmount != null ? s.productAmount : (s.sellerBasePrice ? Math.round(s.sellerBasePrice / 100) : null),
      commission: s.commission != null ? s.commission : (s.platformCommission ? Math.round(s.platformCommission / 100) : null),
      commissionRate: s.commissionRate,
      shippingCharge: s.shippingCharge != null ? s.shippingCharge : (s.shippingFee ? Math.round(s.shippingFee / 100) : null),
      settlementTax: s.settlementTax != null ? s.settlementTax : (s.gstOnCommission ? Math.round(s.gstOnCommission / 100) : null),
      netPayout: amountInRupees,
      cashfreeTransferId: s.cashfreeTransferId ?? null,
      failureReason: s.failureReason ?? null,
      settlementEligibilityDate: s.settlementEligibilityDate ?? null,
      idempotencyKey: s.idempotencyKey ?? null,
      pricingVersion: s.pricingVersion ?? "v1",
      platformKeeps: s.platformKeeps != null ? (s.pricingVersion === "v2" ? Math.round(s.platformKeeps / 100) : s.platformKeeps) : null,
      nextScheduledPayout: nextWednesdayPayout.toISOString(),
    };
  });

  const pendingTotal = mapped
    .filter(s => ["pending", "eligible", "approved", "processing", "on_hold"].includes(String(s.status || "").toLowerCase()))
    .reduce((s, x) => s + (x.amount || 0), 0);
  const completedTotal = mapped
    .filter(s => ["completed", "paid"].includes(String(s.status || "").toLowerCase()))
    .reduce((s, x) => s + (x.amount || 0), 0);

  return {
    settlements: mapped,
    summary: {
      pendingTotal,
      completedTotal,
      count: mapped.length,
    },
    nextWednesdayPayoutDate: nextWednesdayPayout.toISOString(),
    dataValidation,
  };
}
