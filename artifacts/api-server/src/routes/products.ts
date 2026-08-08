import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { db } from "@workspace/db";
import { productsTable, vendorsTable, wishlistsTable, notificationsTable, notificationPreferencesTable, searchQueriesTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";
import { eq, ilike, and, gte, lte, desc, asc, sql, or, isNotNull, inArray } from "drizzle-orm";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import { recordStockChange } from "../lib/stockHistory";
import { insertSellerNotification } from "../lib/sellerNotifications";
import { insertAdminNotification } from "../lib/adminNotifications";

async function notifySellerStockLevel(
  vendorId: string | null,
  productId: string,
  productName: string,
  newStock: number,
  lowStockThreshold: number
): Promise<void> {
  if (!vendorId) return;
  if (newStock <= 0) {
    await insertSellerNotification({
      vendorId,
      type: "out_of_stock",
      title: "Product out of stock",
      body: `"${productName}" is now out of stock.`,
      metadata: { productId },
    });
  } else if (newStock <= lowStockThreshold) {
    await insertSellerNotification({
      vendorId,
      type: "low_stock",
      title: "Low stock alert",
      body: `"${productName}" has only ${newStock} unit(s) left.`,
      metadata: { productId },
    });
  }
}

const router = Router();

router.get("/products", async (req, res) => {
  try {
    const {
      search,
      category,
      fabric,
      color,
      occasion,
      vendorId,
      minPrice,
      maxPrice,
      sort,
      page = "1",
      limit = "24",
      bestSeller,
      newArrival,
      hasDiscount,
      minRating,
      ids,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 24));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];

    // Customer-facing: only show active products
    conditions.push(eq(productsTable.active, true));

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(productsTable.name, term),
          ilike(productsTable.description, term),
          ilike(productsTable.vendorName, term),
        )
      );
    }
    if (category) conditions.push(eq(productsTable.category, category as any));
    if (fabric) conditions.push(eq(productsTable.fabric, fabric as any));
    if (color) conditions.push(eq(productsTable.color, color as any));
    if (occasion) conditions.push(eq(productsTable.occasion, occasion as any));
    if (vendorId) conditions.push(eq(productsTable.vendorId, vendorId));
    if (minPrice) conditions.push(gte(productsTable.price, parseInt(minPrice)));
    if (maxPrice) conditions.push(lte(productsTable.price, parseInt(maxPrice)));
    if (bestSeller === "true") conditions.push(eq(productsTable.isBestSeller, true));
    if (newArrival === "true") conditions.push(eq(productsTable.isNewArrival, true));
    if (hasDiscount === "true") conditions.push(isNotNull(productsTable.originalPrice));
    if (minRating) conditions.push(gte(productsTable.rating, parseFloat(minRating)));
    if (ids) {
      const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) conditions.push(inArray(productsTable.id, idList));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    let orderBy;
    switch (sort) {
      case "price_asc":
        orderBy = asc(productsTable.price);
        break;
      case "price_desc":
        orderBy = desc(productsTable.price);
        break;
      case "rating_desc":
        orderBy = desc(productsTable.rating);
        break;
      case "newest":
        orderBy = desc(productsTable.isNewArrival);
        break;
      default:
        orderBy = desc(productsTable.isBestSeller);
    }

    const [products, countResult] = await Promise.all([
      db
        .select()
        .from(productsTable)
        .where(where)
        .orderBy(orderBy)
        .limit(limitNum)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(productsTable)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;

    if (search && search.trim()) {
      const auth = getAuth(req);
      const userId: string | null = (auth?.sessionClaims?.userId as string) || auth?.userId || null;
      db.insert(searchQueriesTable)
        .values({ term: search.trim().toLowerCase(), resultCount: total, userId })
        .catch((err: unknown) => req.log.warn({ err }, "Failed to log search query"));
    }

    res.json({
      products: products.map(normalizeProduct),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list products");
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/products/facets", async (req, res) => {
  try {
    const {
      search,
      category,
      fabric,
      color,
      occasion,
      vendorId,
      minPrice,
      maxPrice,
      bestSeller,
      newArrival,
      hasDiscount,
      minRating,
    } = req.query as Record<string, string>;

    function buildConditions(overrides: {
      fabric?: string | null;
      color?: string | null;
      occasion?: string | null;
      vendorId?: string | null;
      minRating?: string | null;
      ratingThreshold?: number;
    } = {}) {
      const conds = [];
      const { ratingThreshold, ...rest } = overrides;
      const eff = { fabric, color, occasion, vendorId, minRating, ...rest };

      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conds.push(or(
          ilike(productsTable.name, term),
          ilike(productsTable.description, term),
          ilike(productsTable.vendorName, term),
        ));
      }
      if (category) conds.push(eq(productsTable.category, category as any));
      if (eff.fabric !== null && eff.fabric) conds.push(eq(productsTable.fabric, eff.fabric as any));
      if (eff.color !== null && eff.color) conds.push(eq(productsTable.color, eff.color as any));
      if (eff.occasion !== null && eff.occasion) conds.push(eq(productsTable.occasion, eff.occasion as any));
      if (eff.vendorId !== null && eff.vendorId) conds.push(eq(productsTable.vendorId, eff.vendorId));
      if (minPrice) conds.push(gte(productsTable.price, parseInt(minPrice)));
      if (maxPrice) conds.push(lte(productsTable.price, parseInt(maxPrice)));
      if (bestSeller === "true") conds.push(eq(productsTable.isBestSeller, true));
      if (newArrival === "true") conds.push(eq(productsTable.isNewArrival, true));
      if (hasDiscount === "true") conds.push(isNotNull(productsTable.originalPrice));
      if (eff.minRating !== null && eff.minRating) conds.push(gte(productsTable.rating, parseFloat(eff.minRating)));
      if (ratingThreshold !== undefined) conds.push(gte(productsTable.rating, ratingThreshold));

      return conds.length > 0 ? and(...conds) : undefined;
    }

    const [fabricRows, occasionRows, colorRows, vendorRows, ratingRows] = await Promise.all([
      db
        .select({ value: productsTable.fabric, count: sql<number>`count(*)::int` })
        .from(productsTable)
        .where(buildConditions({ fabric: null }))
        .groupBy(productsTable.fabric),
      db
        .select({ value: productsTable.occasion, count: sql<number>`count(*)::int` })
        .from(productsTable)
        .where(buildConditions({ occasion: null }))
        .groupBy(productsTable.occasion),
      db
        .select({ value: productsTable.color, count: sql<number>`count(*)::int` })
        .from(productsTable)
        .where(buildConditions({ color: null }))
        .groupBy(productsTable.color),
      db
        .select({ value: productsTable.vendorId, count: sql<number>`count(*)::int` })
        .from(productsTable)
        .where(buildConditions({ vendorId: null }))
        .groupBy(productsTable.vendorId),
      Promise.all(
        [3, 4, 4.5].map((threshold) =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(productsTable)
            .where(buildConditions({ minRating: null, ratingThreshold: threshold }))
            .then((rows) => ({ threshold, count: rows[0]?.count ?? 0 }))
        )
      ),
    ]);

    const toMap = (rows: { value: string | null; count: number }[]) => {
      const m: Record<string, number> = {};
      for (const r of rows) if (r.value) m[r.value] = r.count;
      return m;
    };

    res.json({
      fabric: toMap(fabricRows),
      occasion: toMap(occasionRows),
      color: toMap(colorRows),
      vendor: toMap(vendorRows as any),
      rating: Object.fromEntries(ratingRows.map((r) => [String(r.threshold), r.count])),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to compute facets");
    res.status(500).json({ error: "Failed to compute facets" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    db.update(productsTable)
      .set({ viewCount: sql`${productsTable.viewCount} + 1` })
      .where(eq(productsTable.id, id))
      .catch((err: unknown) => req.log.warn({ err }, "Failed to increment product view count"));

    res.json(normalizeProduct(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get product");
    res.status(500).json({ error: "Failed to fetch product" });
  }
});


async function notifyWishlistRestock(productId: string, productName: string, previousStock: number, newStock: number) {
  if (!(previousStock === 0 && newStock > 0)) return;

  const wishlistRows = await db
    .select({ userId: wishlistsTable.userId })
    .from(wishlistsTable)
    .where(eq(wishlistsTable.productId, productId));

  for (const { userId } of wishlistRows) {
    const prefRows = await db
      .select({ stockAlerts: notificationPreferencesTable.stockAlerts })
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, userId))
      .limit(1);
    const wantsStock = prefRows.length === 0 || prefRows[0].stockAlerts;
    if (wantsStock) {
      await db.insert(notificationsTable).values({
        userId,
        type: "wishlist_restock",
        title: "Back in stock!",
        body: `"${productName}" is back in stock. Don't miss out!`,
        metadata: { productId },
      });
    }
  }
}

async function notifyWishlistPriceDrop(productId: string, productName: string, previousPrice: number, newPrice: number) {
  if (!(newPrice < previousPrice)) return;

  const wishlistRows = await db
    .select({ userId: wishlistsTable.userId })
    .from(wishlistsTable)
    .where(eq(wishlistsTable.productId, productId));

  const pctOff = Math.round(((previousPrice - newPrice) / previousPrice) * 100);
  for (const { userId } of wishlistRows) {
    const prefRows = await db
      .select({ offerAlerts: notificationPreferencesTable.offerAlerts })
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, userId))
      .limit(1);
    const wantsOffers = prefRows.length === 0 || prefRows[0].offerAlerts;
    if (wantsOffers) {
      await db.insert(notificationsTable).values({
        userId,
        type: "price_drop",
        title: "Price drop alert",
        body: `"${productName}" is now ${pctOff}% off — grab it before the price goes back up!`,
        metadata: { productId, previousPrice, newPrice },
      });
    }
  }
}

router.patch("/products/:id/stock", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { stock } = req.body;

  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    res.status(400).json({ error: "stock must be a non-negative integer" });
    return;
  }

  try {
    const [before] = await db
      .select({
        stock: productsTable.stock,
        name: productsTable.name,
        vendorId: productsTable.vendorId,
        lowStockThreshold: productsTable.lowStockThreshold,
      })
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .limit(1);

    if (!before) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    // Strict vendor ownership: product must belong to a vendor AND that vendor must be owned
    // by the caller. Any gap (no vendorId, no ownerId, mismatch) results in 403.
    if (!before.vendorId) {
      res.status(403).json({ error: "Forbidden: product has no vendor owner" });
      return;
    }
    const [vendor] = await db
      .select({ ownerId: vendorsTable.ownerId })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, before.vendorId))
      .limit(1);
    if (!vendor?.ownerId || vendor.ownerId !== req.userId) {
      res.status(403).json({ error: "Forbidden: you do not own this product's vendor" });
      return;
    }

    const [updated] = await db
      .update(productsTable)
      .set({ stock })
      .where(eq(productsTable.id, id))
      .returning({ stock: productsTable.stock });

    await recordStockChange({
      productId: id,
      vendorId: before.vendorId,
      previousStock: before.stock,
      newStock: stock,
      source: "manual",
      reason: "Manual stock update",
      actorId: req.userId,
    });

    // If restocked (was 0, now > 0) notify users who have this in their wishlist
    await notifyWishlistRestock(id, before.name, before.stock, stock);
    await notifySellerStockLevel(before.vendorId, id, before.name, stock, before.lowStockThreshold ?? 5);

    res.json({ stock: updated.stock });
  } catch (err: any) {
    req.log.error({ err }, "Failed to update product stock");
    res.status(500).json({ error: "Failed to update product stock" });
  }
});

