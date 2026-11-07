import express, { Router } from "express";
import {
  db,
  productCategoriesTable,
  mongoProductCategories,
  mongoProducts,
  findCategoryDefinition,
  findSubcategoryDefinition,
  registerDynamicSubcategory,
  CATALOG_CATEGORIES,
  PRESERVED_SAREE_CATEGORIES,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdminKey, verifyAdminAccessKey } from "../middlewares/isAdmin";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import { emitProductEvent } from "../lib/socket";
import { globalCache, safeInvalidatePattern } from "../lib/cacheEngine";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();
const router = Router();

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Authenticate either super-admin or authenticated seller
const requireSellerOrAdminForCategory = async (req: any, res: any, next: any) => {
  if (req.vendor || req.vendorId || req.isAdmin) {
    return next();
  }
  // Check if caller is super-admin
  const adminKey = req.headers["x-admin-key"] || req.headers["x-admin-token"] || req.cookies?.admin_token;
  if (adminKey && (await verifyAdminAccessKey(String(adminKey)))) {
    req.isAdmin = true;
    return next();
  }
  // Otherwise, seller authentication is required
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

// ── Seller / Vendor Authenticated: create subcategory ────────────────────────────
const createCategoryHandler = async (req: any, res: any) => {
  try {
    const {
      name,
      parentId,
      parentCategoryId,
      category,
      parent: reqParent,
      parentSlug,
      mainCategoryId,
      type,
      description,
      coverImage,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Subcategory name is required." });
    }
    const trimmedName = String(name).trim();

    const rawParentId = parentId || parentCategoryId || category || reqParent || parentSlug || mainCategoryId;

    // 1. Sellers are not permitted to create main categories (must specify parentId and cannot be type: 'main')
    if (!rawParentId || type === "main") {
      if (!req.isAdmin) {
        return res.status(403).json({
          error: "Sellers are not permitted to create arbitrary catalog categories. Please choose from the official catalog categories.",
        });
      }
    }

    const parentIdStr = rawParentId ? String(rawParentId).trim() : null;

    let parentCanonicalId: string | null = null;
    let parentCanonicalSlug: string | null = null;
    let parentCategoryName: string | null = null;

    if (parentIdStr) {
      // 2. Resolve parent main category
      const resolvedParent =
        (await mongoProductCategories.findById(parentIdStr)) ||
        (await mongoProductCategories.findBySlug(parentIdStr)) ||
        (await mongoProductCategories.listActive()).find(
          (c) =>
            c.id === parentIdStr ||
            c.slug === parentIdStr ||
            c.name.toLowerCase() === parentIdStr.toLowerCase()
        ) ||
        findCategoryDefinition(parentIdStr);

      if (!resolvedParent) {
        return res.status(404).json({
          error: `Parent category "${parentIdStr}" not found. Please provide an existing and valid parent main category ID.`,
        });
      }

      // 3. Ensure subcategory is not created under another subcategory
      if (resolvedParent.parentId || resolvedParent.type === "subcategory") {
        return res.status(400).json({
          error: "Subcategories cannot be created under another subcategory. Please select a valid main category.",
        });
      }

      parentCanonicalId = resolvedParent.id || resolvedParent.slug;
      parentCanonicalSlug = resolvedParent.slug || resolvedParent.id;
      parentCategoryName = resolvedParent.name;
    } else if (!req.isAdmin) {
      return res.status(403).json({
        error: "Sellers are not permitted to create arbitrary catalog categories. Please choose from the official catalog categories.",
      });
    }

    const sellerId =
      req.vendorId ||
      req.vendor?.vendorId ||
      req.vendor?.id ||
      req.vendor?.sellerId ||
      req.userId ||
      (req.user?.id ? String(req.user.id) : null) ||
      (req.headers["x-seller-id"] as string) ||
      null;
    const sellerName =
      req.vendor?.storeName ||
      req.vendor?.name ||
      req.vendor?.shopName ||
      req.user?.name ||
      "Seller";

    // 4. Create subcategory in MongoDB with deduplication
    const subcategoryDoc = await mongoProductCategories.create({
      name: trimmedName,
      parentId: parentCanonicalId,
      parentCategory: parentCanonicalSlug,
      type: parentCanonicalId ? "subcategory" : (type || "custom"),
      description: description ? String(description).trim() : null,
      coverImage: coverImage ? String(coverImage).trim() : null,
      sellerId,
      sellerName,
      createdBy: req.isAdmin ? "admin" : "seller",
      status: "approved",
    });

    if (parentCanonicalSlug) {
      registerDynamicSubcategory(parentCanonicalSlug, {
        id: subcategoryDoc.id,
        name: subcategoryDoc.name,
        slug: subcategoryDoc.slug,
        route: subcategoryDoc.route,
        subtypes: subcategoryDoc.subtypes || [],
      });
    }

    // Also sync to PostgreSQL productCategoriesTable if available
    try {
      await db
        .insert(productCategoriesTable)
        .values({
          id: subcategoryDoc.id as any,
          name: subcategoryDoc.name,
          slug: subcategoryDoc.slug,
          type: subcategoryDoc.type || "subcategory",
          createdBy: req.isAdmin ? "admin" : "seller",
          status: "approved",
          parentId: (subcategoryDoc.parentId || parentCanonicalId) as any,
          active: true,
        })
        .onConflictDoNothing();
    } catch {}

    // Invalidate caches & emit real-time event safely
    try {
      safeInvalidatePattern(/categories/);
      globalCache.invalidate("categories:active");
      emitProductEvent("category:created" as any, { category: subcategoryDoc, parentId: parentCanonicalId });
      emitProductEvent("catalog:updated" as any, { action: "subcategory_created", category: subcategoryDoc });
    } catch {}

    return res.status(201).json({
      success: true,
      category: subcategoryDoc,
      subcategory: subcategoryDoc,
      message: parentCategoryName
        ? `Subcategory "${trimmedName}" created successfully under ${parentCategoryName}.`
        : `Category "${trimmedName}" created successfully.`,
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to create subcategory");
    return res.status(500).json({ error: err.message || "Failed to create subcategory" });
  }
};

router.post("/seller/categories", requireSellerOrAdminForCategory, createCategoryHandler);
router.post("/categories", requireSellerOrAdminForCategory, createCategoryHandler);
router.post("/seller/subcategories", requireSellerOrAdminForCategory, createCategoryHandler);
router.post("/subcategories", requireSellerOrAdminForCategory, createCategoryHandler);
router.post("/categories/subcategories", requireSellerOrAdminForCategory, createCategoryHandler);

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
      emitProductEvent("category:created", { categoryId: categoryDoc.id, category: categoryDoc });
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
  const { name, active, status, type, coverImage, bannerImage, description, displayOrder, parentId, subtypes } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (active !== undefined) updates.active = Boolean(active);
  if (status !== undefined) updates.status = String(status).trim();
  if (type !== undefined) updates.type = String(type).trim();
  if (coverImage !== undefined) updates.coverImage = coverImage ? String(coverImage).trim() : null;
  if (bannerImage !== undefined) updates.bannerImage = bannerImage ? String(bannerImage).trim() : null;
  if (description !== undefined) updates.description = description ? String(description).trim() : null;
  if (displayOrder !== undefined) updates.displayOrder = typeof displayOrder === "number" ? displayOrder : parseInt(String(displayOrder), 10) || 0;
  if (parentId !== undefined) updates.parentId = parentId && String(parentId).trim() ? String(parentId).trim() : null;
  if (subtypes !== undefined) updates.subtypes = subtypes;

  if (!Object.keys(updates).length) return res.status(400).json({ error: "No fields to update" });

  try {
    let updatedDoc = await mongoProductCategories.update(id, updates);

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

    if (!updatedDoc) {
      let foundParentCat: any = null;
      let foundSubDef: any = null;
      for (const cat of [...CATALOG_CATEGORIES, ...PRESERVED_SAREE_CATEGORIES]) {
        for (const sub of (cat.subcategories || [])) {
          if (sub.id === id || sub.slug === id || sub.name.toLowerCase() === id.toLowerCase()) {
            foundParentCat = cat;
            foundSubDef = sub;
            break;
          }
        }
        if (foundSubDef) break;
      }
      if (foundSubDef && foundParentCat) {
        updatedDoc = await mongoProductCategories.create({
          name: updates.name || foundSubDef.name,
          type: "subcategory",
          parentId: updates.parentId || foundParentCat.id,
          coverImage: updates.coverImage !== undefined ? updates.coverImage : null,
          description: updates.description,
          status: updates.status || "approved",
          createdBy: "admin",
        });
      }
    }

    if (!updatedDoc) return res.status(404).json({ error: "Category not found" });
    safeInvalidatePattern(/categories/);
    globalCache.invalidate("categories:active");
    try {
      emitProductEvent("category:updated", { categoryId: id, type: "updated" });
      emitProductEvent("catalog:updated", { action: "category_updated", categoryId: id });
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
    let updatedDoc = await mongoProductCategories.update(id, updates);
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

/**
 * Validates image buffer magic bytes / file signature.
 */
function detectCategoryImageFormat(buffer: Buffer): { ext: string; mime: string } | null {
  if (!buffer || buffer.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: "png", mime: "image/png" };
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  // GIF: 47 49 46
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { ext: "gif", mime: "image/gif" };
  }
  // WebP: RIFF .... WEBP
  if (buffer.length >= 12) {
    const riff = buffer.slice(0, 4).toString("ascii");
    const webp = buffer.slice(8, 12).toString("ascii");
    if (riff === "RIFF" && webp === "WEBP") {
      return { ext: "webp", mime: "image/webp" };
    }
  }
  // SVG: <?xml ... <svg or <svg
  const startStr = buffer.slice(0, 300).toString("utf8").toLowerCase().trim();
  if (startStr.includes("<svg") || (startStr.startsWith("<?xml") && startStr.includes("<svg"))) {
    return { ext: "svg", mime: "image/svg+xml" };
  }
  return null;
}

// ── Admin: raw binary upload for category / subcategory image ──────────────────
router.post(
  "/admin/upload/category-image",
  requireAdminKey,
  (req: any, res: any, next: any) => {
    express.raw({ type: () => true, limit: "15mb" })(req, res, (err: any) => {
      if (err) {
        if (err.type === "entity.too.large" || err.status === 413) {
          return res.status(413).json({ error: "Image size exceeds 15MB limit. Please choose a smaller image." });
        }
        return next(err);
      }
      next();
    });
  },
  async (req: any, res: any) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "No image data received" });
      }
      if (req.body.length > 15 * 1024 * 1024) {
        return res.status(400).json({ error: "Image size must be 15MB or less" });
      }

      const detected = detectCategoryImageFormat(req.body);
      const rawContentType = (req.headers["content-type"] || "image/jpeg")
        .split(";")[0]
        .trim()
        .toLowerCase();

      let ext = detected?.ext;
      let finalContentType = detected?.mime;

      if (!ext) {
        if (!rawContentType.startsWith("image/")) {
          return res.status(400).json({ error: "Only image files (JPG, PNG, WebP) are allowed." });
        }
        const rawExt = rawContentType.split("/")[1] || "jpg";
        ext = rawExt === "jpeg" ? "jpg" : ["jpg", "png", "webp", "gif"].includes(rawExt) ? rawExt : "jpg";
        finalContentType = rawContentType;
      }

      const categoryIdentifier =
        (req.headers["x-category-id"] as string) ||
        (req.headers["x-subcategory-id"] as string) ||
        (req.query.category as string) ||
        (req.query.categoryId as string) ||
        "category";

      const { publicRelPath, objectKey, fileName, size } =
        await objectStorageService.uploadPublicCategoryImage(
          req.body,
          ext,
          finalContentType || "image/jpeg",
          categoryIdentifier
        );

      res.json({
        success: true,
        message: "Image uploaded successfully",
        url: publicRelPath,
        publicUrl: publicRelPath,
        publicRelPath,
        objectKey,
        fileName,
        size,
      });
    } catch (err: any) {
      console.error("[UploadCategoryImage Error]:", err);
      req.log?.error?.({ err }, "Failed to upload category image");
      res.status(500).json({ error: err?.message || "Failed to upload image" });
    }
  }
);

