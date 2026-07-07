import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { productsTable, vendorsTable, wishlistsTable, notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, desc, asc, sql, or, isNotNull, inArray } from "drizzle-orm";

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

    res.json(normalizeProduct(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get product");
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};

router.patch("/products/:id/stock", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { stock } = req.body;

  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    res.status(400).json({ error: "stock must be a non-negative integer" });
    return;
  }

  try {
    const [before] = await db
      .select({ stock: productsTable.stock, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .limit(1);

    if (!before) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const [updated] = await db
      .update(productsTable)
      .set({ stock })
      .where(eq(productsTable.id, id))
      .returning({ stock: productsTable.stock });

    // If restocked (was 0, now > 0) notify users who have this in their wishlist
    if (before.stock === 0 && stock > 0) {
      const wishlistRows = await db
        .select({ userId: wishlistsTable.userId })
        .from(wishlistsTable)
        .where(eq(wishlistsTable.productId, id));

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
            body: `"${before.name}" is back in stock. Don't miss out!`,
            metadata: { productId: id },
          });
        }
      }
    }

    res.json({ stock: updated.stock });
  } catch (err: any) {
    req.log.error({ err }, "Failed to update product stock");
    res.status(500).json({ error: "Failed to update product stock" });
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
    fabric: p.fabric,
    color: p.color,
    occasion: p.occasion,
    vendorId: p.vendorId ?? null,
    vendorName: p.vendorName,
    images: Array.isArray(p.images) ? p.images : [],
    isBestSeller: p.isBestSeller,
    isNewArrival: p.isNewArrival,
    rating: p.rating,
    reviewCount: p.reviewCount,
    stock: p.stock,
  };
}

export default router;
