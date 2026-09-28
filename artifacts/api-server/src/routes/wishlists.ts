import { Router } from "express";
import { isCustomer } from "../middlewares/isCustomer";
import { db, wishlistsTable, productsTable, mongoWishlists, mongoProducts, eq, and } from "@workspace/db";

const router = Router();

router.get("/wishlists", isCustomer, async (req: any, res: any) => {
  try {
    try {
      const list = await mongoWishlists.findByUserId(req.userId);
      if (list.length > 0) {
        const productIds = list.map(w => w.productId);
        const products = await mongoProducts.findMany({ id: { $in: productIds } });
        const prodMap = new Map(products.map(p => [p.id, p]));
        const items = list.map(w => {
          const p = prodMap.get(w.productId);
          return {
            id: w.productId,
            name: p?.name ?? "Product",
            price: p?.price ?? 0,
            originalPrice: p?.originalPrice ?? null,
            images: p?.images ?? [],
            vendorName: p?.vendorName ?? "",
            rating: p?.rating ?? 4.5,
            reviewCount: p?.reviewCount ?? 0,
            isBestSeller: p?.isBestSeller ?? false,
            isNewArrival: p?.isNewArrival ?? false,
            category: p?.category ?? "paithani",
            addedAt: w.createdAt,
          };
        });
        return res.json({ items });
      }
    } catch {}

    const items = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        originalPrice: productsTable.originalPrice,
        images: productsTable.images,
        vendorName: productsTable.vendorName,
        rating: productsTable.rating,
        reviewCount: productsTable.reviewCount,
        isBestSeller: productsTable.isBestSeller,
        isNewArrival: productsTable.isNewArrival,
        category: productsTable.category,
        addedAt: wishlistsTable.createdAt,
      })
      .from(wishlistsTable)
      .innerJoin(productsTable, eq(wishlistsTable.productId, productsTable.id))
      .where(eq(wishlistsTable.userId, req.userId))
      .orderBy(wishlistsTable.createdAt);

    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wishlist" });
  }
});

router.get("/wishlists/ids", isCustomer, async (req: any, res: any) => {
  try {
    try {
      const list = await mongoWishlists.findByUserId(req.userId);
      if (list.length > 0) {
        res.json({ productIds: list.map(r => r.productId) });
        return;
      }
    } catch {}

    const rows = await db
      .select({ productId: wishlistsTable.productId })
      .from(wishlistsTable)
      .where(eq(wishlistsTable.userId, req.userId));

    res.json({ productIds: rows.map((r) => r.productId) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wishlist ids" });
  }
});

router.post("/wishlists/:productId", isCustomer, async (req: any, res: any) => {
  const { productId } = req.params;
  try {
    await mongoWishlists.add(req.userId, productId);
    try {
      await db
        .insert(wishlistsTable)
        .values({ userId: req.userId, productId })
        .onConflictDoNothing();
    } catch {}
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to add to wishlist" });
  }
});

router.delete("/wishlists/:productId", isCustomer, async (req: any, res: any) => {
  const { productId } = req.params;
  try {
    await mongoWishlists.remove(req.userId, productId);
    try {
      await db
        .delete(wishlistsTable)
        .where(
          and(
            eq(wishlistsTable.userId, req.userId),
            eq(wishlistsTable.productId, productId),
          ),
        );
    } catch {}
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove from wishlist" });
  }
});

export default router;