// ── Admin: upload category cover image ────────────────────────────────────────
router.post("/admin/categories/:id/cover-image", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { coverImage, action } = req.body;

  // 1. Remove Image action
  if (action === "remove" || coverImage === null || coverImage === "") {
    let updatedDoc = await mongoProductCategories.update(id, { coverImage: null });
    try {
      const col = (await import("@workspace/db")).getCollection("product_categories");
      await col.updateMany(
        { "subcategories.id": id },
        { $set: { "subcategories.$[elem].coverImage": null } },
        { arrayFilters: [{ "elem.id": id }] }
      );
      await col.updateMany(
        { "subcategories.slug": id },
        { $set: { "subcategories.$[elem].coverImage": null } },
        { arrayFilters: [{ "elem.slug": id }] }
      );
    } catch {}

    try {
      const { inMemoryCategoriesMap } = (await import("@workspace/db")) as any;
      if (inMemoryCategoriesMap) {
        for (const p of inMemoryCategoriesMap.values()) {
          if (Array.isArray(p.subcategories)) {
            for (const s of p.subcategories) {
              if (s.id === id || s.slug === id) {
                s.coverImage = null;
              }
            }
          }
        }
      }
    } catch {}

    try {
      await db
        .update(productCategoriesTable)
        .set({ coverImage: null, updatedAt: new Date() })
        .where(eq(productCategoriesTable.id, id));
    } catch {}

    safeInvalidatePattern(/categories/);
    globalCache.del("categories:active");
    try {
      emitProductEvent("category:updated", { categoryId: id, type: "image_removed" });
      emitProductEvent("catalog:updated", { action: "category_image_updated", categoryId: id });
    } catch {}

    return res.json({ success: true, message: "Cover image removed", coverImage: null, category: updatedDoc });
  }

  if (!coverImage || !String(coverImage).trim()) {
    return res.status(400).json({ error: "Cover image URL or data is required" });
  }

  let cleanUrl = String(coverImage).trim();

  // If client provided a base64 string, upload to R2/storage and extract clean URL
  // Enforcing: "Do not store raw image files or base64 data in MongoDB"
  if (cleanUrl.startsWith("data:image/")) {
    try {
      const match = cleanUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const rawExt = mime.split("/")[1] || "jpg";
        const ext = rawExt === "jpeg" ? "jpg" : rawExt;
        const buffer = Buffer.from(match[2], "base64");
        const uploadResult = await objectStorageService.uploadPublicCategoryImage(
          buffer,
          ext,
          mime,
          id
        );
        cleanUrl = uploadResult.publicRelPath;
      }
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to process and store image" });
    }
  }

  try {
    let updatedDoc = await mongoProductCategories.update(id, { coverImage: cleanUrl });

    // If doc was not found directly, check if it's a known static subcategory or category
    if (!updatedDoc) {
      let foundParentCat: any = null;
      let foundSubDef: any = null;
      for (const cat of [...CATALOG_CATEGORIES, ...PRESERVED_SAREE_CATEGORIES]) {
        for (const sub of (cat.subcategories || [])) {
          if (sub.id === id || sub.slug === id || sub.name.toLowerCase() === id.toLowerCase()) {
            foundParentCat = cat;
            foundSubDef = sub;
            break;
          }
        }
        if (foundSubDef) break;
      }

      // Check if embedded in any parent category in MongoDB or memory
      if (!foundSubDef) {
        try {
          const col = (await import("@workspace/db")).getCollection("product_categories");
          const parentDoc = (await col.findOne({ "subcategories.id": id })) || (await col.findOne({ "subcategories.slug": id }));
          if (parentDoc) {
            foundParentCat = parentDoc;
            foundSubDef = (parentDoc.subcategories || []).find(
              (s: any) => s.id === id || s.slug === id || s.name?.toLowerCase() === id.toLowerCase()
            );
          }
        } catch {}
      }

      if (!foundSubDef) {
        try {
          const allCats = await mongoProductCategories.listAll();
          for (const p of allCats) {
            for (const s of (p.subcategories || [])) {
              if (s.id === id || s.slug === id || s.name?.toLowerCase() === id.toLowerCase()) {
                foundParentCat = p;
                foundSubDef = s;
                break;
              }
            }
            if (foundSubDef) break;
          }
        } catch {}
      }

      if (foundSubDef && foundParentCat) {
        updatedDoc = await mongoProductCategories.create({
          id: foundSubDef.id || id,
          name: foundSubDef.name,
          slug: foundSubDef.slug,
          type: "subcategory",
          parentId: foundParentCat.id || foundParentCat.slug,
          coverImage: cleanUrl,
          status: "approved",
          createdBy: "admin",
        });
      } else {
        const catDef = findCategoryDefinition(id);
        if (catDef) {
          updatedDoc = await mongoProductCategories.create({
            id: catDef.id,
            name: catDef.name,
            type: "main",
            coverImage: cleanUrl,
            status: "approved",
            createdBy: "admin",
          });
        }
      }
    }

    if (!updatedDoc) {
      return res.status(404).json({ error: `Category or subcategory "${id}" not found.` });
    }

    // Also update embedded subcategory in any parent category document
    try {
      const col = (await import("@workspace/db")).getCollection("product_categories");
      await col.updateMany(
        { "subcategories.id": id },
        { $set: { "subcategories.$[elem].coverImage": cleanUrl } },
        { arrayFilters: [{ "elem.id": id }] }
      );
      if (updatedDoc?.id && updatedDoc.id !== id) {
        await col.updateMany(
          { "subcategories.id": updatedDoc.id },
          { $set: { "subcategories.$[elem].coverImage": cleanUrl } },
          { arrayFilters: [{ "elem.id": updatedDoc.id }] }
        );
      }
      if (updatedDoc?.slug) {
        await col.updateMany(
          { "subcategories.slug": updatedDoc.slug },
          { $set: { "subcategories.$[elem].coverImage": cleanUrl } },
          { arrayFilters: [{ "elem.slug": updatedDoc.slug }] }
        );
      }
    } catch {}

    try {
      const { inMemoryCategoriesMap } = (await import("@workspace/db")) as any;
      if (inMemoryCategoriesMap) {
        for (const p of inMemoryCategoriesMap.values()) {
          if (Array.isArray(p.subcategories)) {
            for (const s of p.subcategories) {
              if (s.id === id || s.slug === id || s.id === updatedDoc?.id || s.slug === updatedDoc?.slug) {
                s.coverImage = cleanUrl;
              }
            }
          }
        }
      }
    } catch {}

    try {
      await db
        .update(productCategoriesTable)
        .set({ coverImage: cleanUrl, updatedAt: new Date() })
        .where(eq(productCategoriesTable.id, id));
    } catch {}

    safeInvalidatePattern(/categories/);
    globalCache.del("categories:active");
    try {
      emitProductEvent("category:updated", { categoryId: id, type: "image_updated" });
      emitProductEvent("catalog:updated", { action: "category_image_updated", categoryId: id });
    } catch {}

    res.json({
      success: true,
      message: "Cover image updated successfully",
      coverImage: cleanUrl,
      category: updatedDoc,
    });
  } catch (err: any) {
    console.error("[CoverImage Update Error]:", err);
    req.log?.error?.({ err }, "Failed to update cover image");
    res.status(500).json({ error: err?.message || "Failed to update cover image" });
  }
});

