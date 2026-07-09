import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable, productsTable, ordersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";

const router = Router();

const requireAdminKey = (req: any, res: any, next: any) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};

router.get("/vendors", async (req, res) => {
  try {
    const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.name);
    res.json(vendors.map((v) => ({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: v.sareesCount,
      avatar: v.avatar,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.get("/vendors/me", requireAuth, async (req: any, res: any) => {
  try {
    const rows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, req.userId))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "No vendor account found" });
    }

    const v = rows[0];
    res.json({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: v.sareesCount,
      avatar: v.avatar,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
      contactEmail: v.contactEmail ?? null,
      gstin: v.gstin ?? null,
      status: v.status,
      ownerId: v.ownerId,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch vendor profile");
    res.status(500).json({ error: "Failed to fetch vendor profile" });
  }
});

router.get("/vendors/:id", async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const rows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const v = rows[0];
    res.json({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: v.sareesCount,
      avatar: v.avatar,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
      contactEmail: v.contactEmail ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch vendor");
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
});

router.post("/vendors", requireAuth, async (req: any, res: any) => {
  const {
    name, location, bio, gstin, contactEmail, tagline,
    mobile, panNumber, panCardUrl,
    bankHolder, bankName, bankAccount, bankIfsc,
    shopStreet, shopCity, shopState, shopPincode,
    termsAccepted,
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Shop name is required" });
  }
  if (!location || !String(location).trim()) {
    return res.status(400).json({ error: "Location is required" });
  }
  if (!termsAccepted) {
    return res.status(400).json({ error: "You must accept the terms and conditions" });
  }

  try {
    const existing = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, req.userId))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: "You already have a vendor account" });
    }

    const [vendor] = await db
      .insert(vendorsTable)
      .values({
        name: String(name).trim(),
        location: String(location).trim(),
        bio: bio ? String(bio).trim() : null,
        gstin: gstin ? String(gstin).trim().toUpperCase() : null,
        contactEmail: contactEmail ? String(contactEmail).trim() : null,
        tagline: tagline ? String(tagline).trim() : null,
        ownerId: req.userId,
        status: "pending",
        mobile: mobile ? String(mobile).trim() : null,
        panNumber: panNumber ? String(panNumber).trim().toUpperCase() : null,
        panCardUrl: panCardUrl ? String(panCardUrl).trim() : null,
        bankHolder: bankHolder ? String(bankHolder).trim() : null,
        bankName: bankName ? String(bankName).trim() : null,
        bankAccount: bankAccount ? String(bankAccount).trim() : null,
        bankIfsc: bankIfsc ? String(bankIfsc).trim().toUpperCase() : null,
        shopStreet: shopStreet ? String(shopStreet).trim() : null,
        shopCity: shopCity ? String(shopCity).trim() : null,
        shopState: shopState ? String(shopState).trim() : null,
        shopPincode: shopPincode ? String(shopPincode).trim() : null,
        termsAcceptedAt: termsAccepted ? new Date() : null,
      })
      .returning();

    res.status(201).json({
      id: vendor.id,
      name: vendor.name,
      status: vendor.status,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create vendor");
    res.status(500).json({ error: "Failed to create vendor account" });
  }
});

router.patch("/vendors/:id", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  const { name, location, bio, gstin, contactEmail, tagline, avatar } = req.body;

  try {
    const rows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    if (rows[0].ownerId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (location !== undefined) updates.location = String(location).trim();
    if (bio !== undefined) updates.bio = String(bio).trim() || null;
    if (gstin !== undefined) updates.gstin = String(gstin).trim().toUpperCase() || null;
    if (contactEmail !== undefined) updates.contactEmail = String(contactEmail).trim() || null;
    if (tagline !== undefined) updates.tagline = String(tagline).trim() || null;
    if (avatar !== undefined) updates.avatar = String(avatar).trim() || null;

    const [updated] = await db
      .update(vendorsTable)
      .set(updates)
      .where(eq(vendorsTable.id, id))
      .returning();

    res.json({
      id: updated.id,
      name: updated.name,
      location: updated.location,
      bio: updated.bio,
      tagline: updated.tagline,
      contactEmail: updated.contactEmail,
      gstin: updated.gstin,
      avatar: updated.avatar,
      status: updated.status,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update vendor");
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

router.get("/admin/vendors", requireAdminKey, async (req: any, res: any) => {
  try {
    const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.name);

    const allProducts = await db.select({ id: productsTable.id, vendorId: productsTable.vendorId }).from(productsTable);
    const productToVendor = new Map(allProducts.filter(p => p.vendorId).map(p => [p.id, p.vendorId as string]));
    const allOrders = await db.select({ items: ordersTable.items, status: ordersTable.status }).from(ordersTable);

    const vendorRevenue: Record<string, number> = {};
    const vendorOrders: Record<string, number> = {};
    for (const order of allOrders) {
      const items = order.items as Array<{ productId: string; price: number; quantity: number }>;
      if (!Array.isArray(items)) continue;
      const touched = new Set<string>();
      for (const item of items) {
        const vendorId = productToVendor.get(item.productId);
        if (!vendorId) continue;
        touched.add(vendorId);
        if (!["cancelled", "returned"].includes(order.status)) {
          vendorRevenue[vendorId] = (vendorRevenue[vendorId] ?? 0) + item.price * (item.quantity ?? 1);
        }
      }
      for (const vendorId of touched) {
        vendorOrders[vendorId] = (vendorOrders[vendorId] ?? 0) + 1;
      }
    }

    res.json({
      vendors: vendors.map((v) => ({
        id: v.id,
        name: v.name,
        location: v.location,
        rating: v.rating,
        sareesCount: v.sareesCount,
        avatar: v.avatar,
        bio: v.bio ?? null,
        ownerId: v.ownerId ?? null,
        status: v.status,
        gstin: v.gstin ?? null,
        contactEmail: v.contactEmail ?? null,
        kycVerified: v.kycVerified,
        revenue: vendorRevenue[v.id] ?? 0,
        totalOrders: vendorOrders[v.id] ?? 0,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list admin vendors");
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.post("/admin/vendors/:id/approve", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "approved" })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });

    if (!updated) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to approve vendor");
    res.status(500).json({ error: "Failed to approve vendor" });
  }
});

router.post("/admin/vendors/:id/suspend", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "suspended" })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });

    if (!updated) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to suspend vendor");
    res.status(500).json({ error: "Failed to suspend vendor" });
  }
});

router.post("/admin/vendors/:id/reject", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "suspended" as any })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to reject vendor");
    res.status(500).json({ error: "Failed to reject vendor" });
  }
});

