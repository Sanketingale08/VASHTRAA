import { Router } from "express";
import { isCustomer } from "../middlewares/isCustomer";
import { db, cartItemsTable, productsTable, mongoCart, mongoProducts } from "@workspace/db";
import { eq, and } from "@workspace/db";
import { getApprovedVendorData, isProductVendorValid } from "../lib/vendorValidation";
import { emitUserEvent } from "../lib/socket";

const router = Router();

router.get("/cart", isCustomer, async (req: any, res) => {
  try {
    const approvedVendorData = await getApprovedVendorData();
    try {
      const cartItems = await mongoCart.findByUserId(req.userId);
      if (cartItems.length === 0) {
        return res.json({ items: [] });
      }
      const productIds = cartItems.map(c => c.productId);
      const products = await mongoProducts.findMany({ id: { $in: productIds } });
      const prodMap = new Map(products.map(p => [p.id, p]));
      const items = cartItems
        .map(c => {
          const p = prodMap.get(c.productId);
          if (!p || !isProductVendorValid(p, approvedVendorData)) return null;
          return {
            id: c.productId,
            productId: c.productId,
            quantity: c.quantity,
            name: p?.name ?? "Product",
            price: p?.price ?? 0,
            basePrice: p?.basePrice ?? (p?.price ? Math.round(p.price / 1.155) : 0),
            shippingFee: p?.shippingFee ?? 100,
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
        })
        .filter(Boolean);
      return res.json({ items });
    } catch {}

    const rows = await db
      .select({
        productId: cartItemsTable.productId,
        quantity: cartItemsTable.quantity,
        name: productsTable.name,
        price: productsTable.price,
        basePrice: productsTable.basePrice,
        shippingFee: productsTable.shippingFee,
        originalPrice: productsTable.originalPrice,
        images: productsTable.images,
        vendorName: productsTable.vendorName,
        vendorId: productsTable.vendorId,
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

    const validRows = rows.filter(r => isProductVendorValid(r, approvedVendorData));
    res.json({ items: validRows.map((r) => ({ ...r, id: r.productId })) });
  } catch (err) {
    req.log.error({ err }, "Failed to get cart");
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

async function handleAddToCart(req: any, res: any): Promise<void> {
  const productId = req.params.productId || req.body.productId;
  if (!productId) {
    res.status(400).json({ error: "productId is required" });
    return;
  }
  const quantity = Math.max(1, parseInt(req.body.quantity ?? "1", 10));
  try {
    let product: any = await mongoProducts.findById(productId);
    if (!product) {
      const rows = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      product = rows[0];
    }

    const approvedVendorData = await getApprovedVendorData();
    if (!product || !isProductVendorValid(product, approvedVendorData)) {
      res.status(400).json({ error: "Product is unavailable because its vendor is not active" });
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

    emitUserEvent(req.userId, "cart:updated", { productId, quantity: cappedQty });
    res.json({ success: true, quantity: cappedQty });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to add to cart");
    res.status(500).json({ error: "Failed to add to cart" });
  }
}

router.post("/cart", isCustomer, handleAddToCart);
router.post("/cart/:productId", isCustomer, handleAddToCart);

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

    emitUserEvent(req.userId, "cart:updated", { productId, quantity: cappedQty });
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
    emitUserEvent(req.userId, "cart:updated", { productId, action: "removed" });
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
    emitUserEvent(req.userId, "cart:cleared", { userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to clear cart");
    res.status(500).json({ error: "Failed to clear cart" });
  }
});

export default router;
