import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { ordersTable, cartItemsTable, productsTable, couponsTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";

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

async function lookupCoupon(code: string): Promise<{ type: "percent" | "flat"; value: number } | null> {
  const rows = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.code, code))
    .limit(1);
  if (rows.length === 0) return null;
  const coupon = rows[0];
  if (!coupon.active) return null;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return null;
  return { type: coupon.type, value: coupon.value };
}

function computeShipping(deliveryMethod: string, afterDiscount: number): number {
  if (deliveryMethod === "express") return 499;
  return afterDiscount >= 5000 ? 0 : 199;
}

router.post("/orders", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const {
      items: clientItems,
      address,
      deliveryMethod,
      paymentMethod,
      couponCode,
      isBuyNow,
    } = req.body;

    if (!clientItems || !Array.isArray(clientItems) || clientItems.length === 0) {
      res.status(400).json({ error: "No items in order" });
      return;
    }
    if (!address || !address.name || !address.line1 || !address.city || !address.state || !address.pincode) {
      res.status(400).json({ error: "Invalid address" });
      return;
    }
    if (!["standard", "express"].includes(deliveryMethod)) {
      res.status(400).json({ error: "Invalid delivery method" });
      return;
    }
    if (!["upi", "card", "cod"].includes(paymentMethod)) {
      res.status(400).json({ error: "Invalid payment method" });
      return;
    }

    const productIds: string[] = clientItems.map((i: any) => i.productId);
    const dbProducts = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        images: productsTable.images,
        vendorName: productsTable.vendorName,
        stock: productsTable.stock,
      })
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));

    if (dbProducts.length !== productIds.length) {
      res.status(400).json({ error: "One or more products not found" });
      return;
    }

    const productMap = new Map(dbProducts.map(p => [p.id, p]));

    const resolvedItems: Array<{
      productId: string; name: string; price: number; quantity: number;
      images: unknown; vendorName: string;
    }> = [];
    for (const i of clientItems) {
      const p = productMap.get(i.productId);
      if (!p) {
        res.status(400).json({ error: "One or more products not found" });
        return;
      }
      if (p.stock <= 0) {
        res.status(400).json({ error: `"${p.name}" is currently out of stock` });
        return;
      }
      const requestedQty = parseInt(i.quantity, 10);
      if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
        res.status(400).json({ error: `Invalid quantity for "${p.name}"` });
        return;
      }
      if (requestedQty > p.stock) {
        res.status(400).json({ error: `Only ${p.stock} unit(s) of "${p.name}" available` });
        return;
      }
      resolvedItems.push({
        productId: p.id,
        name: p.name,
        price: p.price,
        quantity: requestedQty,
        images: p.images,
        vendorName: p.vendorName,
      });
    }

    const subtotal = resolvedItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);

    let discount = 0;
    const normalizedCoupon = couponCode ? String(couponCode).trim().toUpperCase() : null;
    const coupon = normalizedCoupon ? await lookupCoupon(normalizedCoupon) : null;
    if (coupon) {
      discount = coupon.type === "percent"
        ? Math.round(subtotal * coupon.value / 100)
        : Math.min(coupon.value, subtotal);
    }

    const afterDiscount = subtotal - discount;
    const shipping = computeShipping(deliveryMethod, afterDiscount);
    const tax = Math.round(afterDiscount * 0.05);
    const total = afterDiscount + shipping + tax;

    const [order] = await db
      .insert(ordersTable)
      .values({
        userId: req.userId,
        items: resolvedItems,
        address,
        deliveryMethod,
        paymentMethod,
        couponCode: coupon ? normalizedCoupon : null,
        subtotal,
        discount,
        shipping,
        tax,
        total,
        status: "confirmed",
      })
      .returning({ id: ordersTable.id });

    if (!isBuyNow) {
      await db.delete(cartItemsTable).where(eq(cartItemsTable.userId, req.userId));
    }

    res.json({ orderId: order.id });
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.get("/orders", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.userId, req.userId))
      .orderBy(desc(ordersTable.createdAt));

    res.json({ orders: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch orders");
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.get("/orders/:orderId", requireAuth, async (req: any, res: any): Promise<void> => {
  const { orderId } = req.params;
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.userId)))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json({ order: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch order");
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

export default router;
