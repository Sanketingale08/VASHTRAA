import { Router } from "express";
import { db, mongoProducts, resolveCategoryData } from "@workspace/db";
import {
  productsTable, productCategoriesTable, productBrandsTable,
} from "@workspace/db";
import {
  eq, sql, desc, asc, ilike, and, or, inArray,
} from "drizzle-orm";
import { requireAdminKey } from "../middlewares/isAdmin";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { globalCache, safeClearCache, safeInvalidatePattern } from "../lib/cacheEngine";
import { emitProductEvent } from "../lib/socket";
import { insertSellerNotification } from "../lib/sellerNotifications";

const router = Router();

// ── KPI summary ──────────────────────────────────────────────────────────────
router.get("/admin/products/stats", requireAdminKey, async (req: any, res: any) => {
  try {
    let stats: any = null;
    try {
      stats = await mongoProducts.getAdminStats();
    } catch {
      // Fallback below
    }

    if (!stats) {
      const [totals] = await db
        .select({
          total: sql<number>`count(*)::int`,
          pending: sql<number>`count(*) filter (where status = 'pending')::int`,
          approved: sql<number>`count(*) filter (where status = 'approved')::int`,
          rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
          featured: sql<number>`count(*) filter (where is_featured = true and active = true and (status is null or status = 'approved'))::int`,
        })
        .from(productsTable)
        .catch(() => [{ total: 0, pending: 0, approved: 0, rejected: 0, featured: 0 }]);

      const [{ activeCategories }] = await db
        .select({ activeCategories: sql<number>`count(*)::int` })
        .from(productCategoriesTable)
        .where(and(eq(productCategoriesTable.active, true), or(eq(productCategoriesTable.status, "approved"), sql`status IS NULL`, sql`status = ''`)))
        .catch(() => [{ activeCategories: 0 }]);

      const [{ activeBrands }] = await db
        .select({ activeBrands: sql<number>`count(*)::int` })
        .from(productBrandsTable)
        .where(eq(productBrandsTable.active, true))
        .catch(() => [{ activeBrands: 0 }]);

      stats = { ...totals, activeCategories, activeBrands };
    }

    res.json(stats);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to get product stats");
    res.json({ total: 0, pending: 0, approved: 0, rejected: 0, featured: 0, activeCategories: 0, activeBrands: 0 });
  }
});

// ── Bulk actions ──────────────────────────────────────────────────────────────
router.post("/admin/products/bulk", requireAdminKey, async (req: any, res: any) => {
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || !ids.length || !action) {
    return res.status(400).json({ error: "ids and action required" });
  }
  try {
    if (action === "approve") {
      await Promise.all(ids.map(async (id) => {
        const existing = await mongoProducts.findById(id).catch(() => null);
        const resolvedCat = existing ? resolveCategoryData(existing.category, existing.subcategory, existing.subtype) : null;
        const categoryFields = existing && resolvedCat ? {
          category: (existing.category || resolvedCat.category) as any,
          categorySlug: existing.categorySlug || resolvedCat.categorySlug,
          categoryId: existing.categoryId || resolvedCat.categoryId,
          categoryName: existing.categoryName || resolvedCat.categoryName,
          parentCategoryId: existing.parentCategoryId || resolvedCat.parentCategoryId,
          parentCategoryName: existing.parentCategoryName || resolvedCat.parentCategoryName,
          mainCategoryId: existing.mainCategoryId || resolvedCat.categoryId,
          subcategory: existing.subcategory || resolvedCat.subcategory,
          subcategorySlug: existing.subcategorySlug || resolvedCat.subcategorySlug,
          subcategoryId: existing.subcategoryId || resolvedCat.subcategoryId,
          subcategoryName: existing.subcategoryName || resolvedCat.subcategoryName,
          subtype: existing.subtype || resolvedCat.subtype,
          subtypeId: existing.subtypeId || resolvedCat.subtypeId,
        } : {};
        const prod = await mongoProducts.update(id, {
          status: "approved",
          active: true,
          ...categoryFields,
        }).catch(() => null);
        const p = prod || existing;
        const vendorId = p?.vendorId || p?.sellerId;
        if (vendorId && p) {
          insertSellerNotification({
            vendorId,
            type: "product_approved",
            title: "Product approved",
            body: `"${p.name}" has been approved by admin and is now live!`,
            metadata: { productId: p.id },
          }).catch(() => {});
        }
      }));
      await db.update(productsTable).set({ status: "approved", active: true }).where(inArray(productsTable.id, ids)).catch(() => {});
    } else if (action === "reject") {
      await Promise.all(ids.map(async (id) => {
        const prod = await mongoProducts.update(id, { status: "rejected", active: false }).catch(() => null);
        const p = prod || (await mongoProducts.findById(id).catch(() => null));
        const vendorId = p?.vendorId || p?.sellerId;
        if (vendorId && p) {
          insertSellerNotification({
            vendorId,
            type: "product_rejected",
            title: "Product rejected",
            body: `"${p.name}" was rejected by admin.`,
            metadata: { productId: p.id },
          }).catch(() => {});
        }
      }));
      await db.update(productsTable).set({ status: "rejected", active: false }).where(inArray(productsTable.id, ids)).catch(() => {});
    } else if (action === "activate") {
      await Promise.all(ids.map(id => mongoProducts.update(id, { active: true }).catch(() => {})));
      await db.update(productsTable).set({ active: true }).where(inArray(productsTable.id, ids)).catch(() => {});
    } else if (action === "deactivate") {
      await Promise.all(ids.map(id => mongoProducts.update(id, { active: false }).catch(() => {})));
      await db.update(productsTable).set({ active: false }).where(inArray(productsTable.id, ids)).catch(() => {});
    } else if (action === "delete") {
      await Promise.all(ids.map(id => mongoProducts.delete(id).catch(() => {})));
      await db.delete(productsTable).where(inArray(productsTable.id, ids)).catch(() => {});
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }
    globalCache.invalidatePattern(/product/);
    safeClearCache();
    emitProductEvent("catalog:updated", { action, ids });
    res.json({ ok: true, count: ids.length });
  } catch (err) {
    req.log.error({ err }, "Bulk product action failed");
    res.status(500).json({ error: "Bulk action failed" });
  }
});

