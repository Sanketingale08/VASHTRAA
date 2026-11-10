import { Router } from "express";
import { db, mongoSellers, mongoProducts, mongoOrders, getCanonicalSellerId } from "@workspace/db";
import { vendorsTable, ordersTable, vendorSettlementsTable, productsTable } from "@workspace/db";
import { eq, desc, or } from "drizzle-orm";
import { insertSellerNotification } from "../lib/sellerNotifications";
import { emitVendorEvent, emitFinancialsEvent, emitAnalyticsEvent } from "../lib/socket";
import {
  computeAllVendorAggregates, computeResponseScores, computePerformanceScore,
  getItemBasePrice, type VendorAggregate,
} from "../lib/vendorAnalytics";
import { filterRealtimeOrders, buildRealtimeOrderMongoFilter } from "../lib/orderFilter";
import { syncEligibleOrderSettlements } from "../lib/settlementAutomation";

const router = Router();

import { requireAdminKey } from "../middlewares/isAdmin";

function summarize(agg: VendorAggregate, responseScore: number) {
  const perf = computePerformanceScore(agg, responseScore);
  const v = agg.vendor as any;
  const canonicalSellerId = getCanonicalSellerId(v);
  return {
    id: String(v.id || (v as any)._id),
    vendorId: canonicalSellerId || String(v.vendorId || v.sellerId || v.id || (v as any)._id),
    sellerId: canonicalSellerId || String(v.sellerId || v.vendorId || v.id || (v as any)._id),
    name: v.shopName || v.name || v.storeName || v.brandName || "Vendor",
    shopName: v.shopName || v.name || v.storeName || v.brandName || "Vendor",
    ownerId: v.ownerId ?? null,
    location: v.location || v.shopCity || "India",
    contactEmail: v.contactEmail ?? v.email ?? v.ownerEmail ?? null,
    mobile: v.mobile ?? v.phone ?? null,
    category: v.gstin ? "GST Registered" : "Unregistered",
    status: v.status || "approved",
    registeredAt: agg.registeredAt,
    kycVerified: Boolean(v.kycVerified),
    kycResubmissionRequested: Boolean(v.kycResubmissionRequested),
    panVerified: Boolean(v.panVerified),
    gstVerified: Boolean(v.gstVerified),
    bankVerified: Boolean(v.bankVerified),
    totalProducts: agg.totalProducts,
    activeProducts: agg.activeProducts,
    totalOrders: agg.ordersReceived,
    ordersReceived: agg.ordersReceived,
    ordersDelivered: agg.ordersDelivered,
    ordersDispatched: agg.ordersDispatched,
    ordersCancelled: agg.ordersCancelled,
    ordersReturned: agg.ordersReturned,
    grossRevenue: agg.grossRevenue,
    netRevenue: agg.netRevenue,
    sellerEarnings: agg.netRevenue,
    commissionEarned: agg.commissionEarned,
    refundedAmount: agg.refundedAmount,
    rating: agg.avgRating,
    reviewCount: agg.reviewCount,
    performanceScore: perf.score,
    performanceBadge: perf.badge,
  };
}

