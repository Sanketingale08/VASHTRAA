import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  ordersTable, cartItemsTable, productsTable, couponsTable,
  couponRedemptionsTable, userProfilesTable, rewardPointsLogTable,
  notificationsTable, notificationPreferencesTable,
} from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { insertOrderStatusNotification } from "../lib/orderNotifications";
import { recordStockChange } from "../lib/stockHistory";

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

function computeTier(totalPoints: number): "silver" | "gold" | "platinum" {
  if (totalPoints >= 5000) return "platinum";
  if (totalPoints >= 1000) return "gold";
  return "silver";
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function lookupCoupon(code: string): Promise<{ id: string; code: string; type: "percent" | "flat"; value: number; maxUses: number | null; usedCount: number; expiresAt: Date | null } | null> {
  const rows = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.code, code))
    .limit(1);
  if (rows.length === 0) return null;
  const coupon = rows[0];
  if (!coupon.active) return null;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return null;
  return { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value, maxUses: coupon.maxUses ?? null, usedCount: coupon.usedCount, expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null };
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
    if (!["upi", "card", "credit_card", "debit_card", "net_banking", "wallet", "cod"].includes(paymentMethod)) {
      res.status(400).json({ error: "Invalid payment method" });
      return;
    }

    const productIds: string[] = clientItems.map((i: any) => i.productId);

    const normalizedCoupon = couponCode ? String(couponCode).trim().toUpperCase() : null;
    const coupon = normalizedCoupon ? await lookupCoupon(normalizedCoupon) : null;

    if (normalizedCoupon && !coupon) {
      res.status(400).json({ error: `Coupon "${normalizedCoupon}" is invalid, expired, or no longer active. Please remove it or try a different code.`, couponInvalid: true });
      return;
    }

    let orderId: string;
    try {
      orderId = await db.transaction(async (tx) => {
        const dbProducts = await tx
          .select({
            id: productsTable.id,
            name: productsTable.name,
            price: productsTable.price,
            images: productsTable.images,
            vendorName: productsTable.vendorName,
            vendorId: productsTable.vendorId,
            stock: productsTable.stock,
          })
          .from(productsTable)
          .where(inArray(productsTable.id, productIds))
          .for("update");

        if (dbProducts.length !== productIds.length) {
          throw Object.assign(new Error("One or more products not found"), { status: 400 });
        }

        const productMap = new Map(dbProducts.map(p => [p.id, p]));

        const resolvedItems: Array<{
          productId: string; name: string; price: number; quantity: number;
          images: unknown; vendorName: string;
        }> = [];

        for (const i of clientItems) {
          const p = productMap.get(i.productId);
          if (!p) {
            throw Object.assign(new Error("One or more products not found"), { status: 400 });
          }
          if (p.stock <= 0) {
            throw Object.assign(new Error(`"${p.name}" is currently out of stock`), { status: 400 });
          }
          const requestedQty = parseInt(i.quantity, 10);
          if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
            throw Object.assign(new Error(`Invalid quantity for "${p.name}"`), { status: 400 });
          }
          if (requestedQty > p.stock) {
            throw Object.assign(new Error(`Only ${p.stock} unit(s) of "${p.name}" available`), { status: 400 });
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

        if (coupon) {
          const [freshCoupon] = await tx
            .select({ usedCount: couponsTable.usedCount, maxUses: couponsTable.maxUses })
            .from(couponsTable)
            .where(eq(couponsTable.id, coupon.id))
            .for("update");

          if (freshCoupon.maxUses !== null && freshCoupon.usedCount >= freshCoupon.maxUses) {
            throw Object.assign(new Error("This coupon has reached its usage limit"), { status: 400 });
          }

          const existingRedemption = await tx
            .select({ id: couponRedemptionsTable.id })
            .from(couponRedemptionsTable)
            .where(
              and(
                eq(couponRedemptionsTable.couponId, coupon.id),
                eq(couponRedemptionsTable.userId, req.userId)
              )
            )
            .limit(1);

          if (existingRedemption.length > 0) {
            throw Object.assign(new Error("You have already used this coupon"), { status: 400 });
          }

          if (coupon.expiresAt) {
            const hoursLeft = (coupon.expiresAt.getTime() - Date.now()) / 3600000;
            if (hoursLeft > 0 && hoursLeft <= 72) {
              const offerPrefs = await tx
                .select({ offerAlerts: notificationPreferencesTable.offerAlerts })
                .from(notificationPreferencesTable)
                .where(eq(notificationPreferencesTable.userId, req.userId))
                .limit(1);
              const wantsOffers = offerPrefs.length === 0 || offerPrefs[0].offerAlerts;
              if (wantsOffers) {
                const existingExpiry = await tx
                  .select({ id: notificationsTable.id })
                  .from(notificationsTable)
                  .where(
                    and(
                      eq(notificationsTable.userId, req.userId),
                      eq(notificationsTable.type, "coupon_expiry"),
                      sql`${notificationsTable.metadata}->>'couponId' = ${coupon.id}`
                    )
                  )
                  .limit(1);
                if (existingExpiry.length === 0) {
                  const daysLeft = Math.max(1, Math.ceil(hoursLeft / 24));
                  await tx.insert(notificationsTable).values({
                    userId: req.userId,
                    type: "coupon_expiry",
                    title: `Coupon "${coupon.code}" expiring soon`,
                    body: `Your coupon expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Use it before it's gone!`,
                    metadata: { couponId: coupon.id, couponCode: coupon.code },
                  });
                }
              }
            }
          }
        }

        const subtotal = resolvedItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);

        let discount = 0;
        if (coupon) {
          discount = coupon.type === "percent"
            ? Math.round(subtotal * coupon.value / 100)
            : Math.min(coupon.value, subtotal);
        }

        const afterDiscount = subtotal - discount;
        const shipping = computeShipping(deliveryMethod, afterDiscount);
        const taxAmt = Math.round(shipping * 0.18);
        const codFee = paymentMethod === "cod" ? 50 : 0;
        const total = afterDiscount + shipping + taxAmt + codFee;

        const nowIso = new Date().toISOString();
        const [order] = await tx
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
            tax: taxAmt,
            total,
            status: "confirmed",
            statusHistory: [{ status: "confirmed", timestamp: nowIso, note: "Order placed" }],
          })
          .returning({ id: ordersTable.id });

        for (const item of resolvedItems) {
          await tx
            .update(productsTable)
            .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
            .where(eq(productsTable.id, item.productId));

          const originalProduct = productMap.get(item.productId);
          await recordStockChange({
            tx,
            productId: item.productId,
            vendorId: originalProduct?.vendorId ?? null,
            previousStock: originalProduct?.stock ?? 0,
            newStock: (originalProduct?.stock ?? 0) - item.quantity,
            source: "order",
            reason: "Order placed",
            actorId: req.userId,
            orderId: order.id,
          });
        }

        if (coupon) {
          await tx
            .update(couponsTable)
            .set({ usedCount: sql`${couponsTable.usedCount} + 1` })
            .where(eq(couponsTable.id, coupon.id));

          await tx
            .insert(couponRedemptionsTable)
            .values({
              couponId: coupon.id,
              userId: req.userId,
              orderId: order.id,
            });
        }

        if (!isBuyNow) {
          await tx.delete(cartItemsTable).where(eq(cartItemsTable.userId, req.userId));
        }

        const earnedPoints = Math.floor(subtotal / 10);
        if (earnedPoints > 0) {
          let refCode = generateReferralCode();
          let codeAttempts = 0;
          while (codeAttempts < 10) {
            const conflict = await tx
              .select({ userId: userProfilesTable.userId })
              .from(userProfilesTable)
              .where(eq(userProfilesTable.referralCode, refCode))
              .limit(1);
            if (conflict.length === 0) break;
            refCode = generateReferralCode();
            codeAttempts++;
          }

          await tx
            .insert(userProfilesTable)
            .values({
              userId: req.userId,
              referralCode: refCode,
              totalPoints: 0,
              lifetimePoints: 0,
              loyaltyTier: "silver",
            })
            .onConflictDoNothing();

          const [updated] = await tx
            .update(userProfilesTable)
            .set({
              totalPoints: sql`${userProfilesTable.totalPoints} + ${earnedPoints}`,
              lifetimePoints: sql`${userProfilesTable.lifetimePoints} + ${earnedPoints}`,
              updatedAt: new Date(),
            })
            .where(eq(userProfilesTable.userId, req.userId))
            .returning({ totalPoints: userProfilesTable.totalPoints });

          await tx
            .update(userProfilesTable)
            .set({ loyaltyTier: computeTier(updated?.totalPoints ?? 0) })
            .where(eq(userProfilesTable.userId, req.userId));

          await tx.insert(rewardPointsLogTable).values({
            userId: req.userId,
            points: earnedPoints,
            type: "earned",
            description: "Points earned on order",
            orderId: order.id,
          });
        }

        const prefs = await tx
          .select({ orderUpdates: notificationPreferencesTable.orderUpdates })
          .from(notificationPreferencesTable)
          .where(eq(notificationPreferencesTable.userId, req.userId))
          .limit(1);
        const wantsOrderUpdates = prefs.length === 0 || prefs[0].orderUpdates;
        if (wantsOrderUpdates) {
          const firstItem = resolvedItems[0];
          await tx.insert(notificationsTable).values({
            userId: req.userId,
            type: "order_confirmed",
            title: "Order confirmed",
            body: `Your order for ${firstItem.name}${resolvedItems.length > 1 ? ` and ${resolvedItems.length - 1} more item(s)` : ""} has been confirmed.`,
            metadata: { orderId: order.id },
          });
        }

        return order.id;
      });
    } catch (txErr: any) {
      if (txErr.status === 400) {
        res.status(400).json({ error: txErr.message });
        return;
      }
      throw txErr;
    }

    res.json({ orderId });
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

