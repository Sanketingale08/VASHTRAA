import { Router } from "express";
import { isCustomer } from "../middlewares/isCustomer";
import { db, cartItemsTable, productsTable, mongoCart, mongoProducts } from "@workspace/db";
import { eq, and } from "@workspace/db";

const router = Router();

router.get("/cart", isCustomer, async (req: any, res) => {
  try {
    try {
      const cartItems = await mongoCart.findByUserId(req.userId);
      if (cartItems.length > 0) {
        const productIds = cartItems.map(c => c.productId);
        const products = await mongoProducts.findMany({ id: { $in: productIds } });
        const prodMap = new Map(products.map(p => [p.id, p]));
        const items = cartItems.map(c => {
          const p = prodMap.get(c.productId);
          return {
            id: c.productId,
            productId: c.productId,
            quantity: c.quantity,
            name: p?.name ?? "Product",
            price: p?.price ?? 0,
            originalPrice: p?.originalPrice ?? null,
            images: p?.images ?? [],
            vendorName: p?.vendorName ?? "",
            stock: p?.stock ?? 10,
            category: p?.category ?? "paithani",
            isBestSeller: p?.isBestSeller ?? false,
            isNewArrival: p?.isNewArrival ?? false,
            rating: p?.rating ?? 4.5,
            reviewCount: p?.reviewCount ?? 0,
          };
        });
        return res.json({ items });
      }
    } catch {}

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

router.post("/cart/:productId", isCustomer, async (req: any, res: any): Promise<void> => {
  const { productId } = req.params;
  const quantity = Math.max(1, parseInt(req.body.quantity ?? "1", 10));
  try {
    let product: any = await mongoProducts.findById(productId);
    if (!product) {
      const rows = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      product = rows[0];
    }

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (product.stock === 0) {
      res.status(400).json({ error: "Product is out of stock" });
      return;
    }

    const existingCart = await mongoCart.findByUserId(req.userId);
    const existingItem = existingCart.find(i => i.productId === productId);
    const newQty = existingItem ? existingItem.quantity + quantity : quantity;
    const cappedQty = Math.max(1, Math.min(newQty, product.stock));

    await mongoCart.upsert(req.userId, productId, cappedQty);

    try {
      await db
        .insert(cartItemsTable)
        .values({ userId: req.userId, productId, quantity: cappedQty })
        .onConflictDoUpdate({
          target: [cartItemsTable.userId, cartItemsTable.productId],
          set: { quantity: cappedQty, updatedAt: new Date() },
        });
    } catch {}

    res.json({ success: true, quantity: cappedQty });
  } catch (err) {
    req.log.error({ err }, "Failed to add to cart");
    res.status(500).json({ error: "Failed to add to cart" });
  }
});

router.put("/cart/:productId", isCustomer, async (req: any, res: any): Promise<void> => {
  const { productId } = req.params;
  const quantity = Math.max(1, parseInt(req.body.quantity ?? "1", 10));
  try {
    let product: any = await mongoProducts.findById(productId);
    if (!product) {
      const rows = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      product = rows[0];
    }

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (product.stock === 0) {
      res.status(400).json({ error: "Product is out of stock" });
      return;
    }

    const cappedQty = Math.max(1, Math.min(quantity, product.stock));
    await mongoCart.upsert(req.userId, productId, cappedQty);

    try {
      await db
        .insert(cartItemsTable)
        .values({ userId: req.userId, productId, quantity: cappedQty })
        .onConflictDoUpdate({
          target: [cartItemsTable.userId, cartItemsTable.productId],
          set: { quantity: cappedQty, updatedAt: new Date() },
        });
    } catch {}

    res.json({ success: true, quantity: cappedQty });
  } catch (err) {
    req.log.error({ err }, "Failed to update cart");
    res.status(500).json({ error: "Failed to update cart" });
  }
});

router.delete("/cart/:productId", isCustomer, async (req: any, res) => {
  const { productId } = req.params;
  try {
    await mongoCart.removeItem(req.userId, productId);
    try {
      await db
        .delete(cartItemsTable)
        .where(and(eq(cartItemsTable.userId, req.userId), eq(cartItemsTable.productId, productId)));
    } catch {}
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove from cart");
    res.status(500).json({ error: "Failed to remove from cart" });
  }
});

router.delete("/cart", isCustomer, async (req: any, res) => {
  try {
    await mongoCart.clearCart(req.userId);
    try {
      await db.delete(cartItemsTable).where(eq(cartItemsTable.userId, req.userId));
    } catch {}
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to clear cart");
    res.status(500).json({ error: "Failed to clear cart" });
  }
});

export default router;
