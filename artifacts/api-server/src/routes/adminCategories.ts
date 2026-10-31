import { Router } from "express";
import { db, productCategoriesTable, mongoProductCategories, mongoProducts } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdminKey } from "../middlewares/isAdmin";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import { emitProductEvent } from "../lib/socket";
import { globalCache, safeInvalidatePattern } from "../lib/cacheEngine";

const router = Router();

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Permissive auth wrapper for category creation by sellers or authenticated users
const allowSellerCategoryCreate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const tokenHeader = (req.headers["x-auth-token"] || req.headers["x-seller-token"] || req.headers["x-user-id"]) as string;
  if (authHeader || tokenHeader || req.cookies?.user_id || req.cookies?.seller_email) {
    return requireVendorAuth(req, res, () => next()).catch?.(() => next()) || next();
  }
  return requireVendorAuth(req, res, next);
};

// ── Public / Seller: list categories ──────────────────────────────────────────
router.get("/categories", async (req: any, res: any) => {
  try {
    const sellerId = (req.query.sellerId as string) || (req.headers["x-seller-id"] as string) || req.vendorId || undefined;
    const cacheKey = globalCache.generateKey("categories:active", { sellerId });

    const categories = await globalCache.getOrFetch(cacheKey, async () => {
      return await mongoProductCategories.listActive(sellerId);
    }, 300_000);

    res.setHeader("Cache-Control", "public, max-age=180, stale-while-revalidate=120");
    res.json({ categories });
  } catch (err) {
    try {
      const rows = await db
        .select()
        .from(productCategoriesTable)
        .where(eq(productCategoriesTable.active, true))
        .orderBy(asc(productCategoriesTable.name));
      res.json({ categories: rows });
    } catch {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  }
});

// ── Seller / Vendor Authenticated: create category ────────────────────────────
const createCategoryHandler = async (req: any, res: any) => {
  // Requirement 1: Sellers are not permitted to create arbitrary catalog categories
  return res.status(403).json({
    error: "Sellers are not permitted to create arbitrary catalog categories. Please choose from the official catalog categories."
  });
};

router.post("/seller/categories", allowSellerCategoryCreate, createCategoryHandler);
router.post("/categories", allowSellerCategoryCreate, createCategoryHandler);

// ── Admin: category statistics ────────────────────────────────────────────────
router.get("/admin/categories/stats", requireAdminKey, async (_req: any, res: any) => {
  try {
    const stats = await mongoProductCategories.getCategoryStats();
    res.json({ stats });
  } catch (err: any) {
    res.json({ stats: { total: 0, active: 0, pending: 0, rejected: 0, totalProducts: 0 } });
  }
});

// ── Admin: list all categories with filters, search, and sorting ──────────────
router.get("/admin/categories", requireAdminKey, async (req: any, res: any) => {
  try {
    const categories = await mongoProductCategories.listAll({
      status: req.query.status as string,
      sellerId: req.query.sellerId as string,
      type: req.query.type as string,
      search: req.query.search as string,
      sort: req.query.sort as string,
    });
    const stats = await mongoProductCategories.getCategoryStats();
    res.json({ categories, stats });
  } catch (err) {
    try {
      const rows = await db
        .select()
        .from(productCategoriesTable)
        .orderBy(asc(productCategoriesTable.name));
      res.json({ categories: rows });
    } catch (err) {
      req.log?.error?.({ err }, "Failed to list categories");
      res.json({ categories: [], stats: { total: 0, active: 0, pending: 0, rejected: 0, totalProducts: 0 } });
    }
  }
});

// ── Admin: create category ────────────────────────────────────────────────────
router.post("/admin/categories", requireAdminKey, async (req: any, res: any) => {
  const { name, type, parentId, coverImage } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const trimmed = String(name).trim();
  const parentIdClean = parentId && String(parentId).trim() ? String(parentId).trim() : null;

  try {
    const categoryDoc = await mongoProductCategories.create({
      name: trimmed,
      type: type ? String(type).trim() : "custom",
      parentId: parentIdClean,
      createdBy: "admin",
      status: "approved",
      coverImage: coverImage ? String(coverImage).trim() : null,
    });

    try {
      await db
        .insert(productCategoriesTable)
        .values({
          id: categoryDoc.id as any,
          name: categoryDoc.name,
          slug: categoryDoc.slug,
          type: categoryDoc.type || "custom",
          createdBy: "admin",
          status: "approved",
          parentId: categoryDoc.parentId as any,
          active: true,
        })
        .onConflictDoNothing();
    } catch {}

    safeInvalidatePattern(/categories/);
    try {
      emitProductEvent("category:updated", { categoryId: categoryDoc.id, type: "created" });
    } catch {}

    res.status(201).json({ category: categoryDoc });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to create category");
    res.status(500).json({ error: "Failed to create category" });
  }
});

// ── Admin: update category status / details ───────────────────────────────────
router.patch("/admin/categories/:id", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { name, active, status, type, coverImage, parentId } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (active !== undefined) updates.active = Boolean(active);
  if (status !== undefined) updates.status = String(status).trim();
  if (type !== undefined) updates.type = String(type).trim();
  if (coverImage !== undefined) updates.coverImage = coverImage ? String(coverImage).trim() : null;
  if (parentId !== undefined) updates.parentId = parentId && String(parentId).trim() ? String(parentId).trim() : null;

  if (!Object.keys(updates).length) return res.status(400).json({ error: "No fields to update" });

  try {
    const updatedDoc = await mongoProductCategories.update(id, updates);

    try {
      const pgUpdates: Record<string, any> = {};
      if (updates.name !== undefined) {
        pgUpdates.name = updates.name;
        pgUpdates.slug = slugify(updates.name);
      }
      if (updates.active !== undefined) pgUpdates.active = updates.active;
      if (updates.status !== undefined) pgUpdates.status = updates.status;
      if (updates.type !== undefined) pgUpdates.type = updates.type;
      if (updates.coverImage !== undefined) pgUpdates.coverImage = updates.coverImage;
      if (updates.parentId !== undefined) pgUpdates.parentId = updates.parentId;
      pgUpdates.updatedAt = new Date();

      await db
        .update(productCategoriesTable)
        .set(pgUpdates)
        .where(eq(productCategoriesTable.id, id));
    } catch {}

    if (!updatedDoc) return res.status(404).json({ error: "Category not found" });
    safeInvalidatePattern(/categories/);
    try {
      emitProductEvent("category:updated", { categoryId: id, type: "updated" });
    } catch {}

    res.json({ category: updatedDoc });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to update category");
    res.status(500).json({ error: "Failed to update category" });
  }
});

