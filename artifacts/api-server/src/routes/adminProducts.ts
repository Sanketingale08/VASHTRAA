import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable, productCategoriesTable, productBrandsTable,
} from "@workspace/db";
import {
  eq, sql, desc, asc, ilike, and, or, inArray,
} from "drizzle-orm";
import { requireAdminKey } from "../middlewares/isAdmin";
import { writeAuditLog, getIp } from "../lib/auditLog";

const router = Router();

// ── KPI summary ──────────────────────────────────────────────────────────────
router.get("/admin/products/stats", requireAdminKey, async (req: any, res: any) => {
  try {
    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
        featured: sql<number>`count(*) filter (where is_featured = true)::int`,
      })
      .from(productsTable);

    const [{ activeCategories }] = await db
      .select({ activeCategories: sql<number>`count(*)::int` })
      .from(productCategoriesTable)
      .where(eq(productCategoriesTable.active, true));

    const [{ activeBrands }] = await db
      .select({ activeBrands: sql<number>`count(*)::int` })
      .from(productBrandsTable)
      .where(eq(productBrandsTable.active, true));

    res.json({ ...totals, activeCategories, activeBrands });
  } catch (err) {
    req.log.error({ err }, "Failed to get product stats");
    res.status(500).json({ error: "Failed to fetch stats" });
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
      await db.update(productsTable).set({ status: "approved" }).where(inArray(productsTable.id, ids));
    } else if (action === "reject") {
      await db.update(productsTable).set({ status: "rejected", active: false }).where(inArray(productsTable.id, ids));
    } else if (action === "activate") {
      await db.update(productsTable).set({ active: true }).where(inArray(productsTable.id, ids));
    } else if (action === "deactivate") {
      await db.update(productsTable).set({ active: false }).where(inArray(productsTable.id, ids));
    } else if (action === "delete") {
      await db.delete(productsTable).where(inArray(productsTable.id, ids));
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }
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
      Object.entries(order).map(([id, featuredOrder]) =>
        db.update(productsTable)
          .set({ featuredOrder: Number(featuredOrder) })
          .where(eq(productsTable.id, id))
      )
    );
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
      search, status, category, brand,
      sort = "newest", page = "1", limit = "20",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

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

    const [products, [{ count }]] = await Promise.all([
      db.select().from(productsTable).where(where).orderBy(orderBy).limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(productsTable).where(where),
    ]);

    res.json({
      products,
      total: count,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(count / limitNum),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list admin products");
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// ── Get single product ────────────────────────────────────────────────────────
router.get("/admin/products/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    const rows = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, req.params.id))
      .limit(1);
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.json(rows[0]);
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
  try {
    const [updated] = await db
      .update(productsTable)
      .set(updates)
      .where(eq(productsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Product not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(500).json({ error: "Failed to update product" });
  }
});

// ── Approve product ───────────────────────────────────────────────────────────
router.post("/admin/products/:id/approve", requireAdminKey, async (req: any, res: any) => {
  const { remark } = req.body;
  try {
    const [updated] = await db
      .update(productsTable)
      .set({ status: "approved", approvalRemark: remark ?? null, active: true })
      .where(eq(productsTable.id, req.params.id))
      .returning({ id: productsTable.id, name: productsTable.name, status: productsTable.status });
    if (!updated) return res.status(404).json({ error: "Product not found" });
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
  try {
    const [updated] = await db
      .update(productsTable)
      .set({ status: "rejected", rejectionReason: reason ?? null, active: false })
      .where(eq(productsTable.id, req.params.id))
      .returning({ id: productsTable.id, name: productsTable.name, status: productsTable.status });
    if (!updated) return res.status(404).json({ error: "Product not found" });
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
    await db.delete(productsTable).where(eq(productsTable.id, id));
    writeAuditLog({ action: "product_deleted", module: "Products", details: { productId: id }, ipAddress: getIp(req) }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
