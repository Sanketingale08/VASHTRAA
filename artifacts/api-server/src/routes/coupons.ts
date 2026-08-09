import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { requireAdminKey } from "../middlewares/isAdmin";
import { db } from "@workspace/db";
import {
  couponsTable,
  couponRedemptionsTable,
  notificationsTable,
  notificationPreferencesTable,
  wishlistsTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { sendCouponExpiryEmail } from "../lib/transactionalEmail";

const router = Router();

async function maybeNotifyCouponExpiry(
  userId: string,
  coupon: { id: string; code: string; expiresAt: Date | null }
): Promise<void> {
  if (!coupon.expiresAt) return;

  const hoursLeft = (new Date(coupon.expiresAt).getTime() - Date.now()) / 3600000;
  if (hoursLeft <= 0 || hoursLeft > 72) return;

  const offerPrefs = await db
    .select({
      offerAlerts: notificationPreferencesTable.offerAlerts,
      emailOfferUpdates: notificationPreferencesTable.emailOfferUpdates,
    })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);
  const wantsOffers = offerPrefs.length === 0 || offerPrefs[0].offerAlerts;
  const wantsEmailOffers = offerPrefs.length === 0 || offerPrefs[0].emailOfferUpdates;

  const existingExpiry = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.type, "coupon_expiry"),
        sql`${notificationsTable.metadata}->>'couponId' = ${coupon.id}`
      )
    )
    .limit(1);
  if (existingExpiry.length > 0) return;

  const daysLeft = Math.max(1, Math.ceil(hoursLeft / 24));

  // In-app notification — gated by offerAlerts preference
  if (wantsOffers) {
    await db.insert(notificationsTable).values({
      userId,
      type: "coupon_expiry",
      title: `Coupon "${coupon.code}" expiring soon`,
      body: `Your coupon expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Use it before it's gone!`,
      metadata: { couponId: coupon.id, couponCode: coupon.code },
    });
  }

  // Email — gated by emailOfferUpdates preference
  if (wantsEmailOffers) {
    sendCouponExpiryEmail({ userId, couponCode: coupon.code, daysLeft }).catch(() => {});
  }
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

// GET /admin/coupons — list all coupons (admin)
router.get("/admin/coupons", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(couponsTable)
      .orderBy(desc(couponsTable.createdAt));

    res.json({
      coupons: rows.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        value: c.value,
        description: c.description,
        active: c.active,
        expiresAt: c.expiresAt,
        maxUses: c.maxUses ?? null,
        usedCount: c.usedCount,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list coupons");
    res.status(500).json({ error: "Failed to list coupons" });
  }
});

// POST /admin/coupons — create a new coupon (admin)
router.post("/admin/coupons", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { code, type, value, description, active, expiresAt, maxUses, isFlashSale } = req.body;

  if (!code || typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "code is required" });
    return;
  }
  if (!type || !["percent", "flat"].includes(type)) {
    res.status(400).json({ error: "type must be 'percent' or 'flat'" });
    return;
  }
  if (typeof value !== "number" || value <= 0) {
    res.status(400).json({ error: "value must be a positive number" });
    return;
  }
  if (maxUses !== undefined && maxUses !== null) {
    if (!Number.isInteger(maxUses) || maxUses < 1) {
      res.status(400).json({ error: "maxUses must be a positive integer" });
      return;
    }
  }

  try {
    const [created] = await db
      .insert(couponsTable)
      .values({
        code: code.trim().toUpperCase(),
        type,
        value,
        description: description ?? "",
        active: active !== false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxUses: maxUses ?? null,
      })
      .returning();

    if (isFlashSale === true && created.active) {
      try {
        const interested = await db
          .selectDistinct({ userId: wishlistsTable.userId })
          .from(wishlistsTable);
        const discountLabel = type === "percent" ? `${value}% off` : `₹${value} off`;
        if (interested.length > 0) {
          await db.insert(notificationsTable).values(
            interested.map((row) => ({
              userId: row.userId,
              type: "flash_sale" as const,
              title: "Flash sale is live!",
              body: `${discountLabel} with code ${created.code}${created.expiresAt ? " — limited time only." : "."}`,
              metadata: { couponId: created.id, code: created.code },
            }))
          );
        }
      } catch (notifyErr) {
        req.log.error({ notifyErr }, "Failed to send flash sale notifications");
      }
    }

    res.status(201).json({
      coupon: {
        id: created.id,
        code: created.code,
        type: created.type,
        value: created.value,
        description: created.description,
        active: created.active,
        expiresAt: created.expiresAt,
        maxUses: created.maxUses ?? null,
        usedCount: created.usedCount,
        createdAt: created.createdAt,
      },
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A coupon with that code already exists" });
      return;
    }
    req.log.error({ err }, "Failed to create coupon");
    res.status(500).json({ error: "Failed to create coupon" });
  }
});

