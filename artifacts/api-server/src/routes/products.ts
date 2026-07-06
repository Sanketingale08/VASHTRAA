import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, vendorsTable } from "@workspace/db/schema";
import { eq, ilike, and, gte, lte, desc, asc, sql, or, isNotNull } from "drizzle-orm";

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