const requireAdminKey = (req: any, res: any, next: any) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

// POST and PATCH /orders/:orderId/status — admin only: advance order status
async function handleUpdateOrderStatus(req: any, res: any): Promise<void> {
  const { orderId } = req.params;
  const { status, note } = req.body;

  const validStatuses = ["confirmed", "processing", "dispatched", "out_for_delivery", "delivered", "cancelled"];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  try {
    try {
      await db.transaction(async (tx) => {
        const [order] = await tx
          .select({
            id: ordersTable.id,
            userId: ordersTable.userId,
            status: ordersTable.status,
            statusHistory: ordersTable.statusHistory,
            items: ordersTable.items,
          })
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId))
          .for("update")
          .limit(1);

        if (!order) {
          throw Object.assign(new Error("Order not found"), { status: 404 });
        }

        if (order.status === "cancelled") {
          throw Object.assign(new Error("Cannot update status of a cancelled order"), { status: 400 });
        }

        const history = Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [];
        const newEntry: { status: string; timestamp: string; note?: string } = {
          status,
          timestamp: new Date().toISOString(),
        };
        if (note) newEntry.note = String(note).trim();
        history.push(newEntry);

        const updates: Record<string, any> = {
          status,
          statusHistory: history,
          updatedAt: new Date(),
        };

        if (status === "delivered") {
          updates.deliveredAt = new Date();
        }

        if (status === "cancelled") {
          const cancelNote = note ? String(note).trim() : "Cancelled by admin";
          updates.cancelReason = cancelNote;

          const items = order.items as Array<{ productId: string; quantity: number }>;
          for (const item of items) {
            const [beforeCancel] = await tx
              .select({ stock: productsTable.stock, vendorId: productsTable.vendorId })
              .from(productsTable)
              .where(eq(productsTable.id, item.productId))
              .limit(1);

            await tx
              .update(productsTable)
              .set({ stock: sql`${productsTable.stock} + ${item.quantity}` })
              .where(eq(productsTable.id, item.productId));

            await recordStockChange({
              tx,
              productId: item.productId,
              vendorId: beforeCancel?.vendorId ?? null,
              previousStock: beforeCancel?.stock ?? 0,
              newStock: (beforeCancel?.stock ?? 0) + item.quantity,
              source: "cancel",
              reason: cancelNote,
              orderId: order.id,
            });
          }
        }

        await tx
          .update(ordersTable)
          .set(updates)
          .where(eq(ordersTable.id, orderId));

        const notifType =
          status === "dispatched" ? "order_shipped" as const :
          status === "delivered" ? "order_delivered" as const :
          status === "cancelled" ? "order_cancelled" as const :
          null;

        if (notifType) {
          const orderItems = order.items as Array<{ name: string }>;
          await insertOrderStatusNotification({
            tx,
            userId: order.userId,
            type: notifType,
            orderId: order.id,
            itemName: orderItems?.[0]?.name ?? "your order",
            extraItemCount: orderItems.length > 1 ? orderItems.length - 1 : 0,
          });
        }
      });
    } catch (txErr: any) {
      if (txErr.status === 404) {
        res.status(404).json({ error: txErr.message });
        return;
      }
      if (txErr.status === 400) {
        res.status(400).json({ error: txErr.message });
        return;
      }
      throw txErr;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update order status");
    res.status(500).json({ error: "Failed to update order status" });
  }
}