router.get("/admin/vendor-analytics", requireAdminKey, async (req: any, res: any) => {
  try {
    const {
      search, status, verification, category, orderStatus,
      dateFrom, dateTo, revenueMin, revenueMax,
      sortBy = "grossRevenue", sortDir = "desc",
      page = "1", pageSize = "15",
    } = req.query as Record<string, string>;

    let aggMap = new Map<string, VendorAggregate>();
    let responseScores = new Map<string, number>();
    try {
      await syncEligibleOrderSettlements().catch(() => {});
      aggMap = await computeAllVendorAggregates();
      responseScores = await computeResponseScores();
    } catch (e) {
      req.log?.error?.({ err: e }, "Failed to compute vendor aggregates");
    }

    const allAggs = [...aggMap.values()];
    const globalCustomers = new Set<string>();
    allAggs.forEach((a) => {
      if (a.customerIds) {
        a.customerIds.forEach((cId) => globalCustomers.add(cId));
      }
    });

    const totalGrossRevenue = Math.round(allAggs.reduce((sum, a) => sum + (a.grossRevenue || 0), 0) * 100) / 100;
    const totalPlatformCommission = Math.round(allAggs.reduce((sum, a) => sum + (a.commissionEarned || 0), 0) * 100) / 100;
    const totalSellerEarnings = Math.round(allAggs.reduce((sum, a) => sum + (a.netRevenue || 0), 0) * 100) / 100;
    const totalSellers = allAggs.length;
    const activeSellers = allAggs.filter(a => {
      const s = String(a.vendor.status || "").toLowerCase();
      return s === "approved" || s === "active";
    }).length;
    const inactiveSellers = totalSellers - activeSellers;
    const totalOrders = allAggs.reduce((sum, a) => sum + (a.ordersReceived || 0), 0);

    const summary = {
      totalGrossRevenue,
      totalPlatformCommission,
      totalSellerEarnings,
      sellerEarnings: totalSellerEarnings,
      totalSellers,
      activeSellers,
      inactiveSellers,
      totalOrders,
      // Backward-compatible keys:
      grossRevenue: totalGrossRevenue,
      platformCommission: totalPlatformCommission,
      totalVendors: totalSellers,
      activeVendors: activeSellers,
      inactiveVendors: inactiveSellers,
      totalProducts: allAggs.reduce((sum, a) => sum + (a.totalProducts || 0), 0),
      totalCustomers: globalCustomers.size > 0 
        ? globalCustomers.size 
        : allAggs.reduce((sum, a) => sum + (a.totalCustomers || 0), 0),
      orderStatusBreakdown: {
        received: totalOrders,
        confirmed: allAggs.reduce((sum, a) => sum + (a.ordersConfirmed || 0), 0),
        dispatched: allAggs.reduce((sum, a) => sum + (a.ordersDispatched || 0), 0),
        delivered: allAggs.reduce((sum, a) => sum + (a.ordersDelivered || 0), 0),
        cancelled: allAggs.reduce((sum, a) => sum + (a.ordersCancelled || 0), 0),
        returned: allAggs.reduce((sum, a) => sum + (a.ordersReturned || 0), 0),
      },
      settlements: {
        pending: Math.round(allAggs.reduce((sum, a) => sum + (a.pendingSettlement || 0), 0) * 100) / 100,
        completed: Math.round(allAggs.reduce((sum, a) => sum + (a.completedSettlement || 0), 0) * 100) / 100,
      },
    };

    let rows = allAggs.map(agg => summarize(agg, responseScores.get(String(agg.vendor.id || (agg.vendor as any)._id)) ?? 100));

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.contactEmail ?? "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.vendorId.toLowerCase().includes(q)
      );
    }
    if (status && status !== "all") rows = rows.filter(r => r.status === status);
    if (verification === "verified") rows = rows.filter(r => r.kycVerified);
    if (verification === "pending") rows = rows.filter(r => !r.kycVerified && !r.kycResubmissionRequested);
    if (verification === "resubmission") rows = rows.filter(r => r.kycResubmissionRequested);
    if (category && category !== "all") rows = rows.filter(r => r.category === category);
    if (orderStatus === "hasCancelled") rows = rows.filter(r => r.ordersCancelled > 0);
    if (orderStatus === "hasReturned") rows = rows.filter(r => r.ordersReturned > 0);
    if (dateFrom) rows = rows.filter(r => r.registeredAt && new Date(r.registeredAt) >= new Date(dateFrom));
    if (dateTo) rows = rows.filter(r => r.registeredAt && new Date(r.registeredAt) <= new Date(dateTo));
    if (revenueMin) rows = rows.filter(r => r.grossRevenue >= Number(revenueMin));
    if (revenueMax) rows = rows.filter(r => r.grossRevenue <= Number(revenueMax));

    rows.sort((a: any, b: any) => {
      let av = a[sortBy] ?? 0;
      let bv = b[sortBy] ?? 0;
      if (sortBy === "performance" || sortBy === "performanceScore") {
        av = a.performanceScore ?? 0;
        bv = b.performanceScore ?? 0;
      } else if (sortBy === "orders" || sortBy === "totalOrders") {
        av = a.totalOrders ?? a.ordersReceived ?? 0;
        bv = b.totalOrders ?? b.ordersReceived ?? 0;
      } else if (sortBy === "revenue" || sortBy === "grossRevenue") {
        av = a.grossRevenue ?? 0;
        bv = b.grossRevenue ?? 0;
      } else if (sortBy === "commission" || sortBy === "commissionEarned") {
        av = a.commissionEarned ?? 0;
        bv = b.commissionEarned ?? 0;
      } else if (sortBy === "netRevenue" || sortBy === "sellerEarnings") {
        av = a.sellerEarnings ?? a.netRevenue ?? 0;
        bv = b.sellerEarnings ?? b.netRevenue ?? 0;
      } else if (sortBy === "rating") {
        av = a.rating ?? 0;
        bv = b.rating ?? 0;
      } else if (sortBy === "name" || sortBy === "shopName") {
        av = a.name || a.shopName || "";
        bv = b.name || b.shopName || "";
      }
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 15));
    const total = rows.length;
    const paged = rows.slice((pageNum - 1) * size, pageNum * size);

    res.json({
      summary,
      vendors: paged,
      pagination: { page: pageNum, pageSize: size, total, totalPages: Math.ceil(total / size) },
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to fetch vendor analytics list");
    res.json({
      summary: {
        totalGrossRevenue: 0, grossRevenue: 0,
        totalPlatformCommission: 0, platformCommission: 0,
        totalSellerEarnings: 0, sellerEarnings: 0,
        totalSellers: 0, totalVendors: 0, activeSellers: 0, inactiveSellers: 0,
        totalOrders: 0,
        totalProducts: 0, totalCustomers: 0,
        orderStatusBreakdown: { received: 0, confirmed: 0, dispatched: 0, delivered: 0, cancelled: 0, returned: 0 },
        settlements: { pending: 0, completed: 0 }
      },
      vendors: [],
      pagination: { page: 1, pageSize: 15, total: 0, totalPages: 0 },
    });
  }
});