// ── Admin: remove category or subcategory cover image ────────────────────────
router.delete("/admin/categories/:id/cover-image", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const updatedDoc = await mongoProductCategories.update(id, { coverImage: null });
    try {
      const col = (await import("@workspace/db")).getCollection("product_categories");
      await col.updateMany(
        { "subcategories.id": id },
        { $set: { "subcategories.$[elem].coverImage": null } },
        { arrayFilters: [{ "elem.id": id }] }
      );
      await col.updateMany(
        { "subcategories.slug": id },
        { $set: { "subcategories.$[elem].coverImage": null } },
        { arrayFilters: [{ "elem.slug": id }] }
      );
    } catch {}

    try {
      const { inMemoryCategoriesMap } = (await import("@workspace/db")) as any;
      if (inMemoryCategoriesMap) {
        for (const p of inMemoryCategoriesMap.values()) {
          if (Array.isArray(p.subcategories)) {
            for (const s of p.subcategories) {
              if (s.id === id || s.slug === id) {
                s.coverImage = null;
              }
            }
          }
        }
      }
    } catch {}

    try {
      await db
        .update(productCategoriesTable)
        .set({ coverImage: null, updatedAt: new Date() })
        .where(eq(productCategoriesTable.id, id));
    } catch {}

    safeInvalidatePattern(/categories/);
    globalCache.del("categories:active");
    try {
      emitProductEvent("category:updated", { categoryId: id, type: "image_removed" });
      emitProductEvent("catalog:updated", { action: "category_image_updated", categoryId: id });
    } catch {}

    res.json({
      success: true,
      message: "Cover image removed successfully",
      coverImage: null,
      category: updatedDoc,
    });
  } catch (err: any) {
    console.error("[CoverImage Remove Error]:", err);
    req.log?.error?.({ err }, "Failed to remove cover image");
    res.status(500).json({ error: err?.message || "Failed to remove cover image" });
  }
});

