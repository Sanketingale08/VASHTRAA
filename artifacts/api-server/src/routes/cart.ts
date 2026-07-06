import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { cartItemsTable, productsTable } from "@workspace/db";
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

router.get("/cart", requireAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select({
        productId: cartItemsTable.productId,
        quantity: cartItemsTable.quantity,
        name: productsTable.name,
        price: productsTable.price,
        originalPrice: productsTable.originalPrice,
        images: productsTable.images,
        vendorName: productsTable.vendorName,
        stock: productsTable.stock,
        category: productsTable.category,
        isBestSeller: productsTable.isBestSeller,
        isNewArrival: productsTable.isNewArrival,
        rating: productsTable.rating,
        reviewCount: productsTable.reviewCount,
      })
      .from(cartItemsTable)
      .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.userId, req.userId));

    res.json({ items: rows.map((r) => ({ ...r, id: r.productId })) });
  } catch (err) {
    req.log.error({ err }, "Failed to get cart");
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

router.post("/cart/:productId", requireAuth, async (req: any, res) => {
  const { productId } = req.params;
  const quantity = Math.max(1, parseInt(req.body.quantity ?? "1", 10));
  try {
    const product = await db
      .select({ stock: productsTable.stock })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (product.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existing = await db
      .select({ quantity: cartItemsTable.quantity })
      .from(cartItemsTable)
      .where(and(eq(cartItemsTable.userId, req.userId), eq(cartItemsTable.productId, productId)))
      .limit(1);

    const newQty = existing.length > 0 ? existing[0].quantity + quantity : quantity;
    const cappedQty = Math.min(newQty, product[0].stock);

    await db
      .insert(cartItemsTable)
      .values({ userId: req.userId, productId, quantity: cappedQty })
      .onConflictDoUpdate({
        target: [cartItemsTable.userId, cartItemsTable.productId],
        set: { quantity: cappedQty, updatedAt: new Date() },
      });

    res.json({ success: true, quantity: cappedQty });
  } catch (err) {
    req.log.error({ err }, "Failed to add to cart");
    res.status(500).json({ error: "Failed to add to cart" });
  }
});

router.put("/cart/:productId", requireAuth, async (req: any, res) => {
  const { productId } = req.params;
  const quantity = Math.max(1, parseInt(req.body.quantity ?? "1", 10));
  try {
    const product = await db
      .select({ stock: productsTable.stock })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (product.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const cappedQty = Math.min(quantity, product[0].stock);

    await db
      .insert(cartItemsTable)
      .values({ userId: req.userId, productId, quantity: cappedQty })
      .onConflictDoUpdate({
        target: [cartItemsTable.userId, cartItemsTable.productId],
        set: { quantity: cappedQty, updatedAt: new Date() },
      });

    res.json({ success: true, quantity: cappedQty });
  } catch (err) {
    req.log.error({ err }, "Failed to update cart");
    res.status(500).json({ error: "Failed to update cart" });
  }
});

router.delete("/cart/:productId", requireAuth, async (req: any, res) => {
  const { productId } = req.params;
  try {
    await db
      .delete(cartItemsTable)
      .where(and(eq(cartItemsTable.userId, req.userId), eq(cartItemsTable.productId, productId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove from cart");
    res.status(500).json({ error: "Failed to remove from cart" });
  }
});

router.delete("/cart", requireAuth, async (req: any, res) => {
  try {
    await db.delete(cartItemsTable).where(eq(cartItemsTable.userId, req.userId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to clear cart");
    res.status(500).json({ error: "Failed to clear cart" });
  }
});

export default router;
