import { db, mongoSellers, mongoProducts, mongoOrders, mongoGeneric, getCanonicalSellerId, isInternalRawId } from "@workspace/db";
import {
  vendorsTable, productsTable, ordersTable, productReviewsTable,
  productQueriesTable, vendorSettlementsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadActiveCommissionRules, effectiveRateFromRules } from "./commission";
import { filterRealtimeOrders, buildRealtimeOrderMongoFilter } from "./orderFilter";

export type OrderItem = { productId: string; price: number; quantity: number; name?: string; basePrice?: number; sellerBasePrice?: number; commissionBps?: number; commissionRate?: number };

export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function getItemBasePrice(item: any, productCatalogFallback?: any): number {
  if (item == null) return 0;
  if (item.basePrice != null && !isNaN(Number(item.basePrice)) && Number(item.basePrice) > 0) {
    return Number(item.basePrice);
  }
  if (item.sellerBasePrice != null && !isNaN(Number(item.sellerBasePrice)) && Number(item.sellerBasePrice) > 0) {
    const sbp = Number(item.sellerBasePrice);
    const p = Number(item.price) || 0;
    if (p > 0 && sbp >= p * 50) {
      return roundCurrency(sbp / 100);
    }
    return sbp;
  }
  if (item.originalPrice != null && !isNaN(Number(item.originalPrice)) && Number(item.originalPrice) > 0) {
    return Number(item.originalPrice);
  }
  if (productCatalogFallback) {
    if (productCatalogFallback.basePrice != null && !isNaN(Number(productCatalogFallback.basePrice)) && Number(productCatalogFallback.basePrice) > 0) {
      return Number(productCatalogFallback.basePrice);
    }
    if (productCatalogFallback.originalPrice != null && !isNaN(Number(productCatalogFallback.originalPrice)) && Number(productCatalogFallback.originalPrice) > 0) {
      return Number(productCatalogFallback.originalPrice);
    }
  }
  if (item.price != null && !isNaN(Number(item.price)) && Number(item.price) > 0) {
    return Number(item.price);
  }
  return 0;
}

export function getItemCommissionRate(
  item: any,
  commissionRules: any[] = [],
  vendorId?: string,
  category?: string,
  orderDate: Date = new Date()
): number {
  if (item?.commissionRate != null && !isNaN(Number(item.commissionRate)) && Number(item.commissionRate) > 0) {
    return Number(item.commissionRate);
  }
  if (item?.commissionBps != null && !isNaN(Number(item.commissionBps)) && Number(item.commissionBps) > 0) {
    return Number(item.commissionBps) / 10000;
  }
  return effectiveRateFromRules(commissionRules, vendorId, category, orderDate, 0.18);
}

export interface VendorAggregate {
  vendor: typeof vendorsTable.$inferSelect;
  productIds: Set<string>;
  customerIds?: Set<string>;
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
  deliveredSellerEarnings?: number;
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
  let vendors: any[] = [];
  let products: any[] = [];
  let orders: any[] = [];
  let reviews: any[] = [];
  let settlements: any[] = [];

  try {
    vendors = await mongoSellers.findMany({});
    products = await mongoProducts.findMany({});
    orders = filterRealtimeOrders(await mongoOrders.findMany(buildRealtimeOrderMongoFilter()));
    try { reviews = await mongoGeneric.getCollection("reviews").find({}).toArray(); } catch {}
    try { settlements = await mongoGeneric.getCollection("vendor_settlements").find({}).toArray(); } catch {}
  } catch {}

  let sqlVendors: any[] = [];
  try {
    sqlVendors = await db.select().from(vendorsTable);
  } catch {}

  // Combine MongoDB and SQL vendors, deduplicating by vendor keys
  const vendorMapByKey = new Map<string, any>();
  const allRawVendors = [...vendors, ...sqlVendors];