router.post("/admin/vendors/:id/activate", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "approved" })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to activate vendor");
    res.status(500).json({ error: "Failed to activate vendor" });
  }
});

router.post("/admin/vendors/:id/deactivate", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "suspended" })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate vendor");
    res.status(500).json({ error: "Failed to deactivate vendor" });
  }
});

router.post("/admin/vendors/:id/verify-kyc", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ kycVerified: true })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status, kycVerified: vendorsTable.kycVerified });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated, kycVerified: true });
  } catch (err) {
    req.log.error({ err }, "Failed to verify KYC");
    res.status(500).json({ error: "Failed to verify KYC" });
  }
});

async function computeVendorRevenue(): Promise<Record<string, number>> {
  const allProducts = await db
    .select({ id: productsTable.id, vendorId: productsTable.vendorId })
    .from(productsTable);
  const productToVendor = new Map(
    allProducts.filter(p => p.vendorId).map(p => [p.id, p.vendorId as string])
  );
  const allOrders = await db
    .select({ items: ordersTable.items, status: ordersTable.status })
    .from(ordersTable);

  const vendorRevenue: Record<string, number> = {};
  for (const order of allOrders) {
    if (["cancelled", "returned"].includes(order.status)) continue;
    const items = order.items as Array<{ productId: string; price: number; quantity: number }>;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const vendorId = productToVendor.get(item.productId);
      if (vendorId) {
        vendorRevenue[vendorId] = (vendorRevenue[vendorId] ?? 0) + item.price * (item.quantity ?? 1);
      }
    }
  }
  return vendorRevenue;
}