router.post("/orders/:orderId/status", requireAdminKey, handleUpdateOrderStatus);
router.patch("/orders/:orderId/status", requireAdminKey, handleUpdateOrderStatus);

// POST /orders/:orderId/cancel
router.post("/orders/:orderId/cancel", requireAuth, async (req: any, res: any): Promise<void> => {
  const { orderId } = req.params;
  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    res.status(400).json({ error: "A cancellation reason is required" });
    return;
  }

  try {
    try {
      await db.transaction(async (tx) => {
        const [order] = await tx
          .select({
            id: ordersTable.id,
            userId: ordersTable.userId,
            status: ordersTable.status,
            statusHistory: ordersTable.statusHistory,
            items: ordersTable.items,
          })
          .from(ordersTable)
          .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.userId)))
          .for("update")
          .limit(1);

        if (!order) {
          throw Object.assign(new Error("Order not found"), { status: 404 });
        }

        if (order.status === "cancelled") {
          throw Object.assign(new Error("Order is already cancelled"), { status: 400 });
        }

        const cancellableStatuses = ["confirmed", "processing"];
        if (!cancellableStatuses.includes(order.status)) {
          throw Object.assign(
            new Error(`Cannot cancel an order with status "${order.status}". Only confirmed or processing orders can be cancelled.`),
            { status: 400 }
          );
        }

        const existingHistory = Array.isArray(order.statusHistory)
          ? ((order as any).statusHistory as any[])
          : [];
        existingHistory.push({ status: "cancelled", timestamp: new Date().toISOString(), note: String(reason).trim() });

        await tx
          .update(ordersTable)
          .set({
            status: "cancelled",
            statusHistory: existingHistory,
            cancelReason: String(reason).trim(),
            updatedAt: new Date(),
          })
          .where(eq(ordersTable.id, orderId));

        const items = order.items as Array<{ productId: string; quantity: number; name: string }>;
        for (const item of items) {
          await tx
            .update(productsTable)
            .set({ stock: sql`${productsTable.stock} + ${item.quantity}` })
            .where(eq(productsTable.id, item.productId));
        }

        await insertOrderStatusNotification({
          tx,
          userId: req.userId,
          type: "order_cancelled",
          orderId: order.id,
          itemName: items?.[0]?.name ?? "your order",
          extraItemCount: items.length > 1 ? items.length - 1 : 0,
        });
      });
    } catch (txErr: any) {
      if (txErr.status === 404) {
        res.status(404).json({ error: txErr.message });
        return;
      }
      if (txErr.status === 400) {
        res.status(400).json({ error: txErr.message });
        return;
      }
      throw txErr;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to cancel order");
    res.status(500).json({ error: "Failed to cancel order" });
  }
});