  for (const v of allRawVendors) {
    if (!v) continue;
    const cleanEmail = (v.email || v.contactEmail || v.ownerEmail || "").trim().toLowerCase();
    const canonicalId = getCanonicalSellerId(v);
    const key = cleanEmail
      ? `email:${cleanEmail}`
      : (canonicalId && !isInternalRawId(canonicalId)
          ? `canon:${canonicalId}`
          : (v.ownerId ? `owner:${v.ownerId}` : `id:${v.id || v._id || canonicalId}`
        ));
    if (!key) continue;
    if (!vendorMapByKey.has(key)) {
      const canonicalSellerId = getCanonicalSellerId(v);
      vendorMapByKey.set(key, {
        ...v,
        vendorId: canonicalSellerId || v.vendorId,
        sellerId: canonicalSellerId || v.sellerId,
      });
    } else {
      const existing = vendorMapByKey.get(key);
      const existingCanonical = getCanonicalSellerId(existing);
      const bestCanonical = (canonicalId && !isInternalRawId(canonicalId))
        ? canonicalId
        : existingCanonical;
      Object.assign(existing, {
        ...v,
        id: existing.id || v.id,
        vendorId: bestCanonical || existing.vendorId || v.vendorId,
        sellerId: bestCanonical || existing.sellerId || v.sellerId,
        ownerId: existing.ownerId || v.ownerId,
      });
    }
  }

  const allVendors = [...vendorMapByKey.values()];

  if (allVendors.length === 0) {
    return new Map();
  }

  if (products.length === 0) {
    try {
      products = await db
        .select({
          id: productsTable.id, vendorId: productsTable.vendorId, active: productsTable.active,
          stock: productsTable.stock, lowStockThreshold: productsTable.lowStockThreshold,
          isFeatured: productsTable.isFeatured, category: productsTable.category,
        })
        .from(productsTable);
    } catch {}
  }

  if (orders.length === 0) {
    try {
      orders = filterRealtimeOrders(await db.select().from(ordersTable));
    } catch {}
  }

  if (reviews.length === 0) {
    try {
      reviews = await db.select().from(productReviewsTable);
    } catch {}
  }

  if (settlements.length === 0) {
    try {
      settlements = await db.select().from(vendorSettlementsTable);
    } catch {}
  }

  const commissionRules = await loadActiveCommissionRules();

  // Build ID lookup mapping (id / vendorId / sellerId / _id / ownerId -> primary ID)
  const vendorIdToPrimaryId = new Map<string, string>();
  for (const v of allVendors) {
    const canonicalId = getCanonicalSellerId(v);
    const primaryId = canonicalId || String(v.id || v._id || v.vendorId || v.sellerId);
    if (v.id) vendorIdToPrimaryId.set(String(v.id), primaryId);
    if (v._id) vendorIdToPrimaryId.set(String(v._id), primaryId);
    if (v.vendorId) vendorIdToPrimaryId.set(String(v.vendorId), primaryId);
    if (v.sellerId) vendorIdToPrimaryId.set(String(v.sellerId), primaryId);
    if (v.ownerId) vendorIdToPrimaryId.set(String(v.ownerId), primaryId);
    if (canonicalId) vendorIdToPrimaryId.set(canonicalId, primaryId);
  }

  const productToVendor = new Map<string, string>();
  const productToCategory = new Map<string, string | null>();
  const productCatalogMap = new Map<string, any>();

  for (const p of products) {
    if (p.id) productCatalogMap.set(String(p.id), p);
    if (p._id) productCatalogMap.set(String(p._id), p);
    const rawVendorId = p.vendorId || p.sellerId;
    const primaryVendorId = vendorIdToPrimaryId.get(String(rawVendorId)) || String(rawVendorId);
    if (primaryVendorId) {
      productToVendor.set(String(p.id), primaryVendorId);
    }
    if (p.category) {
      productToCategory.set(String(p.id), String(p.category));
    }
  }

  const map = new Map<string, VendorAggregate>();