function sanitizeVariants(variants: any): any[] {
  if (!Array.isArray(variants)) return [];
  return variants
    .filter((v) => v && (v.size || v.color))
    .map((v) => ({
      size: v.size ? String(v.size).trim() : undefined,
      color: v.color ? String(v.color).trim() : undefined,
      stock: v.stock != null && v.stock !== "" ? parseInt(v.stock) : undefined,
      price: v.price != null && v.price !== "" ? parseInt(v.price) : undefined,
      sku: v.sku ? String(v.sku).trim() : undefined,
    }));
}

function sanitizeSpecifications(specs: any): any[] {
  if (!Array.isArray(specs)) return [];
  return specs
    .filter((s) => s && s.key && String(s.key).trim())
    .map((s) => ({ key: String(s.key).trim(), value: s.value ? String(s.value).trim() : "" }));
}

router.post("/products", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const {
    name, description, category, subcategory, brand, designPattern,
    fabric, color, occasion, price, originalPrice, stock, lowStockThreshold,
    images, videos, variants, specifications, deliveryInfo, returnPolicy,
    isBestSeller, isNewArrival,
  } = req.body;

  if (!name || !String(name).trim()) { res.status(400).json({ error: "Name is required" }); return; }
  if (!price || isNaN(Number(price)) || Number(price) <= 0) { res.status(400).json({ error: "Valid price is required" }); return; }
  if (!category) { res.status(400).json({ error: "Category is required" }); return; }

  try {
    const seqResult = await db.execute(sql`SELECT nextval('product_id_seq') AS seq`);
    const categoryPrefix = category === "paithani" ? "PS" : "DS";
    const newProductId = `${categoryPrefix}${(seqResult as any).rows[0].seq}`;

    const [product] = await db
      .insert(productsTable)
      .values({
        id: newProductId,
        name: String(name).trim(),
        description: description ? String(description).trim() : "",
        category: category as any,
        subcategory: subcategory ? String(subcategory).trim() : null,
        brand: brand ? String(brand).trim() : null,
        designPattern: designPattern ? String(designPattern).trim() : null,
        fabric: (fabric ?? "silk") as any,
        color: (color ?? "red") as any,
        occasion: (occasion ?? "festival") as any,
        price: parseInt(price),
        originalPrice: originalPrice ? parseInt(originalPrice) : null,
        stock: stock != null ? parseInt(stock) : 10,
        lowStockThreshold: lowStockThreshold != null ? parseInt(lowStockThreshold) : 5,
        images: Array.isArray(images) ? images.filter(Boolean) : [],
        videos: Array.isArray(videos) ? videos.filter(Boolean) : [],
        variants: sanitizeVariants(variants),
        specifications: sanitizeSpecifications(specifications),
        deliveryInfo: deliveryInfo ? String(deliveryInfo).trim() : "",
        returnPolicy: returnPolicy ? String(returnPolicy).trim() : "",
        isBestSeller: Boolean(isBestSeller),
        isNewArrival: Boolean(isNewArrival),
        vendorId: req.vendorId,
        vendorName: req.vendor.name,
        active: true,
      })
      .returning();

    await insertSellerNotification({
      vendorId: req.vendorId,
      type: "product_pending_approval",
      title: "Product submitted for review",
      body: `"${product.name}" has been submitted and is pending approval.`,
      metadata: { productId: product.id },
    });
    await insertAdminNotification({
      type: "product_pending_approval",
      title: "New product pending approval",
      body: `"${product.name}" from ${req.vendor.name} is awaiting approval.`,
      metadata: { productId: product.id, vendorId: req.vendorId },
    });

    res.status(201).json(normalizeProduct(product));
  } catch (err) {
    req.log.error({ err }, "Failed to create product");
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.put("/products/:id", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const {
    name, description, category, subcategory, brand, designPattern,
    fabric, color, occasion, price, originalPrice, stock, lowStockThreshold,
    images, videos, variants, specifications, deliveryInfo, returnPolicy,
    isBestSeller, isNewArrival,
  } = req.body;

  try {
    const [existing] = await db.select({ vendorId: productsTable.vendorId, stock: productsTable.stock, name: productsTable.name, lowStockThreshold: productsTable.lowStockThreshold, price: productsTable.price }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    if (existing.vendorId !== req.vendorId) { res.status(403).json({ error: "Forbidden: you do not own this product" }); return; }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (category !== undefined) updates.category = category;
    if (subcategory !== undefined) updates.subcategory = subcategory ? String(subcategory).trim() : null;
    if (brand !== undefined) updates.brand = brand ? String(brand).trim() : null;
    if (designPattern !== undefined) updates.designPattern = designPattern ? String(designPattern).trim() : null;
    if (fabric !== undefined) updates.fabric = fabric;
    if (color !== undefined) updates.color = color;
    if (occasion !== undefined) updates.occasion = occasion;
    if (price !== undefined) updates.price = parseInt(price);
    if (originalPrice !== undefined) updates.originalPrice = originalPrice ? parseInt(originalPrice) : null;
    if (stock !== undefined) updates.stock = parseInt(stock);
    if (lowStockThreshold !== undefined) updates.lowStockThreshold = parseInt(lowStockThreshold);
    if (images !== undefined) updates.images = Array.isArray(images) ? images.filter(Boolean) : [];
    if (videos !== undefined) updates.videos = Array.isArray(videos) ? videos.filter(Boolean) : [];
    if (variants !== undefined) updates.variants = sanitizeVariants(variants);
    if (specifications !== undefined) updates.specifications = sanitizeSpecifications(specifications);
    if (deliveryInfo !== undefined) updates.deliveryInfo = String(deliveryInfo).trim();
    if (returnPolicy !== undefined) updates.returnPolicy = String(returnPolicy).trim();
    if (isBestSeller !== undefined) updates.isBestSeller = Boolean(isBestSeller);
    if (isNewArrival !== undefined) updates.isNewArrival = Boolean(isNewArrival);

    const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();

    if (updates.stock !== undefined) {
      await recordStockChange({
        productId: id,
        vendorId: existing.vendorId,
        previousStock: existing.stock,
        newStock: updated.stock,
        source: "manual",
        reason: "Manual stock update via product edit",
        actorId: req.userId,
      });
      await notifyWishlistRestock(id, updated.name ?? existing.name, existing.stock, updated.stock);
      await notifySellerStockLevel(existing.vendorId, id, updated.name ?? existing.name, updated.stock, updated.lowStockThreshold ?? existing.lowStockThreshold ?? 5);
    }

    if (updates.price !== undefined && updates.price < existing.price) {
      await notifyWishlistPriceDrop(id, updated.name ?? existing.name, existing.price, updated.price);
    }

    res.json(normalizeProduct(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.delete("/products/:id", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const [existing] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    if (existing.vendorId !== req.vendorId) { res.status(403).json({ error: "Forbidden: you do not own this product" }); return; }
    await db.update(productsTable).set({ active: false }).where(eq(productsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate product");
    res.status(500).json({ error: "Failed to deactivate product" });
  }
});

router.patch("/products/:id/activate", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const [existing] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    if (existing.vendorId !== req.vendorId) { res.status(403).json({ error: "Forbidden: you do not own this product" }); return; }
    const [updated] = await db.update(productsTable).set({ active: true }).where(eq(productsTable.id, id)).returning();
    res.json(normalizeProduct(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to activate product");
    res.status(500).json({ error: "Failed to activate product" });
  }
});

router.patch("/products/:id/deactivate", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const [existing] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    if (existing.vendorId !== req.vendorId) { res.status(403).json({ error: "Forbidden: you do not own this product" }); return; }
    const [updated] = await db.update(productsTable).set({ active: false }).where(eq(productsTable.id, id)).returning();
    res.json(normalizeProduct(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate product");
    res.status(500).json({ error: "Failed to deactivate product" });
  }
});

router.post("/products/:id/duplicate", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    if (existing.vendorId !== req.vendorId) { res.status(403).json({ error: "Forbidden: you do not own this product" }); return; }

    const dupSeq = await db.execute(sql`SELECT nextval('product_id_seq') AS seq`);
    const dupPrefix = existing.category === "paithani" ? "PS" : "DS";
    const dupId = `${dupPrefix}${(dupSeq as any).rows[0].seq}`;

    const [copy] = await db
      .insert(productsTable)
      .values({
        id: dupId,
        name: `${existing.name} (Copy)`,
        description: existing.description,
        category: existing.category,
        subcategory: existing.subcategory,
        brand: existing.brand,
        designPattern: existing.designPattern,
        fabric: existing.fabric,
        color: existing.color,
        occasion: existing.occasion,
        price: existing.price,
        originalPrice: existing.originalPrice,
        stock: 0,
        lowStockThreshold: existing.lowStockThreshold,
        images: existing.images,
        videos: existing.videos,
        variants: existing.variants,
        specifications: existing.specifications,
        deliveryInfo: existing.deliveryInfo,
        returnPolicy: existing.returnPolicy,
        isBestSeller: false,
        isNewArrival: existing.isNewArrival,
        vendorId: req.vendorId,
        vendorName: req.vendor.name,
        active: false,
      })
      .returning();

    res.status(201).json(normalizeProduct(copy));
  } catch (err) {
    req.log.error({ err }, "Failed to duplicate product");
    res.status(500).json({ error: "Failed to duplicate product" });
  }
});

function normalizeProduct(p: typeof productsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    originalPrice: p.originalPrice ?? null,
    category: p.category,
    subcategory: p.subcategory ?? null,
    brand: p.brand ?? null,
    designPattern: p.designPattern ?? null,
    fabric: p.fabric,
    color: p.color,
    occasion: p.occasion,
    vendorId: p.vendorId ?? null,
    vendorName: p.vendorName,
    images: Array.isArray(p.images) ? p.images : [],
    videos: Array.isArray(p.videos) ? p.videos : [],
    variants: Array.isArray(p.variants) ? p.variants : [],
    specifications: Array.isArray(p.specifications) ? p.specifications : [],
    deliveryInfo: p.deliveryInfo ?? "",
    returnPolicy: p.returnPolicy ?? "",
    isBestSeller: p.isBestSeller,
    isNewArrival: p.isNewArrival,
    rating: p.rating,
    reviewCount: p.reviewCount,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    active: p.active,
  };
}

export default router;