// Keep backward-compat PATCH alias
router.patch("/orders/:orderId/cancel", requireAuth, async (req: any, res: any): Promise<void> => {
  const { orderId } = req.params;
  const reason = req.body?.reason ?? "Cancelled by customer";

  try {
    try {
      await db.transaction(async (tx) => {
        const [order] = await tx
          .select({
            id: ordersTable.id,
            userId: ordersTable.userId,
            status: ordersTable.status,
            statusHistory: ordersTable.statusHistory,
            items: ordersTable.items,
          })
          .from(ordersTable)
          .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.userId)))
          .for("update")
          .limit(1);

        if (!order) {
          throw Object.assign(new Error("Order not found"), { status: 404 });
        }

        if (order.status === "cancelled") {
          throw Object.assign(new Error("Order is already cancelled"), { status: 400 });
        }

        const cancellableStatuses = ["confirmed", "processing"];
        if (!cancellableStatuses.includes(order.status)) {
          throw Object.assign(
            new Error(`Cannot cancel an order with status "${order.status}"`),
            { status: 400 }
          );
        }

        const existingHistory = Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [];
        existingHistory.push({ status: "cancelled", timestamp: new Date().toISOString(), note: String(reason).trim() });

        await tx
          .update(ordersTable)
          .set({
            status: "cancelled",
            statusHistory: existingHistory,
            cancelReason: String(reason).trim(),
            updatedAt: new Date(),
          })
          .where(eq(ordersTable.id, orderId));

        const items = order.items as Array<{ productId: string; quantity: number; name: string }>;
        for (const item of items) {
          await tx
            .update(productsTable)
            .set({ stock: sql`${productsTable.stock} + ${item.quantity}` })
            .where(eq(productsTable.id, item.productId));
        }

        await insertOrderStatusNotification({
          tx,
          userId: req.userId,
          type: "order_cancelled",
          orderId: order.id,
          itemName: items?.[0]?.name ?? "your order",
          extraItemCount: items.length > 1 ? items.length - 1 : 0,
        });
      });
    } catch (txErr: any) {
      if (txErr.status === 404) {
        res.status(404).json({ error: txErr.message });
        return;
      }
      if (txErr.status === 400) {
        res.status(400).json({ error: txErr.message });
        return;
      }
      throw txErr;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to cancel order");
    res.status(500).json({ error: "Failed to cancel order" });
  }
});