function bucketKey(date: Date, granularity: string): string {
  if (granularity === "yearly") return String(date.getFullYear());
  if (granularity === "monthly") return date.toISOString().slice(0, 7);
  if (granularity === "weekly") {
    const onejan = new Date(date.getFullYear(), 0, 1);
    const week = Math.ceil((((date.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

router.get("/admin/vendor-analytics/:id", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const granularity = (req.query.granularity as string) || "monthly";

  try {
    let vendor: any = null;
    try {
      vendor = (await mongoSellers.findById(id)) ||
               (await mongoSellers.findByVendorId(id)) ||
               (await mongoSellers.findBySellerId(id)) ||
               (await mongoSellers.findByOwnerId(id));
    } catch {}
    if (!vendor) {
      try {
        const rows = await db.select().from(vendorsTable).where(or(eq(vendorsTable.id, id), eq(vendorsTable.vendorId, id), eq(vendorsTable.ownerId, id))).limit(1);
        if (rows.length > 0) vendor = rows[0];
      } catch {}
    }
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const canonicalSellerId = getCanonicalSellerId(vendor);
    const aggMap = await computeAllVendorAggregates();
    const agg = aggMap.get(id) || (canonicalSellerId && aggMap.get(canonicalSellerId)) || aggMap.get(vendor.vendorId) || aggMap.get(vendor.sellerId) || aggMap.get(vendor.id);
    if (!agg) return res.status(404).json({ error: "Vendor analytics not found" });

    const responseScores = await computeResponseScores();
    const perf = computePerformanceScore(agg, responseScores.get(id) ?? 100);

    let vendorProducts: any[] = [];
    let allOrders: any[] = [];
    try {
      const prods = await mongoProducts.findMany({});
      vendorProducts = prods.filter((p: any) => p.vendorId === id || p.vendorId === vendor.vendorId || p.sellerId === id);
      allOrders = filterRealtimeOrders(await mongoOrders.findMany(buildRealtimeOrderMongoFilter()));
    } catch {}

    if (vendorProducts.length === 0) {
      try {
        vendorProducts = await db
          .select({ id: productsTable.id, active: productsTable.active, stock: productsTable.stock, lowStockThreshold: productsTable.lowStockThreshold, isFeatured: productsTable.isFeatured })
          .from(productsTable)
          .where(eq(productsTable.vendorId, id));
        allOrders = filterRealtimeOrders(await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)));
      } catch {}
    }
    const productIdSet = new Set(vendorProducts.map(p => String(p.id)));
    const revenueBuckets = new Map<string, { revenue: number; orders: number }>();
    const statusFunnel: Record<string, number> = {};
    const seenDetailOrderIds = new Set<string>();

    for (const order of allOrders) {
      const orderKeys = [order.id, order._id, order.orderId, order.displayId]
        .filter(Boolean)
        .map(k => String(k).trim())
        .filter(k => k.length > 0);

      if (orderKeys.length > 0 && orderKeys.some(k => seenDetailOrderIds.has(k))) {
        continue;
      }
      orderKeys.forEach(k => seenDetailOrderIds.add(k));

      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter(i => 
        productIdSet.has(String(i.productId)) ||
        (i as any).vendorId === id ||
        (i as any).vendorId === vendor.vendorId ||
        (i as any).sellerId === id
      );
      if (vendorItems.length === 0) continue;

      statusFunnel[order.status] = (statusFunnel[order.status] ?? 0) + 1;

      const status = String(order.status || "").toLowerCase();
      const paymentStatus = String(order.paymentStatus || order.payment?.status || "").toLowerCase();
      const refundStatus = String(order.refundStatus || "").toLowerCase();
      const isCancelledOrReturned = ["cancelled", "returned", "failed"].includes(status);
      const isPaymentFailed = paymentStatus === "failed" || status === "payment_failed";
      const isPartialRefund = refundStatus === "partial" || refundStatus === "partially_refunded" ||
        (order.refundAmount != null && Number(order.refundAmount) > 0 && Number(order.refundAmount) < (Number(order.totalAmount || order.total) || Infinity));
      const isFullRefund = ["processed", "approved", "completed"].includes(refundStatus) && !isPartialRefund;

      if (!isCancelledOrReturned && !isPaymentFailed && !isFullRefund) {
        let vendorTotal = vendorItems.reduce((s: number, i: any) => {
          const itemStatus = String(i.status || "").toLowerCase();
          if (itemStatus === "cancelled" || itemStatus === "returned" || itemStatus === "refunded") return s;
          const returnedQty = Math.max(0, Number(i.returnedQuantity || i.refundedQuantity) || 0);
          const fullQty = Math.max(1, Number(i.quantity) || 1);
          const eligibleQty = Math.max(0, fullQty - returnedQty);
          if (eligibleQty <= 0) return s;
          const bp = getItemBasePrice(i);
          return Math.round((s + bp * eligibleQty) * 100) / 100;
        }, 0);
        if (isPartialRefund) {
          const partialShare = order.refundAmount != null && Number(order.refundAmount) > 0
            ? Math.min(vendorTotal, Number(order.refundAmount))
            : vendorTotal * 0.5;
          vendorTotal = Math.max(0, Math.round((vendorTotal - partialShare) * 100) / 100);
        }
        const key = bucketKey(new Date(order.createdAt), granularity);
        const prev = revenueBuckets.get(key) ?? { revenue: 0, orders: 0 };
        revenueBuckets.set(key, { revenue: Math.round((prev.revenue + vendorTotal) * 100) / 100, orders: prev.orders + 1 });
      }
    }

    const trend = [...revenueBuckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-24)
      .map(([period, d]) => ({ period, revenue: d.revenue, orders: d.orders }));

    let settlements: any[] = [];
    try {
      settlements = await db
        .select()
        .from(vendorSettlementsTable)
        .where(eq(vendorSettlementsTable.vendorId, id))
        .orderBy(desc(vendorSettlementsTable.createdAt))
        .limit(20);
    } catch {}

    res.json({
      shop: {
        id: vendor.id,
        vendorId: canonicalSellerId || vendor.vendorId || vendor.sellerId || vendor.id,
        sellerId: canonicalSellerId || vendor.sellerId || vendor.vendorId || vendor.id,
        name: vendor.shopName || vendor.name || "Vendor",
        location: vendor.location || vendor.shopCity || "India",
        bio: vendor.bio ?? null,
        tagline: vendor.tagline ?? null,
        avatar: vendor.avatar,
        contactEmail: vendor.contactEmail ?? vendor.email ?? null,
        mobile: vendor.mobile ?? vendor.phone ?? null,
        gstin: vendor.gstin ?? null,
        status: vendor.status || "approved",
        registeredAt: vendor.termsAcceptedAt ?? vendor.createdAt ?? null,
        shopStreet: vendor.shopStreet ?? null,
        shopCity: vendor.shopCity ?? null,
        shopState: vendor.shopState ?? null,
        shopPincode: vendor.shopPincode ?? null,
      },
      verification: {
        kycVerified: Boolean(vendor.kycVerified),
        kycResubmissionRequested: Boolean(vendor.kycResubmissionRequested),
        panVerified: Boolean(vendor.panVerified),
        panNumber: vendor.panNumber ?? null,
        panCardUrl: vendor.panCardUrl ?? null,
        gstVerified: Boolean(vendor.gstVerified),
        gstCertUrl: vendor.gstCertUrl ?? null,
        bankVerified: Boolean(vendor.bankVerified),
        bankHolder: vendor.bankHolder ?? null,
        bankName: vendor.bankName ?? null,
        bankAccount: vendor.bankAccount ?? null,
        bankIfsc: vendor.bankIfsc ?? null,
      },
      products: {
        total: agg.totalProducts,
        active: agg.activeProducts,
        inactive: agg.inactiveProducts,
        featured: agg.featuredProducts,
        outOfStock: agg.outOfStockProducts,
        lowStock: agg.lowStockProducts,
      },
      orders: {
        received: agg.ordersReceived,
        confirmed: agg.ordersConfirmed,
        dispatched: agg.ordersDispatched,
        delivered: agg.ordersDelivered,
        cancelled: agg.ordersCancelled,
        returned: agg.ordersReturned,
        statusFunnel,
      },
      revenue: {
        gross: agg.grossRevenue,
        net: agg.netRevenue,
        sellerEarnings: agg.netRevenue,
        commission: agg.commissionEarned,
        refunded: agg.refundedAmount,
        pendingSettlement: agg.pendingSettlement,
        completedSettlement: agg.completedSettlement,
        granularity,
        trend,
      },
      customers: {
        total: agg.totalCustomers,
        new30d: agg.newCustomers30d,
        repeat: agg.repeatCustomers,
        avgRating: agg.avgRating,
        reviewCount: agg.reviewCount,
        ratingDistribution: agg.ratingDistribution,
      },
      performanceScore: perf,
      settlements,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch vendor analytics detail");
    res.status(500).json({ error: "Failed to fetch vendor analytics detail" });
  }
});

const VERIFICATION_FIELDS = ["kyc", "pan", "gst", "bank"] as const;

router.post("/admin/vendor-analytics/:id/verification", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { field, action, reason } = req.body ?? {};

  if (!VERIFICATION_FIELDS.includes(field)) {
    return res.status(400).json({ error: `Invalid field. Must be one of: ${VERIFICATION_FIELDS.join(", ")}` });
  }
  if (!["verify", "reject", "request_documents"].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be 'verify', 'reject', or 'request_documents'." });
  }

  try {
    const [vendor] = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const updates: Record<string, any> = {};
    if (field === "kyc") {
      updates.kycVerified = action === "verify";
      updates.kycResubmissionRequested = action !== "verify";
    } else if (field === "pan") {
      updates.panVerified = action === "verify";
    } else if (field === "gst") {
      updates.gstVerified = action === "verify";
    } else if (field === "bank") {
      updates.bankVerified = action === "verify";
    }

    const [updated] = await db.update(vendorsTable).set(updates).where(eq(vendorsTable.id, id)).returning();

    const fieldLabel = field.toUpperCase();
    if (action === "verify") {
      await insertSellerNotification({
        vendorId: id,
        type: "kyc_verified",
        title: `${fieldLabel} verified`,
        body: `Your ${fieldLabel} details have been verified by our admin team.`,
        metadata: { vendorId: id, field },
      });
    } else {
      await insertSellerNotification({
        vendorId: id,
        type: "kyc_resubmission_requested",
        title: action === "reject" ? `${fieldLabel} verification rejected` : `${fieldLabel} documents requested`,
        body: reason
          ? `Please resubmit your ${fieldLabel} details. Reason: ${reason}`
          : `Please resubmit your ${fieldLabel} details for verification.`,
        metadata: { vendorId: id, field, reason: reason ?? null },
      });
    }

    emitVendorEvent("vendor:updated", { id, field, action, vendor: updated });
    emitAnalyticsEvent({ vendorId: id, reason: `verification_${field}_${action}` });
    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update verification status");
    res.status(500).json({ error: "Failed to update verification status" });
  }
});

router.post("/admin/vendor-analytics/:id/settlements", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { amount, type = "release", note } = req.body ?? {};

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  if (!["release", "payout"].includes(type)) {
    return res.status(400).json({ error: "type must be 'release' or 'payout'" });
  }

  try {
    const [vendor] = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const [settlement] = await db.insert(vendorSettlementsTable).values({
      vendorId: id,
      amount: Math.round(amt),
      type,
      status: "completed",
      note: note ? String(note) : null,
    }).returning();

    await insertSellerNotification({
      vendorId: id,
      type: type === "payout" ? "payout_successful" : "settlement_released",
      title: type === "payout" ? "Payout successful" : "Settlement released",
      body: `₹${amt.toLocaleString("en-IN")} has been ${type === "payout" ? "paid out to your linked bank account" : "released to your settlement balance"}.`,
      metadata: { vendorId: id, amount: amt, settlementId: settlement.id },
    });

    emitFinancialsEvent("settlement:processed", { id: settlement.id, vendorId: id, amount: amt, type, settlement });
    emitFinancialsEvent("financials:updated", { vendorId: id, amount: amt });
    emitAnalyticsEvent({ vendorId: id, reason: "settlement_processed" });

    res.json({ settlement });
  } catch (err) {
    req.log.error({ err }, "Failed to record settlement");
    res.status(500).json({ error: "Failed to record settlement" });
  }
});

export default router;
