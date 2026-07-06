import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { ordersTable, cartItemsTable } from "@workspace/db";
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

router.post("/orders", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const {
      items,
      address,
      deliveryMethod,
      paymentMethod,
      couponCode,
      subtotal,
      discount,
      shipping,
      tax,
      total,
      isBuyNow,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
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

    const [order] = await db
      .insert(ordersTable)
      .values({
        userId: req.userId,
        items,
        address,
        deliveryMethod,
        paymentMethod,
        couponCode: couponCode || null,
        subtotal: Math.round(subtotal),
        discount: Math.round(discount ?? 0),
        shipping: Math.round(shipping),
        tax: Math.round(tax),
        total: Math.round(total),
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