// POST /orders/:orderId/return
router.post("/orders/:orderId/return", requireAuth, async (req: any, res: any): Promise<void> => {
  const { orderId } = req.params;
  const { reason, itemNotes } = req.body;

  if (!reason || !String(reason).trim()) {
    res.status(400).json({ error: "A return reason is required" });
    return;
  }

  try {
    try {
      await db.transaction(async (tx) => {
        const [order] = await tx
          .select({
            id: ordersTable.id,
            userId: ordersTable.userId,
            status: ordersTable.status,
            deliveredAt: ordersTable.deliveredAt,
            updatedAt: ordersTable.updatedAt,
          })
          .from(ordersTable)
          .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.userId)))
          .for("update")
          .limit(1);

        if (!order) {
          throw Object.assign(new Error("Order not found"), { status: 404 });
        }

        if (order.status !== "delivered") {
          throw Object.assign(
            new Error(`Returns are only allowed for delivered orders. Current status: "${order.status}".`),
            { status: 400 }
          );
        }

        // Use deliveredAt if available; fall back to updatedAt (last status change proxy)
        const deliveryTimestamp = order.deliveredAt
          ? new Date(order.deliveredAt)
          : new Date(order.updatedAt);

        const daysSinceDelivery = (Date.now() - deliveryTimestamp.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceDelivery > 7) {
          throw Object.assign(
            new Error("Return window has closed. Returns are only accepted within 7 days of delivery."),
            { status: 400 }
          );
        }

        // Combine reason + optional item-level notes into returnReason JSON
        const returnData = {
          reason: String(reason).trim(),
          itemNotes: itemNotes && typeof itemNotes === "object" ? itemNotes : undefined,
        };

        await tx
          .update(ordersTable)
          .set({
            status: "return_requested",
            returnReason: JSON.stringify(returnData),
          })
          .where(eq(ordersTable.id, orderId));
      });
    } catch (txErr: any) {
      if (txErr.status === 404) {
        res.status(404).json({ error: txErr.message });
        return;
      }
      if (txErr.status === 400) {
        res.status(400).json({ error: txErr.message });
        return;
      }
      throw txErr;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to request return");
    res.status(500).json({ error: "Failed to request return" });
  }
});

// POST /orders/:orderId/refund
router.post("/orders/:orderId/refund", requireAuth, async (req: any, res: any): Promise<void> => {
  const { orderId } = req.params;
  const { method } = req.body;

  if (!method || !["original_payment", "store_credit"].includes(method)) {
    res.status(400).json({ error: "Refund method must be 'original_payment' or 'store_credit'" });
    return;
  }

  try {
    try {
      await db.transaction(async (tx) => {
        const [order] = await tx
          .select({
            id: ordersTable.id,
            userId: ordersTable.userId,
            status: ordersTable.status,
            refundStatus: ordersTable.refundStatus,
          })
          .from(ordersTable)
          .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.userId)))
          .for("update")
          .limit(1);

        if (!order) {
          throw Object.assign(new Error("Order not found"), { status: 404 });
        }

        const refundableStatuses = ["cancelled", "return_requested"];
        if (!refundableStatuses.includes(order.status)) {
          throw Object.assign(
            new Error(`Refunds can only be requested for cancelled or return-requested orders. Current status: "${order.status}".`),
            { status: 400 }
          );
        }

        if (order.refundStatus) {
          throw Object.assign(
            new Error(`A refund has already been ${order.refundStatus === "pending" ? "requested" : order.refundStatus} for this order.`),
            { status: 400 }
          );
        }

        await tx
          .update(ordersTable)
          .set({
            refundStatus: "pending",
            refundMethod: method,
            updatedAt: new Date(),
          })
          .where(eq(ordersTable.id, orderId));
      });
    } catch (txErr: any) {
      if (txErr.status === 404) {
        res.status(404).json({ error: txErr.message });
        return;
      }
      if (txErr.status === 400) {
        res.status(400).json({ error: txErr.message });
        return;
      }
      throw txErr;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to request refund");
    res.status(500).json({ error: "Failed to request refund" });
  }
});

export default router;