// ── Featured reorder ──────────────────────────────────────────────────────────
router.patch("/admin/products/featured-order", requireAdminKey, async (req: any, res: any) => {
  const { order } = req.body; // { id: featuredOrder }
  if (!order || typeof order !== "object") {
    return res.status(400).json({ error: "order map required" });
  }
  try {
    await Promise.all(
      Object.entries(order).map(([id, featuredOrder]) => {
        mongoProducts.update(id, { featuredOrder: Number(featuredOrder) }).catch(() => {});
        return db.update(productsTable)
          .set({ featuredOrder: Number(featuredOrder) })
          .where(eq(productsTable.id, id))
          .catch(() => {});
      })
    );
    globalCache.invalidatePattern(/product/);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update featured order");
    res.status(500).json({ error: "Failed to update order" });
  }
});

// ── List products ─────────────────────────────────────────────────────────────
router.get("/admin/products", requireAdminKey, async (req: any, res: any) => {
  try {
    const {
      search, status, category, brand, subcategory,
      sort = "newest", page = "1", limit = "20",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    let products: any[] = [];
    let count = 0;
    try {
      const filter: any = {};
      const andClauses: any[] = [];
      if (search) {
        andClauses.push({
          $or: [
            { name: { $regex: String(search), $options: "i" } },
            { vendorName: { $regex: String(search), $options: "i" } },
          ],
        });
      }
      if (status && status !== "all") filter.status = status;
      if (category && category !== "all") {
        andClauses.push({
          $or: [
            { category },
            { categoryName: category },
            { categoryId: category },
            { category: { $regex: String(category), $options: "i" } },
          ],
        });
      }
      if (subcategory && subcategory !== "all") {
        andClauses.push({
          $or: [
            { subcategory },
            { subcategoryName: subcategory },
            { subcategoryId: subcategory },
            { subcategory: { $regex: String(subcategory), $options: "i" } },
          ],
        });
      }
      if (andClauses.length === 1) {
        Object.assign(filter, andClauses[0]);
      } else if (andClauses.length > 1) {
        filter.$and = andClauses;
      }
      if (brand) filter.brand = { $regex: String(brand), $options: "i" };

      const sortMap: Record<string, any> = {
        price_asc: { price: 1 },
        price_desc: { price: -1 },
        name_asc: { name: 1 },
        name_desc: { name: -1 },
        newest: { createdAt: -1 },
      };

      products = await mongoProducts.findMany(filter, { limit: limitNum, offset, sort: sortMap[String(sort)] || { createdAt: -1 } });
      count = await mongoProducts.count(filter);
    } catch {
      const conditions: any[] = [];
      if (search) {
        const term = `%${search}%`;
        conditions.push(
          or(
            ilike(productsTable.name, term),
            ilike(productsTable.vendorName, term),
          )
        );
      }
      if (status && status !== "all") {
        conditions.push(eq(productsTable.status, status as "pending" | "approved" | "rejected"));
      }
      if (category) {
        conditions.push(eq(productsTable.category, category as any));
      }
      if (brand) {
        conditions.push(ilike(productsTable.brand, `%${brand}%`));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      let orderBy: any;
      switch (sort) {
        case "price_asc":  orderBy = asc(productsTable.price); break;
        case "price_desc": orderBy = desc(productsTable.price); break;
        case "name_asc":   orderBy = asc(productsTable.name);  break;
        case "name_desc":  orderBy = desc(productsTable.name); break;
        default:           orderBy = desc(productsTable.id);   break;
      }

      const [prods, countRes] = await Promise.all([
        db.select().from(productsTable).where(where).orderBy(orderBy).limit(limitNum).offset(offset).catch(() => []),
        db.select({ count: sql<number>`count(*)::int` }).from(productsTable).where(where).catch(() => [{ count: 0 }]),
      ]);
      products = prods;
      count = countRes[0]?.count ?? 0;
    }

    const sanitizedProducts = (products || []).map((p: any) => {
      const priceNum = p.price != null && !isNaN(Number(p.price))
        ? Number(p.price)
        : (p.basePrice != null && !isNaN(Number(p.basePrice)) ? Number(p.basePrice) : 0);
      const canonicalId = p.id || (p._id ? String(p._id) : "") || p.productId;
      return {
        ...p,
        id: canonicalId,
        price: priceNum,
        basePrice: p.basePrice != null && !isNaN(Number(p.basePrice)) ? Number(p.basePrice) : priceNum,
        stock: p.stock != null && !isNaN(Number(p.stock)) ? Number(p.stock) : 0,
        rating: p.rating != null && !isNaN(Number(p.rating)) ? Number(p.rating) : 0,
        reviewCount: p.reviewCount != null && !isNaN(Number(p.reviewCount)) ? Number(p.reviewCount) : 0,
      };
    });

    res.json({
      products: sanitizedProducts,
      total: count,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(count / limitNum),
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to list admin products");
    res.json({ products: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  }
});

// ── Get single product ────────────────────────────────────────────────────────
router.get("/admin/products/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    let product: any = null;
    try {
      product = await mongoProducts.findById(req.params.id);
    } catch {
      // Fallback
    }

    if (!product) {
      const rows = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, req.params.id))
        .limit(1)
        .catch(() => []);
      product = rows[0] || null;
    }

    if (!product) return res.status(404).json({ error: "Product not found" });
    const priceNum = product.price != null && !isNaN(Number(product.price))
      ? Number(product.price)
      : (product.basePrice != null && !isNaN(Number(product.basePrice)) ? Number(product.basePrice) : 0);
    const sanitizedProduct = {
      ...product,
      price: priceNum,
      basePrice: product.basePrice != null && !isNaN(Number(product.basePrice)) ? Number(product.basePrice) : priceNum,
      stock: product.stock != null && !isNaN(Number(product.stock)) ? Number(product.stock) : 0,
      rating: product.rating != null && !isNaN(Number(product.rating)) ? Number(product.rating) : 0,
      reviewCount: product.reviewCount != null && !isNaN(Number(product.reviewCount)) ? Number(product.reviewCount) : 0,
    };
    res.json(sanitizedProduct);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch product");
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// ── Update product ────────────────────────────────────────────────────────────
router.patch("/admin/products/:id", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const allowed = [
    "name", "description", "price", "originalPrice", "category", "subcategory",
    "categoryId", "categoryName", "parentCategoryId", "parentCategoryName", "subcategoryId", "subcategoryName",
    "brand", "fabric", "color", "occasion", "active", "isFeatured", "isBestSeller",
    "isNewArrival", "deliveryInfo", "returnPolicy", "stock", "lowStockThreshold",
    "status", "rejectionReason", "approvalRemark", "featuredOrder", "featuredUntil",
  ];
  const updates: Record<string, any> = {};
  for (const f of allowed) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No fields to update" });
  }

  // Business rules: approval implicitly activates; rejection implicitly deactivates
  if (updates.status === "approved" && updates.active === undefined) {
    updates.active = true;
  } else if (updates.status === "rejected" && updates.active === undefined) {
    updates.active = false;
  }

  try {
    let updated: any = null;
    try {
      const rows = await db
        .update(productsTable)
        .set(updates)
        .where(eq(productsTable.id, id))
        .returning();
      if (rows && rows.length > 0) updated = rows[0];
    } catch {}

    const mongoUpdated = await mongoProducts.update(id, updates).catch(() => null);
    if (!updated) updated = mongoUpdated || (await mongoProducts.findById(id).catch(() => null));

    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:updated", { id, ...updates });
    emitProductEvent("catalog:updated", { action: "update", id });

    if (!updated) return res.status(404).json({ error: "Product not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(500).json({ error: "Failed to update product" });
  }
});

// ── Activate product ──────────────────────────────────────────────────────────
router.post("/admin/products/:id/activate", requireAdminKey, async (req: any, res: any) => {
  const id = req.params.id;
  try {
    let updated: any = null;
    try {
      const rows = await db
        .update(productsTable)
        .set({ active: true })
        .where(eq(productsTable.id, id))
        .returning();
      if (rows && rows.length > 0) updated = rows[0];
    } catch {}

    const mongoUpdated = await mongoProducts.update(id, { active: true }).catch(() => null);
    const existing = await mongoProducts.findById(id).catch(() => null);
    updated = { ...(existing || {}), ...(mongoUpdated || {}), ...(updated || {}), active: true };

    if (!updated || !updated.id) return res.status(404).json({ error: "Product not found" });

    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:updated", {
      id,
      productId: id,
      active: true,
      vendorId: updated.vendorId,
      sellerId: updated.sellerId || updated.vendorId,
      ...updated,
    });
    emitProductEvent("catalog:updated", { action: "activate", id });

    writeAuditLog({ action: "product_activated", module: "Products", details: { productId: updated.id, productName: updated.name }, ipAddress: getIp(req) }).catch(() => {});
    res.json({ product: updated, ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to activate product");
    res.status(500).json({ error: "Failed to activate product" });
  }
});

// ── Deactivate product ────────────────────────────────────────────────────────
router.post("/admin/products/:id/deactivate", requireAdminKey, async (req: any, res: any) => {
  const id = req.params.id;
  try {
    let updated: any = null;
    try {
      const rows = await db
        .update(productsTable)
        .set({ active: false })
        .where(eq(productsTable.id, id))
        .returning();
      if (rows && rows.length > 0) updated = rows[0];
    } catch {}

    const mongoUpdated = await mongoProducts.update(id, { active: false }).catch(() => null);
    const existing = await mongoProducts.findById(id).catch(() => null);
    updated = { ...(existing || {}), ...(mongoUpdated || {}), ...(updated || {}), active: false };

    if (!updated || !updated.id) return res.status(404).json({ error: "Product not found" });

    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:updated", {
      id,
      productId: id,
      active: false,
      vendorId: updated.vendorId,
      sellerId: updated.sellerId || updated.vendorId,
      ...updated,
    });
    emitProductEvent("catalog:updated", { action: "deactivate", id });

    writeAuditLog({ action: "product_deactivated", module: "Products", details: { productId: updated.id, productName: updated.name }, ipAddress: getIp(req) }).catch(() => {});
    res.json({ product: updated, ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate product");
    res.status(500).json({ error: "Failed to deactivate product" });
  }
});

// ── Approve product ───────────────────────────────────────────────────────────
router.post("/admin/products/:id/approve", requireAdminKey, async (req: any, res: any) => {
  const { remark } = req.body;
  const id = req.params.id;
  try {
    const existing = await mongoProducts.findById(id).catch(() => null);
    if (!existing || !existing.id) return res.status(404).json({ error: "Product not found" });

    const resolvedCat = resolveCategoryData(
      existing.category,
      existing.subcategory,
      existing.subtype
    );

    const categoryFields = {
      category: (existing.category || resolvedCat.category) as any,
      categorySlug: existing.categorySlug || resolvedCat.categorySlug,
      categoryId: existing.categoryId || resolvedCat.categoryId,
      categoryName: existing.categoryName || resolvedCat.categoryName,
      parentCategoryId: existing.parentCategoryId || resolvedCat.parentCategoryId,
      parentCategoryName: existing.parentCategoryName || resolvedCat.parentCategoryName,
      mainCategoryId: existing.mainCategoryId || resolvedCat.categoryId,
      subcategory: existing.subcategory || resolvedCat.subcategory,
      subcategorySlug: existing.subcategorySlug || resolvedCat.subcategorySlug,
      subcategoryId: existing.subcategoryId || resolvedCat.subcategoryId,
      subcategoryName: existing.subcategoryName || resolvedCat.subcategoryName,
      subtype: existing.subtype || resolvedCat.subtype,
      subtypeId: existing.subtypeId || resolvedCat.subtypeId,
    };

    let updated: any = null;
    try {
      const rows = await db
        .update(productsTable)
        .set({
          status: "approved",
          approvalRemark: remark ?? null,
          active: true,
          category: categoryFields.category,
          subcategory: categoryFields.subcategory,
        })
        .where(eq(productsTable.id, id))
        .returning({ id: productsTable.id, name: productsTable.name, status: productsTable.status });
      if (rows && rows.length > 0) updated = rows[0];
    } catch {}

    const mongoUpdated = await mongoProducts.update(id, {
      status: "approved",
      approvalRemark: remark ?? null,
      active: true,
      ...categoryFields,
    }).catch(() => null);

    const resolvedVendorId = existing.vendorId || mongoUpdated?.vendorId || existing.sellerId;
    const resolvedSellerId = existing.sellerId || mongoUpdated?.sellerId || resolvedVendorId;
    const resolvedVendorName = existing.vendorName || mongoUpdated?.vendorName || "";

    updated = {
      ...(existing || {}),
      ...(mongoUpdated || {}),
      ...(updated || {}),
      status: "approved",
      active: true,
      vendorId: resolvedVendorId,
      sellerId: resolvedSellerId,
      vendorName: resolvedVendorName,
      ...categoryFields,
    };

    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:approved", {
      id,
      productId: id,
      status: "approved",
      active: true,
      vendorId: resolvedVendorId,
      sellerId: resolvedSellerId,
      isNewArrival: updated.isNewArrival,
      ...updated,
    });
    emitProductEvent("product:updated", {
      id,
      productId: id,
      status: "approved",
      active: true,
      vendorId: resolvedVendorId,
      sellerId: resolvedSellerId,
      ...updated,
    });

    // Send notification to the product's seller
    const vendorId = resolvedVendorId || resolvedSellerId;
    if (vendorId) {
      insertSellerNotification({
        vendorId,
        type: "product_approved",
        title: "Product approved",
        body: `"${updated.name}" has been approved by admin and is now active in your store.`,
        metadata: { productId: updated.id },
      }).catch(() => {});
    }

    writeAuditLog({ action: "product_approved", module: "Products", details: { productId: updated.id, productName: updated.name }, ipAddress: getIp(req) }).catch(() => {});
    res.json({ product: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to approve product");
    res.status(500).json({ error: "Failed to approve product" });
  }
});

// ── Reject product ────────────────────────────────────────────────────────────
router.post("/admin/products/:id/reject", requireAdminKey, async (req: any, res: any) => {
  const { reason } = req.body;
  const id = req.params.id;
  try {
    let updated: any = null;
    try {
      const rows = await db
        .update(productsTable)
        .set({ status: "rejected", rejectionReason: reason ?? null, active: false })
        .where(eq(productsTable.id, id))
        .returning({ id: productsTable.id, name: productsTable.name, status: productsTable.status, vendorId: productsTable.vendorId });
      if (rows && rows.length > 0) updated = rows[0];
    } catch {}

    const mongoUpdated = await mongoProducts.update(id, { status: "rejected", rejectionReason: reason ?? null, active: false }).catch(() => null);
    const existing = await mongoProducts.findById(id).catch(() => null);
    updated = { ...(existing || {}), ...(mongoUpdated || {}), ...(updated || {}) };

    if (!updated || !updated.id) return res.status(404).json({ error: "Product not found" });

    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:updated", {
      id,
      productId: id,
      status: "rejected",
      active: false,
      vendorId: updated.vendorId,
      sellerId: updated.sellerId || updated.vendorId,
      ...updated,
    });

    // Send notification to the product's seller
    const vendorId = updated.vendorId || updated.sellerId;
    if (vendorId) {
      insertSellerNotification({
        vendorId,
        type: "product_rejected",
        title: "Product rejected",
        body: `"${updated.name}" was rejected by admin: ${reason || "Does not meet catalog guidelines."}`,
        metadata: { productId: updated.id, reason },
      }).catch(() => {});
    }

    writeAuditLog({ action: "product_rejected", module: "Products", details: { productId: updated.id, productName: updated.name, reason }, ipAddress: getIp(req) }).catch(() => {});
    res.json({ product: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to reject product");
    res.status(500).json({ error: "Failed to reject product" });
  }
});

// ── Delete product ────────────────────────────────────────────────────────────
router.delete("/admin/products/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    const id = req.params.id;
    await db.delete(productsTable).where(eq(productsTable.id, id)).catch(() => {});
    const deleted = await mongoProducts.delete(id);
    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:deleted", { id, productId: id });
    emitProductEvent("catalog:updated", { action: "delete", ids: [id] });
    writeAuditLog({ action: "product_deleted", module: "Products", details: { productId: id }, ipAddress: getIp(req) }).catch(() => {});
    res.json({ ok: true, deleted, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