// ── Admin: upload category banner image ───────────────────────────────────────
router.post("/admin/categories/:id/banner-image", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { bannerImage } = req.body;
  if (!bannerImage || !String(bannerImage).trim()) {
    return res.status(400).json({ error: "Banner image URL or data is required" });
  }
  const cleanUrl = String(bannerImage).trim();
  try {
    const updatedDoc = await mongoProductCategories.update(id, { bannerImage: cleanUrl });
    if (!updatedDoc) return res.status(404).json({ error: "Category not found" });

    safeInvalidatePattern(/categories/);
    res.json({ category: updatedDoc });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to update banner image");
    res.status(500).json({ error: "Failed to update banner image" });
  }
});

// ── Admin: assign products to category ────────────────────────────────────────
router.post("/admin/categories/:id/assign-products", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { productIds } = req.body;
  if (!Array.isArray(productIds) || !productIds.length) {
    return res.status(400).json({ error: "productIds array is required" });
  }

  try {
    const cat = (await mongoProductCategories.findById(id)) || (await mongoProductCategories.findBySlug(id));
    if (!cat) return res.status(404).json({ error: "Category not found" });

    const updated = [];
    for (const pid of productIds) {
      const prod = await mongoProducts.findById(pid);
      if (prod) {
        const pUpdates: any = {
          category: cat.slug,
          categoryId: cat.id,
          categoryName: cat.name,
          parentCategoryId: cat.id,
          parentCategoryName: cat.name,
        };
        const u = await mongoProducts.update(pid, pUpdates);
        if (u) updated.push(u);
      }
    }

    safeInvalidatePattern(/products/);
    safeInvalidatePattern(/categories/);
    res.json({ ok: true, assignedCount: updated.length });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to assign products to category");
    res.status(500).json({ error: "Failed to assign products" });
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
      const pCatId = String((p as any).categoryId || "").trim();
      const pSub = String(p.subCategory || p.subcategory || "").toLowerCase().trim();
      const pSubSlug = pSub.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const pSubId = String((p as any).subcategoryId || "").trim();

      if (cat.type === "main" || !cat.parentId) {
        if (pCatId && (pCatId === cat.id || pCatId === cat.slug)) return true;
        if (pCat === name || pSlug === slug || pCat === slug) return true;
        if (slug === "paithani" && (pCat.includes("paithani") || pCat === "paithani sarees")) return true;
        if (slug === "designer" && (pCat.includes("designer") || pCat === "designer sarees")) return true;
        if (slug === "chanderi" && (pCat.includes("chanderi") || pCat === "chanderi sarees")) return true;
        if (slug === "banarasi" && (pCat.includes("banarasi") || pCat === "banarasi sarees")) return true;
        if (slug === "kanjivaram" && (pCat.includes("kanjivaram") || pCat === "kanjivaram sarees")) return true;
        if (slug === "gadwal" && (pCat.includes("gadwal") || pCat === "gadwal sarees")) return true;
        if (slug === "bandhani" && (pCat.includes("bandhani") || pCat === "bandhani sarees")) return true;
        if (slug === "mysore-silk" && (pCat.includes("mysore") || pCat === "mysore silk sarees")) return true;
        if (slug === "ikat" && (pCat.includes("ikat") || pCat === "ikat sarees")) return true;
        if (slug === "cotton" && (pCat.includes("cotton") || pCat === "cotton sarees")) return true;
        if (slug === "silk" && (pCat.includes("silk") || pCat === "silk sarees")) return true;
        if (slug === "other-traditional" && (pCat.includes("traditional") || pCat === "other traditional sarees")) return true;
        return false;
      } else {
        if (pSubId && (pSubId === cat.id || pSubId === cat.slug)) return true;
        return pSub === name || pSubSlug === slug || pSub === slug;
      }
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
      emitProductEvent("category:deleted", { categoryId: req.params.id });
      emitProductEvent("category:updated", { categoryId: req.params.id, type: "deleted" });
    } catch {}
    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to delete category");
    res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;