// ── Admin: approve/reject category status shortcut ────────────────────────────
router.patch("/admin/categories/:id/status", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { status, active } = req.body;
  if (!status || !["pending", "approved", "rejected"].includes(String(status).toLowerCase())) {
    return res.status(400).json({ error: "Invalid status. Must be pending, approved, or rejected" });
  }
  const cleanStatus = String(status).toLowerCase();
  const updates: Record<string, any> = { status: cleanStatus };
  if (active !== undefined) updates.active = Boolean(active);
  if (cleanStatus === "approved" && active === undefined) updates.active = true;
  if (cleanStatus === "rejected" && active === undefined) updates.active = false;

  try {
    const updatedDoc = await mongoProductCategories.update(id, updates);
    if (!updatedDoc) return res.status(404).json({ error: "Category not found" });

    try {
      await db
        .update(productCategoriesTable)
        .set({ status: cleanStatus, active: updatedDoc.active, updatedAt: new Date() })
        .where(eq(productCategoriesTable.id, id));
    } catch {}

    safeInvalidatePattern(/categories/);
    try {
      emitProductEvent("category:updated", { categoryId: id, type: "status_changed" });
    } catch {}

    res.json({ category: updatedDoc });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to update category status");
    res.status(500).json({ error: "Failed to update category status" });
  }
});

// ── Admin: upload category cover image ────────────────────────────────────────
router.post("/admin/categories/:id/cover-image", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { coverImage } = req.body;
  if (!coverImage || !String(coverImage).trim()) {
    return res.status(400).json({ error: "Cover image URL or data is required" });
  }
  const cleanUrl = String(coverImage).trim();
  try {
    const updatedDoc = await mongoProductCategories.update(id, { coverImage: cleanUrl });
    if (!updatedDoc) return res.status(404).json({ error: "Category not found" });

    try {
      await db
        .update(productCategoriesTable)
        .set({ coverImage: cleanUrl, updatedAt: new Date() })
        .where(eq(productCategoriesTable.id, id));
    } catch {}

    res.json({ category: updatedDoc });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to update cover image");
    res.status(500).json({ error: "Failed to update cover image" });
  }
});

// ── Admin: fetch products for a specific category ─────────────────────────────
router.get("/admin/categories/:id/products", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const cat = (await mongoProductCategories.findById(id)) || (await mongoProductCategories.findBySlug(id));
    if (!cat) return res.status(404).json({ error: "Category not found" });

    const slug = cat.slug.toLowerCase().trim();
    const name = cat.name.toLowerCase().trim();
    const allProducts = await mongoProducts.findMany({}, { limit: 1000 });
    const matchingProducts = allProducts.filter((p) => {
      const pCat = String(p.category || "").toLowerCase().trim();
      const pSlug = pCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return pCat === name || pSlug === slug || pCat === slug;
    });

    const sanitizedProducts = matchingProducts.map((p: any) => {
      const priceNum = p.price != null && !isNaN(Number(p.price))
        ? Number(p.price)
        : (p.basePrice != null && !isNaN(Number(p.basePrice)) ? Number(p.basePrice) : 0);
      return {
        ...p,
        price: priceNum,
        basePrice: p.basePrice != null && !isNaN(Number(p.basePrice)) ? Number(p.basePrice) : priceNum,
        stock: p.stock != null && !isNaN(Number(p.stock)) ? Number(p.stock) : 0,
        rating: p.rating != null && !isNaN(Number(p.rating)) ? Number(p.rating) : 0,
        reviewCount: p.reviewCount != null && !isNaN(Number(p.reviewCount)) ? Number(p.reviewCount) : 0,
      };
    });

    res.json({ category: cat, products: sanitizedProducts, total: sanitizedProducts.length });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to fetch category products");
    res.status(500).json({ error: "Failed to fetch category products" });
  }
});

// ── Admin: delete category ────────────────────────────────────────────────────
router.delete("/admin/categories/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    await mongoProductCategories.delete(req.params.id);
    try {
      await db.delete(productCategoriesTable).where(eq(productCategoriesTable.id, req.params.id));
    } catch {}
    safeInvalidatePattern(/categories/);
    try {
      emitProductEvent("category:updated", { categoryId: req.params.id, type: "deleted" });
    } catch {}
    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to delete category");
    res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;


