import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable, ordersTable, vendorSettlementsTable, productsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { insertSellerNotification } from "../lib/sellerNotifications";
import {
  computeAllVendorAggregates, computeResponseScores, computePerformanceScore,
  type VendorAggregate,
} from "../lib/vendorAnalytics";

const router = Router();

const requireAdminKey = (req: any, res: any, next: any) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

function summarize(agg: VendorAggregate, responseScore: number) {
  const perf = computePerformanceScore(agg, responseScore);
  return {
    id: agg.vendor.id,
    name: agg.vendor.name,
    ownerId: agg.vendor.ownerId ?? null,
    location: agg.vendor.location,
    contactEmail: agg.vendor.contactEmail ?? null,
    mobile: agg.vendor.mobile ?? null,
    category: agg.vendor.gstin ? "GST Registered" : "Unregistered",
    status: agg.vendor.status,
    registeredAt: agg.registeredAt,
    kycVerified: agg.vendor.kycVerified,
    kycResubmissionRequested: agg.vendor.kycResubmissionRequested,
    panVerified: agg.vendor.panVerified,
    gstVerified: agg.vendor.gstVerified,
    bankVerified: agg.vendor.bankVerified,
    totalProducts: agg.totalProducts,
    activeProducts: agg.activeProducts,
    ordersReceived: agg.ordersReceived,
    ordersDelivered: agg.ordersDelivered,
    ordersDispatched: agg.ordersDispatched,
    ordersCancelled: agg.ordersCancelled,
    ordersReturned: agg.ordersReturned,
    grossRevenue: agg.grossRevenue,
    netRevenue: agg.netRevenue,
    commissionEarned: agg.commissionEarned,
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
      page = "1", pageSize = "20",
    } = req.query as Record<string, string>;

    const aggMap = await computeAllVendorAggregates();
    const responseScores = await computeResponseScores();

    let rows = [...aggMap.values()].map(agg => summarize(agg, responseScores.get(agg.vendor.id) ?? 100));

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.contactEmail ?? "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
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
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const total = rows.length;
    const paged = rows.slice((pageNum - 1) * size, pageNum * size);

    res.json({
      vendors: paged,
      pagination: { page: pageNum, pageSize: size, total, totalPages: Math.ceil(total / size) },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch vendor analytics list");
    res.status(500).json({ error: "Failed to fetch vendor analytics" });
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
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const aggMap = await computeAllVendorAggregates();
    const agg = aggMap.get(id);
    if (!agg) return res.status(404).json({ error: "Vendor analytics not found" });

    const responseScores = await computeResponseScores();
    const perf = computePerformanceScore(agg, responseScores.get(id) ?? 100);

    const vendorProducts = await db
      .select({ id: productsTable.id, active: productsTable.active, stock: productsTable.stock, lowStockThreshold: productsTable.lowStockThreshold, isFeatured: productsTable.isFeatured })
      .from(productsTable)
      .where(eq(productsTable.vendorId, id));
    const productIdSet = new Set(vendorProducts.map(p => p.id));

    const allOrders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
    const revenueBuckets = new Map<string, { revenue: number; orders: number }>();
    const statusFunnel: Record<string, number> = {};
    const dailyProductTrend = new Map<string, { active: number; outOfStock: number }>();

    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter(i => productIdSet.has(i.productId));
      if (vendorItems.length === 0) continue;

      statusFunnel[order.status] = (statusFunnel[order.status] ?? 0) + 1;

      if (!["cancelled", "returned"].includes(order.status)) {
        const vendorTotal = vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);
        const key = bucketKey(new Date(order.createdAt), granularity);
        const prev = revenueBuckets.get(key) ?? { revenue: 0, orders: 0 };
        revenueBuckets.set(key, { revenue: prev.revenue + vendorTotal, orders: prev.orders + 1 });
      }
    }

    const trend = [...revenueBuckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-24)
      .map(([period, d]) => ({ period, revenue: d.revenue, orders: d.orders }));

    const settlements = await db
      .select()
      .from(vendorSettlementsTable)
      .where(eq(vendorSettlementsTable.vendorId, id))
      .orderBy(desc(vendorSettlementsTable.createdAt))
      .limit(20);

    res.json({
      shop: {
        id: vendor.id,
        name: vendor.name,
        location: vendor.location,
        bio: vendor.bio ?? null,
        tagline: vendor.tagline ?? null,
        avatar: vendor.avatar,
        contactEmail: vendor.contactEmail ?? null,
        mobile: vendor.mobile ?? null,
        gstin: vendor.gstin ?? null,
        status: vendor.status,
        registeredAt: vendor.termsAcceptedAt ?? null,
        shopStreet: vendor.shopStreet ?? null,
        shopCity: vendor.shopCity ?? null,
        shopState: vendor.shopState ?? null,
        shopPincode: vendor.shopPincode ?? null,
      },
      verification: {
        kycVerified: vendor.kycVerified,
        kycResubmissionRequested: vendor.kycResubmissionRequested,
        panVerified: vendor.panVerified,
        panNumber: vendor.panNumber ?? null,
        panCardUrl: vendor.panCardUrl ?? null,
        gstVerified: vendor.gstVerified,
        gstCertUrl: vendor.gstCertUrl ?? null,
        bankVerified: vendor.bankVerified,
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

    res.json({ settlement });
  } catch (err) {
    req.log.error({ err }, "Failed to record settlement");
    res.status(500).json({ error: "Failed to record settlement" });
  }
});

export default router;