router.get("/admin/vendors/:id", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const rows = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Vendor not found" });
    const vendor = rows[0];

    const vendorProducts = await db
      .select({ id: productsTable.id, active: productsTable.active })
      .from(productsTable)
      .where(eq(productsTable.vendorId as any, id));

    const productIds = new Set(vendorProducts.map(p => p.id));
    const allOrders = await db.select().from(ordersTable);

    const statusBreakdown: Record<string, number> = {};
    let totalRevenue = 0;
    const monthlyRevenue: Record<string, number> = {};

    for (const order of allOrders) {
      const items = order.items as Array<{ productId: string; price: number; quantity: number }>;
      if (!Array.isArray(items)) continue;
      const vendorItems = items.filter(i => productIds.has(i.productId));
      if (vendorItems.length === 0) continue;

      statusBreakdown[order.status] = (statusBreakdown[order.status] ?? 0) + 1;
      if (!["cancelled", "returned"].includes(order.status)) {
        const itemRevenue = vendorItems.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0);
        totalRevenue += itemRevenue;
        const monthKey = new Date(order.createdAt).toISOString().slice(0, 7);
        monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] ?? 0) + itemRevenue;
      }
    }

    const COMMISSION_RATE = 0.10;
    const sortedMonths = Object.keys(monthlyRevenue).sort().slice(-6);

    res.json({
      id: vendor.id,
      name: vendor.name,
      location: vendor.location,
      rating: vendor.rating,
      sareesCount: vendor.sareesCount,
      avatar: vendor.avatar,
      bio: vendor.bio ?? null,
      tagline: vendor.tagline ?? null,
      contactEmail: vendor.contactEmail ?? null,
      gstin: vendor.gstin ?? null,
      status: vendor.status,
      ownerId: vendor.ownerId ?? null,
      kycVerified: vendor.kycVerified,
      mobile: vendor.mobile ?? null,
      panNumber: vendor.panNumber ?? null,
      panCardUrl: vendor.panCardUrl ?? null,
      bankHolder: vendor.bankHolder ?? null,
      bankName: vendor.bankName ?? null,
      bankAccount: vendor.bankAccount ?? null,
      bankIfsc: vendor.bankIfsc ?? null,
      shopStreet: vendor.shopStreet ?? null,
      shopCity: vendor.shopCity ?? null,
      shopState: vendor.shopState ?? null,
      shopPincode: vendor.shopPincode ?? null,
      termsAcceptedAt: vendor.termsAcceptedAt ?? null,
      totalProducts: vendorProducts.length,
      activeProducts: vendorProducts.filter(p => p.active).length,
      totalRevenue,
      commissionEarned: Math.round(totalRevenue * COMMISSION_RATE),
      statusBreakdown,
      monthlyRevenue: sortedMonths.map(m => ({ month: m, revenue: monthlyRevenue[m] })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin vendor detail");
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
});

router.get("/admin/stats", requireAdminKey, async (req: any, res: any) => {
  try {
    const [orderStats] = await db.select({
      totalOrders: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::bigint`,
      totalCustomers: sql<number>`count(distinct ${ordersTable.userId})::int`,
      deliveredOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'delivered')::int`,
      cancelledOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'cancelled')::int`,
      returnedOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'returned')::int`,
      confirmedOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'confirmed')::int`,
      dispatchedOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'dispatched')::int`,
      refundedRevenue: sql<number>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.refundStatus} = 'processed'), 0)::bigint`,
    }).from(ordersTable);

    const [productStats] = await db.select({
      totalProducts: sql<number>`count(*)::int`,
    }).from(productsTable);

    const [vendorStats] = await db.select({
      totalVendors: sql<number>`count(*)::int`,
      approvedVendors: sql<number>`count(*) filter (where ${vendorsTable.status} = 'approved')::int`,
      pendingVendors: sql<number>`count(*) filter (where ${vendorsTable.status} = 'pending')::int`,
    }).from(vendorsTable);

    const dailyRevenue = await db.select({
      date: sql<string>`date(${ordersTable.createdAt})::text`,
      revenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::bigint`,
      orderCount: sql<number>`count(*)::int`,
    }).from(ordersTable)
      .where(sql`${ordersTable.createdAt} >= now() - interval '30 days'`)
      .groupBy(sql`date(${ordersTable.createdAt})`)
      .orderBy(sql`date(${ordersTable.createdAt})`);

    const totalRevNum = Number(orderStats.totalRevenue);
    const approvedVendors = Number(vendorStats.approvedVendors);

    const [prevPeriodStats] = await db.select({
      prevRevenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::bigint`,
    }).from(ordersTable)
      .where(sql`${ordersTable.createdAt} >= now() - interval '60 days' AND ${ordersTable.createdAt} < now() - interval '30 days'`);

    const prevRevNum = Number(prevPeriodStats.prevRevenue);
    const growthPct = prevRevNum > 0
      ? Math.round(((totalRevNum - prevRevNum) / prevRevNum) * 100)
      : totalRevNum > 0 ? 100 : 0;

    res.json({
      totalOrders: Number(orderStats.totalOrders),
      totalRevenue: totalRevNum,
      totalCustomers: Number(orderStats.totalCustomers),
      deliveredOrders: Number(orderStats.deliveredOrders),
      cancelledOrders: Number(orderStats.cancelledOrders),
      returnedOrders: Number(orderStats.returnedOrders),
      confirmedOrders: Number(orderStats.confirmedOrders),
      dispatchedOrders: Number(orderStats.dispatchedOrders),
      refundedRevenue: Number(orderStats.refundedRevenue),
      totalProducts: Number(productStats.totalProducts),
      totalVendors: Number(vendorStats.totalVendors),
      approvedVendors,
      activeVendors: approvedVendors,
      pendingVendors: Number(vendorStats.pendingVendors),
      growthPct,
      dailyRevenue: dailyRevenue.map(r => ({
        date: r.date,
        revenue: Number(r.revenue),
        orders: Number(r.orderCount),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
