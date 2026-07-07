import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  ordersTable, cartItemsTable, productsTable, couponsTable,
  couponRedemptionsTable, userProfilesTable, rewardPointsLogTable,
  notificationsTable, notificationPreferencesTable,
} from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";

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
    if (!["upi", "credit_card", "debit_card", "net_banking", "wallet", "cod"].includes(paymentMethod)) {
      res.status(400).json({ error: "Invalid payment method" });
      return;
    }

    const productIds: string[] = clientItems.map((i: any) => i.productId);

    const normalizedCoupon = couponCode ? String(couponCode).trim().toUpperCase() : null;
    const coupon = normalizedCoupon ? await lookupCoupon(normalizedCoupon) : null;

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

          // Lazy coupon-expiry notification: if coupon expires within 72h, warn once per user+coupon
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
          })
          .returning({ id: ordersTable.id });

        for (const item of resolvedItems) {
          await tx
            .update(productsTable)
            .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
            .where(eq(productsTable.id, item.productId));
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

        // Award loyalty points: 1 point per ₹10 of subtotal
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

          // Atomic SQL increment — no read-then-write race
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

        // Insert "Order confirmed" notification (respects preferences)
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

export default router;