  for (const v of allVendors) {
    const canonicalId = getCanonicalSellerId(v);
    const primaryId = canonicalId || String(v.id || v._id || v.vendorId || v.sellerId);
    if (canonicalId) {
      v.vendorId = canonicalId;
      v.sellerId = canonicalId;
    }
    
    const vendorProducts = products.filter(p => {
      const pVendor = String(p.vendorId || p.sellerId || "");
      return pVendor === primaryId || vendorIdToPrimaryId.get(pVendor) === primaryId;
    });

    const activeProds = vendorProducts.filter(p => p.active !== false && p.status !== "inactive" && p.status !== "deleted").length;
    const totalProds = vendorProducts.length;

    map.set(primaryId, {
      vendor: v,
      productIds: new Set(vendorProducts.map(p => String(p.id))),
      customerIds: new Set<string>(),
      totalProducts: totalProds,
      activeProducts: activeProds,
      inactiveProducts: Math.max(0, totalProds - activeProds),
      featuredProducts: vendorProducts.filter(p => Boolean(p.isFeatured)).length,
      outOfStockProducts: vendorProducts.filter(p => (Number(p.stock) || 0) <= 0).length,
      lowStockProducts: vendorProducts.filter(p => (Number(p.stock) || 0) > 0 && (Number(p.stock) || 0) <= (Number(p.lowStockThreshold) || 5)).length,
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
      deliveredSellerEarnings: 0,
      registeredAt: v.termsAcceptedAt || v.createdAt ? new Date(v.termsAcceptedAt || v.createdAt) : null,
      totalCustomers: 0,
      newCustomers30d: 0,
      repeatCustomers: 0,
      avgRating: Number(v.rating) || 0,
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

  const seenOrderIds = new Set<string>();

  for (const order of orders) {
    const orderKeys = [order.id, order._id, order.orderId, order.displayId]
      .filter(Boolean)
      .map(k => String(k).trim())
      .filter(k => k.length > 0);

    if (orderKeys.length > 0 && orderKeys.some(k => seenOrderIds.has(k))) {
      continue;
    }
    orderKeys.forEach(k => seenOrderIds.add(k));

    const items = (order.items as OrderItem[]) ?? [];
    if (!Array.isArray(items)) continue;

    const touchedVendors = new Set<string>();
    for (const item of items) {
      const rawVendorId = (item as any).vendorId || (item as any).sellerId || productToVendor.get(String(item.productId));
      if (!rawVendorId) continue;
      const primaryVendorId = vendorIdToPrimaryId.get(String(rawVendorId)) || String(rawVendorId);
      touchedVendors.add(primaryVendorId);
    }

    for (const vendorId of touchedVendors) {
      const agg = map.get(vendorId);
      if (!agg) continue;

      agg.ordersReceived++;
      const status = String(order.status || "").toLowerCase();
      const paymentStatus = String(order.paymentStatus || order.payment?.status || "").toLowerCase();
      const refundStatus = String(order.refundStatus || "").toLowerCase();

      if (status === "delivered") agg.ordersDelivered++;
      if (status === "dispatched") agg.ordersDispatched++;
      if (status === "cancelled") agg.ordersCancelled++;
      if (status === "returned") agg.ordersReturned++;
      if (status === "confirmed") agg.ordersConfirmed++;

      const vendorItems = items.filter(i => {
        const rawV = (i as any).vendorId || (i as any).sellerId || productToVendor.get(String(i.productId));
        if (!rawV) return false;
        const primaryV = vendorIdToPrimaryId.get(String(rawV)) || String(rawV);
        return primaryV === vendorId;
      });

      let vendorBaseTotal = 0;
      let vendorCommissionTotal = 0;
      let itemRefundsTotal = 0;

      for (const item of vendorItems) {
        const itemStatus = String((item as any).status || "").toLowerCase();
        const fullQty = Math.max(1, Number((item as any).quantity) || 1);
        const returnedQty = Math.max(0, Number((item as any).returnedQuantity || (item as any).refundedQuantity) || 0);
        const prod = productCatalogMap.get(String(item.productId));
        const basePrice = getItemBasePrice(item, prod);

        if (itemStatus === "cancelled") {
          continue;
        }

        if (itemStatus === "returned" || itemStatus === "refunded") {
          itemRefundsTotal = roundCurrency(itemRefundsTotal + basePrice * fullQty);
          continue;
        }

        const eligibleQty = Math.max(0, fullQty - returnedQty);
        if (returnedQty > 0) {
          itemRefundsTotal = roundCurrency(itemRefundsTotal + basePrice * returnedQty);
        }

        if (eligibleQty > 0) {
          const itemBaseTotal = roundCurrency(basePrice * eligibleQty);
          const category = productToCategory.get(String(item.productId)) ?? undefined;
          const rate = getItemCommissionRate(
            item,
            commissionRules,
            vendorId,
            category,
            order.createdAt ? new Date(order.createdAt) : undefined
          );
          const itemCommission = roundCurrency(itemBaseTotal * rate);

          vendorBaseTotal = roundCurrency(vendorBaseTotal + itemBaseTotal);
          vendorCommissionTotal = roundCurrency(vendorCommissionTotal + itemCommission);
        }
      }

      const isCancelledOrReturned = ["cancelled", "returned", "failed"].includes(status);
      const isPaymentFailed = paymentStatus === "failed" || status === "payment_failed";

      const isPartialRefund = refundStatus === "partial" || refundStatus === "partially_refunded" ||
        (order.refundAmount != null && Number(order.refundAmount) > 0 && Number(order.refundAmount) < (Number(order.totalAmount || order.total) || Infinity));
      const isFullRefund = ["processed", "approved", "completed"].includes(refundStatus) && !isPartialRefund;

      let vendorEligibleBaseTotal = vendorBaseTotal;
      let vendorEligibleCommission = vendorCommissionTotal;

      if (isCancelledOrReturned || isPaymentFailed || isFullRefund) {
        if (status === "returned" || isFullRefund) {
          agg.refundedAmount = roundCurrency(agg.refundedAmount + vendorBaseTotal + itemRefundsTotal);
        } else if (itemRefundsTotal > 0) {
          agg.refundedAmount = roundCurrency(agg.refundedAmount + itemRefundsTotal);
        }
      } else {
        if (itemRefundsTotal > 0) {
          agg.refundedAmount = roundCurrency(agg.refundedAmount + itemRefundsTotal);
        }

        if (isPartialRefund) {
          let partialRefundShare = 0;
          if (order.refundAmount != null && Number(order.refundAmount) > 0) {
            partialRefundShare = roundCurrency(Math.min(vendorBaseTotal, Number(order.refundAmount)));
          } else {
            partialRefundShare = roundCurrency(vendorBaseTotal * 0.5);
          }
          vendorEligibleBaseTotal = roundCurrency(Math.max(0, vendorBaseTotal - partialRefundShare));
          const effectiveRate = vendorBaseTotal > 0 ? (vendorCommissionTotal / vendorBaseTotal) : 0.18;
          vendorEligibleCommission = roundCurrency(vendorEligibleBaseTotal * effectiveRate);
          agg.refundedAmount = roundCurrency(agg.refundedAmount + partialRefundShare);
        }

        agg.grossRevenue = roundCurrency(agg.grossRevenue + vendorEligibleBaseTotal);
        agg.commissionEarned = roundCurrency(agg.commissionEarned + vendorEligibleCommission);

        if (status === "delivered") {
          const sellerNet = roundCurrency(vendorEligibleBaseTotal - vendorEligibleCommission);
          agg.deliveredSellerEarnings = roundCurrency((agg.deliveredSellerEarnings || 0) + sellerNet);
        }
      }

      const monthKey = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7);
      if (!monthlyMap.has(vendorId)) monthlyMap.set(vendorId, new Map());
      const vMonthly = monthlyMap.get(vendorId)!;
      const prev = vMonthly.get(monthKey) ?? { revenue: 0, orders: 0 };
      const isEligibleOrder = !isCancelledOrReturned && !isPaymentFailed && !isFullRefund;
      if (isEligibleOrder) {
        vMonthly.set(monthKey, { revenue: roundCurrency(prev.revenue + vendorEligibleBaseTotal), orders: prev.orders + 1 });
      } else if (!vMonthly.has(monthKey)) {
        vMonthly.set(monthKey, prev);
      }

      if (order.userId) {
        agg.customerIds?.add(String(order.userId));
        if (!customerOrderCount.has(vendorId)) customerOrderCount.set(vendorId, new Map());
        const vCustomers = customerOrderCount.get(vendorId)!;
        vCustomers.set(order.userId, (vCustomers.get(order.userId) ?? 0) + 1);

        const key = `${vendorId}:${order.userId}`;
        const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
        if (!customerFirstOrder.has(key) || createdAt < customerFirstOrder.get(key)!) {
          customerFirstOrder.set(key, createdAt);
        }
      }
    }
  }

  for (const [vendorId, agg] of map) {
    agg.netRevenue = roundCurrency(Math.max(0, agg.grossRevenue - agg.commissionEarned));

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
    const rawV = r.vendorId || productToVendor.get(String(r.productId));
    if (!rawV) continue;
    const vendorId = vendorIdToPrimaryId.get(String(rawV)) || String(rawV);
    const agg = map.get(vendorId);
    if (!agg) continue;

    agg.reviewCount++;
    const ratingNum = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5)));
    const bucket = String(ratingNum);
    agg.ratingDistribution[bucket] = (agg.ratingDistribution[bucket] ?? 0) + 1;
  }

  for (const agg of map.values()) {
    if (agg.reviewCount > 0) {
      const sum = Object.entries(agg.ratingDistribution).reduce((s, [star, count]) => s + Number(star) * count, 0);
      agg.avgRating = Math.round((sum / agg.reviewCount) * 10) / 10;
    }
  }

  const isPaise = (s: any) => s.pricingVersion === "v2" || (typeof s.amount === "number" && s.amount > 10000 && !s.netPayout && !s.productAmount);
  const getAmtRupees = (s: any) => isPaise(s)
    ? Math.round(Number(s.sellerSettlement ?? s.amount) / 100)
    : Number(s.netPayout ?? s.amount ?? 0);

  const vendorHasSettlementRecords = new Set<string>();

  for (const s of settlements) {
    const rawV = s.vendorId;
    if (!rawV) continue;
    const vendorId = vendorIdToPrimaryId.get(String(rawV)) || vendorIdToPrimaryId.get(String(rawV).toLowerCase()) || String(rawV);
    const agg = map.get(vendorId);
    if (!agg) continue;

    const amt = getAmtRupees(s);
    const st = String(s.status || "").toLowerCase();
    if (st === "completed" || st === "paid") {
      agg.completedSettlement = roundCurrency(agg.completedSettlement + amt);
      vendorHasSettlementRecords.add(vendorId);
    } else if (["pending", "eligible", "approved", "processing", "on_hold"].includes(st)) {
      agg.pendingSettlement = roundCurrency(agg.pendingSettlement + amt);
      vendorHasSettlementRecords.add(vendorId);
    }
  }

  for (const [vendorId, agg] of map.entries()) {
    // If settlements records exist for this vendor, agg.pendingSettlement is already set accurately from database records!
    // If no settlement records exist in DB for this vendor yet, fall back to delivered seller earnings awaiting settlement:
    if (!vendorHasSettlementRecords.has(vendorId)) {
      const deliveredRevenue = (agg.deliveredSellerEarnings && agg.deliveredSellerEarnings > 0)
        ? agg.deliveredSellerEarnings
        : roundCurrency((agg.ordersDelivered / Math.max(1, agg.ordersReceived)) * agg.netRevenue);
      agg.pendingSettlement = roundCurrency(Math.max(0, deliveredRevenue - agg.completedSettlement));
    }
  }

  for (const [primaryId, agg] of Array.from(map.entries())) {
    const v = agg.vendor as any;
    const aliases = [
      v.id,
      v._id,
      v.vendorId,
      v.sellerId,
      v.ownerId,
      getCanonicalSellerId(v),
    ].filter(Boolean).map(String);
    for (const alias of aliases) {
      if (!map.has(alias)) {
        map.set(alias, agg);
      }
    }
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
  let queries: any[] = [];
  try {
    queries = await mongoGeneric.getCollection("product_queries").find({}).toArray();
  } catch {}

  if (queries.length === 0) {
    try {
      queries = await db.select().from(productQueriesTable);
    } catch {}
  }

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
