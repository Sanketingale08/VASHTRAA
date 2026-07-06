import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { wishlistsTable, productsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};

router.get("/wishlists", requireAuth, async (req: any, res) => {
  try {
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

router.get("/wishlists/ids", requireAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select({ productId: wishlistsTable.productId })
      .from(wishlistsTable)
      .where(eq(wishlistsTable.userId, req.userId));

    res.json({ productIds: rows.map((r) => r.productId) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wishlist ids" });
  }
});

router.post("/wishlists/:productId", requireAuth, async (req: any, res) => {
  const { productId } = req.params;
  try {
    await db
      .insert(wishlistsTable)
      .values({ userId: req.userId, productId })
      .onConflictDoNothing();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to add to wishlist" });
  }
});

router.delete("/wishlists/:productId", requireAuth, async (req: any, res) => {
  const { productId } = req.params;
  try {
    await db
      .delete(wishlistsTable)
      .where(
        and(
          eq(wishlistsTable.userId, req.userId),
          eq(wishlistsTable.productId, productId),
        ),
      );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove from wishlist" });
  }
});

export default router;