// PUT /admin/coupons/:id — update an existing coupon (admin)
router.put("/admin/coupons/:id", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { code, type, value, description, active, expiresAt, maxUses } = req.body;

  const existing = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.id, id))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Coupon not found" });
    return;
  }

  if (type !== undefined && !["percent", "flat"].includes(type)) {
    res.status(400).json({ error: "type must be 'percent' or 'flat'" });
    return;
  }
  if (value !== undefined && (typeof value !== "number" || value <= 0)) {
    res.status(400).json({ error: "value must be a positive number" });
    return;
  }
  if (maxUses !== undefined && maxUses !== null) {
    if (!Number.isInteger(maxUses) || maxUses < 1) {
      res.status(400).json({ error: "maxUses must be a positive integer" });
      return;
    }
  }

  const patch: Record<string, any> = {};
  if (code !== undefined) patch.code = code.trim().toUpperCase();
  if (type !== undefined) patch.type = type;
  if (value !== undefined) patch.value = value;
  if (description !== undefined) patch.description = description;
  if (active !== undefined) patch.active = active;
  if (expiresAt !== undefined) patch.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (maxUses !== undefined) patch.maxUses = maxUses;

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No fields provided to update" });
    return;
  }

  try {
    const [updated] = await db
      .update(couponsTable)
      .set(patch)
      .where(eq(couponsTable.id, id))
      .returning();

    res.json({
      coupon: {
        id: updated.id,
        code: updated.code,
        type: updated.type,
        value: updated.value,
        description: updated.description,
        active: updated.active,
        expiresAt: updated.expiresAt,
        maxUses: updated.maxUses ?? null,
        usedCount: updated.usedCount,
        createdAt: updated.createdAt,
      },
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A coupon with that code already exists" });
      return;
    }
    req.log.error({ err }, "Failed to update coupon");
    res.status(500).json({ error: "Failed to update coupon" });
  }
});

// DELETE /admin/coupons/:id — deactivate a coupon (admin)
router.delete("/admin/coupons/:id", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;

  try {
    const rows = await db
      .select({ id: couponsTable.id })
      .from(couponsTable)
      .where(eq(couponsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }

    await db
      .update(couponsTable)
      .set({ active: false })
      .where(eq(couponsTable.id, id));

    res.json({ success: true, message: "Coupon deactivated" });
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate coupon");
    res.status(500).json({ error: "Failed to deactivate coupon" });
  }
});

// ─── Shopper endpoints ────────────────────────────────────────────────────────

router.get("/coupons/validate", async (req: any, res: any): Promise<void> => {
  const raw = req.query.code;
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "Missing coupon code" });
    return;
  }

  const code = raw.trim().toUpperCase();

  try {
    const rows = await db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.code, code))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Invalid coupon code" });
      return;
    }

    const coupon = rows[0];

    if (!coupon.active) {
      res.status(400).json({ error: "This coupon is no longer active" });
      return;
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      res.status(400).json({ error: "This coupon has expired" });
      return;
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ error: "This coupon has reached its usage limit" });
      return;
    }

    const auth = getAuth(req);
    const userId: string | undefined = (auth?.sessionClaims as any)?.userId || auth?.userId;
    if (userId) {
      maybeNotifyCouponExpiry(userId, {
        id: coupon.id,
        code: coupon.code,
        expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
      }).catch((err) => req.log.error({ err }, "Failed to insert coupon_expiry notification"));
    }

    res.json({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      description: coupon.description,
      maxUses: coupon.maxUses ?? null,
      usedCount: coupon.usedCount,
      expiresAt: coupon.expiresAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to validate coupon");
    res.status(500).json({ error: "Failed to validate coupon" });
  }
});

router.get("/coupons/available", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.active, true));

    const now = new Date();
    const available = rows.filter(
      (c) =>
        (!c.expiresAt || new Date(c.expiresAt) > now) &&
        (c.maxUses === null || c.usedCount < c.maxUses),
    );

    res.json({
      coupons: available.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        value: c.value,
        description: c.description,
        expiresAt: c.expiresAt,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch available coupons");
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

router.get("/coupons/used", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const rows = await db
      .select({
        redemptionId: couponRedemptionsTable.id,
        couponCode: couponsTable.code,
        description: couponsTable.description,
        type: couponsTable.type,
        value: couponsTable.value,
        orderId: couponRedemptionsTable.orderId,
        redeemedAt: couponRedemptionsTable.redeemedAt,
      })
      .from(couponRedemptionsTable)
      .innerJoin(couponsTable, eq(couponRedemptionsTable.couponId, couponsTable.id))
      .where(eq(couponRedemptionsTable.userId, req.userId))
      .orderBy(desc(couponRedemptionsTable.redeemedAt));

    res.json({ redemptions: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch used coupons");
    res.status(500).json({ error: "Failed to fetch used coupons" });
  }
});

router.get("/coupons/expired", async (req: any, res: any): Promise<void> => {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.active, true));

    const expired = rows.filter(
      (c) => c.expiresAt && new Date(c.expiresAt) <= now,
    );

    res.json({
      coupons: expired.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        value: c.value,
        description: c.description,
        expiresAt: c.expiresAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch expired coupons");
    res.status(500).json({ error: "Failed to fetch expired coupons" });
  }
});

export default router;
