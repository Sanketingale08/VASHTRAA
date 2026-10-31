import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { requireAdminKey } from "../middlewares/isAdmin";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { db, mongoCoupons, mongoNotifications, mongoNotificationPreferences } from "@workspace/db";
import {
  couponsTable,
  couponRedemptionsTable,
  notificationsTable,
  notificationPreferencesTable,
  wishlistsTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { sendCouponExpiryEmail } from "../lib/transactionalEmail";
import { couponValidateLimiter } from "../middlewares/rateLimiter";
import { emitCouponEvent } from "../lib/socket";
import { validateAndCalculateCoupon } from "../lib/couponValidation";

const router = Router();


async function maybeNotifyCouponExpiry(
  userId: string,
  coupon: { id: string; code: string; expiresAt: Date | null }
): Promise<void> {
  try {
    if (!coupon.expiresAt) return;

    const hoursLeft = (new Date(coupon.expiresAt).getTime() - Date.now()) / 3600000;
    if (hoursLeft <= 0 || hoursLeft > 72) return;

    const prefs = await mongoNotificationPreferences.findByUserId(userId);
    const wantsOffers = prefs.offerAlerts;
    const wantsEmailOffers = prefs.emailOfferUpdates;

    // Check if already notified
    try {
      if (typeof mongoNotifications !== "undefined" && mongoNotifications?.findMany) {
        const existing = await mongoNotifications.findMany({
          userId,
          type: "coupon_expiry",
          "metadata.couponId": coupon.id,
        });
        if (existing.length > 0) return;
      }
    } catch {}

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
      .limit(1)
      .catch(() => []);
    if (existingExpiry.length > 0) return;

    const daysLeft = Math.max(1, Math.ceil(hoursLeft / 24));

    // In-app notification — gated by offerAlerts preference
    if (wantsOffers) {
      const title = `Coupon "${coupon.code}" expiring soon`;
      const body = `Your coupon expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Use it before it's gone!`;
      const metadata = { couponId: coupon.id, couponCode: coupon.code };

      try {
        if (typeof mongoNotifications !== "undefined" && mongoNotifications?.create) {
          await mongoNotifications.create({
            userId,
            type: "coupon_expiry",
            title,
            body,
            read: false,
            isRead: false,
            metadata,
            createdAt: new Date(),
          });
        }
      } catch {}

      try {
        await db
          .insert(notificationsTable)
          .values({
            userId,
            type: "coupon_expiry",
            title,
            body,
            metadata,
          })
          .catch(() => {});
      } catch {}
    }

    // Email — gated by emailOfferUpdates preference
    if (wantsEmailOffers) {
      sendCouponExpiryEmail({ userId, couponCode: coupon.code, daysLeft }).catch(() => {});
    }
  } catch {}
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

// GET /admin/coupons — list all coupons (admin)
router.get("/admin/coupons", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    let rows: any[] = [];
    try {
      rows = await mongoCoupons.findMany({}, { sort: { createdAt: -1 } });
    } catch {
      rows = await db
        .select()
        .from(couponsTable)
        .orderBy(desc(couponsTable.createdAt))
        .catch(() => []);
    }

    res.json({
      coupons: rows.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        value: c.value,
        description: c.description,
        offerDisplayText: c.offerDisplayText ?? null,
        minimumOrderValue: c.minimumOrderValue ? Number(c.minimumOrderValue) : 0,
        maxDiscountAmount: c.maxDiscountAmount != null ? Number(c.maxDiscountAmount) : null,
        eligibleCategories: c.eligibleCategories ?? null,
        firstOrderOnly: Boolean(c.firstOrderOnly),
        perCustomerLimit: c.perCustomerLimit != null ? Number(c.perCustomerLimit) : null,
        startDate: c.startDate ?? null,
        active: c.active,
        expiresAt: c.expiresAt,
        maxUses: c.maxUses ?? null,
        usedCount: c.usedCount ?? 0,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to list coupons");
    res.json({ coupons: [] });
  }
});

// POST /admin/coupons — create a new coupon (admin)
router.post("/admin/coupons", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const {
    code,
    type,
    value,
    description,
    offerDisplayText,
    minimumOrderValue,
    maxDiscountAmount,
    eligibleCategories,
    firstOrderOnly,
    perCustomerLimit,
    startDate,
    active,
    expiresAt,
    maxUses,
    isFlashSale,
  } = req.body;

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

  if (minimumOrderValue !== undefined && minimumOrderValue !== null) {
    if (typeof minimumOrderValue !== "number" || minimumOrderValue < 0) {
      res.status(400).json({ error: "minimumOrderValue must be a non-negative number" });
      return;
    }
  }

  if (maxDiscountAmount !== undefined && maxDiscountAmount !== null) {
    if (typeof maxDiscountAmount !== "number" || maxDiscountAmount <= 0) {
      res.status(400).json({ error: "maxDiscountAmount must be a positive number" });
      return;
    }
  }

  if (perCustomerLimit !== undefined && perCustomerLimit !== null) {
    if (!Number.isInteger(perCustomerLimit) || perCustomerLimit < 1) {
      res.status(400).json({ error: "perCustomerLimit must be a positive integer" });
      return;
    }
  }

  let normalizedOfferText: string | null = null;
  if (offerDisplayText !== undefined && offerDisplayText !== null) {
    if (typeof offerDisplayText !== "string") {
      res.status(400).json({ error: "offerDisplayText must be a string" });
      return;
    }
    const trimmed = offerDisplayText.trim();
    if (trimmed.length > 120) {
      res.status(400).json({ error: "Offer display text cannot exceed 120 characters" });
      return;
    }
    normalizedOfferText = trimmed.length > 0 ? trimmed : null;
  }

  let normalizedCategories: string[] | null = null;
  if (eligibleCategories !== undefined && eligibleCategories !== null) {
    if (Array.isArray(eligibleCategories)) {
      normalizedCategories = eligibleCategories.map((c: any) => String(c).trim()).filter(Boolean);
      if (normalizedCategories.length === 0) normalizedCategories = null;
    } else if (typeof eligibleCategories === "string" && eligibleCategories.trim()) {
      normalizedCategories = eligibleCategories.split(",").map((c: string) => c.trim()).filter(Boolean);
      if (normalizedCategories.length === 0) normalizedCategories = null;
    }
  }

  const cleanMov = minimumOrderValue != null ? Math.max(0, Number(minimumOrderValue)) : 0;
  const cleanMaxDiscount = maxDiscountAmount != null ? Math.max(0, Number(maxDiscountAmount)) : null;
  const cleanPerCustomer = perCustomerLimit != null ? Math.max(1, parseInt(perCustomerLimit, 10)) : null;
  const cleanStartDate = startDate ? new Date(startDate) : null;
  const cleanFirstOrder = Boolean(firstOrderOnly);

  try {
    let created: any;
    try {
      created = await mongoCoupons.insert({
        code: code.trim().toUpperCase(),
        type,
        value,
        description: description ?? "",
        offerDisplayText: normalizedOfferText,
        minimumOrderValue: cleanMov,
        maxDiscountAmount: cleanMaxDiscount,
        eligibleCategories: normalizedCategories,
        firstOrderOnly: cleanFirstOrder,
        perCustomerLimit: cleanPerCustomer,
        startDate: cleanStartDate,
        active: active !== false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxUses: maxUses ?? null,
        usedCount: 0,
      });
    } catch {
      const [c] = await db
        .insert(couponsTable)
        .values({
          code: code.trim().toUpperCase(),
          type,
          value,
          description: description ?? "",
          offerDisplayText: normalizedOfferText,
          minimumOrderValue: cleanMov,
          maxDiscountAmount: cleanMaxDiscount,
          eligibleCategories: normalizedCategories ? normalizedCategories.join(",") : null,
          firstOrderOnly: cleanFirstOrder,
          perCustomerLimit: cleanPerCustomer,
          startDate: cleanStartDate,
          active: active !== false,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          maxUses: maxUses ?? null,
        })
        .returning();
      created = c;
    }

    if (isFlashSale === true && created.active) {
      try {
        const interested = await db
          .selectDistinct({ userId: wishlistsTable.userId })
          .from(wishlistsTable)
          .catch(() => []);
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
          ).catch(() => {});

          try {
            const { sendCouponAvailableEmail } = await import("../lib/transactionalEmail");
            for (const row of interested.slice(0, 50)) {
              if (row.userId) {
                void sendCouponAvailableEmail({
                  userId: row.userId,
                  couponCode: created.code,
                  discountText: discountLabel,
                  expiresAt: created.expiresAt ? new Date(created.expiresAt).toLocaleDateString("en-IN") : undefined,
                });
              }
            }
          } catch {}
        }
      } catch (notifyErr) {
        req.log.error({ notifyErr }, "Failed to send flash sale notifications");
      }
    }

    writeAuditLog({ action: "coupon_created", module: "Coupons", details: { couponId: created.id, code: created.code, type: created.type, value: created.value, offerDisplayText: created.offerDisplayText }, ipAddress: getIp(req) }).catch(() => {});
    emitCouponEvent("coupon:created", created);
    res.status(201).json({
      coupon: {
        id: created.id,
        code: created.code,
        type: created.type,
        value: created.value,
        description: created.description,
        offerDisplayText: created.offerDisplayText ?? null,
        minimumOrderValue: created.minimumOrderValue ? Number(created.minimumOrderValue) : 0,
        maxDiscountAmount: created.maxDiscountAmount != null ? Number(created.maxDiscountAmount) : null,
        eligibleCategories: created.eligibleCategories ?? null,
        firstOrderOnly: Boolean(created.firstOrderOnly),
        perCustomerLimit: created.perCustomerLimit != null ? Number(created.perCustomerLimit) : null,
        startDate: created.startDate ?? null,
        active: created.active,
        expiresAt: created.expiresAt,
        maxUses: created.maxUses ?? null,
        usedCount: created.usedCount ?? 0,
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
  const {
    code,
    type,
    value,
    description,
    offerDisplayText,
    minimumOrderValue,
    maxDiscountAmount,
    eligibleCategories,
    firstOrderOnly,
    perCustomerLimit,
    startDate,
    active,
    expiresAt,
    maxUses,
  } = req.body;

  let existing: any = null;
  try {
    existing = await mongoCoupons.findById(id);
  } catch {
    const rows = await db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.id, id))
      .limit(1)
      .catch(() => []);
    existing = rows[0] || null;
  }

  if (!existing) {
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

  if (minimumOrderValue !== undefined && minimumOrderValue !== null) {
    if (typeof minimumOrderValue !== "number" || minimumOrderValue < 0) {
      res.status(400).json({ error: "minimumOrderValue must be a non-negative number" });
      return;
    }
  }

  if (maxDiscountAmount !== undefined && maxDiscountAmount !== null) {
    if (typeof maxDiscountAmount !== "number" || maxDiscountAmount <= 0) {
      res.status(400).json({ error: "maxDiscountAmount must be a positive number" });
      return;
    }
  }

  if (perCustomerLimit !== undefined && perCustomerLimit !== null) {
    if (!Number.isInteger(perCustomerLimit) || perCustomerLimit < 1) {
      res.status(400).json({ error: "perCustomerLimit must be a positive integer" });
      return;
    }
  }

  const patch: Record<string, any> = {};
  if (code !== undefined) patch.code = code.trim().toUpperCase();
  if (type !== undefined) patch.type = type;
  if (value !== undefined) patch.value = value;
  if (description !== undefined) patch.description = description;
  if (minimumOrderValue !== undefined) patch.minimumOrderValue = minimumOrderValue != null ? Math.max(0, Number(minimumOrderValue)) : 0;
  if (maxDiscountAmount !== undefined) patch.maxDiscountAmount = maxDiscountAmount != null ? Math.max(0, Number(maxDiscountAmount)) : null;
  if (firstOrderOnly !== undefined) patch.firstOrderOnly = Boolean(firstOrderOnly);
  if (perCustomerLimit !== undefined) patch.perCustomerLimit = perCustomerLimit != null ? Math.max(1, parseInt(perCustomerLimit, 10)) : null;
  if (startDate !== undefined) patch.startDate = startDate ? new Date(startDate) : null;

  if (eligibleCategories !== undefined) {
    if (Array.isArray(eligibleCategories)) {
      const clean = eligibleCategories.map((c: any) => String(c).trim()).filter(Boolean);
      patch.eligibleCategories = clean.length > 0 ? clean : null;
    } else if (typeof eligibleCategories === "string" && eligibleCategories.trim()) {
      const clean = eligibleCategories.split(",").map((c: string) => c.trim()).filter(Boolean);
      patch.eligibleCategories = clean.length > 0 ? clean : null;
    } else {
      patch.eligibleCategories = null;
    }
  }

  if (offerDisplayText !== undefined) {
    if (offerDisplayText !== null && typeof offerDisplayText !== "string") {
      res.status(400).json({ error: "offerDisplayText must be a string" });
      return;
    }
    if (typeof offerDisplayText === "string") {
      const trimmed = offerDisplayText.trim();
      if (trimmed.length > 120) {
        res.status(400).json({ error: "Offer display text cannot exceed 120 characters" });
        return;
      }
      patch.offerDisplayText = trimmed.length > 0 ? trimmed : null;
    } else {
      patch.offerDisplayText = null;
    }
  }
  if (active !== undefined) patch.active = active;
  if (expiresAt !== undefined) patch.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (maxUses !== undefined) patch.maxUses = maxUses;

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No fields provided to update" });
    return;
  }

  try {
    let updated: any;
    try {
      updated = await mongoCoupons.update(id, patch);
    } catch {
      const sqlPatch: any = { ...patch };
      if (sqlPatch.eligibleCategories && Array.isArray(sqlPatch.eligibleCategories)) {
        sqlPatch.eligibleCategories = sqlPatch.eligibleCategories.join(",");
      }
      const [u] = await db
        .update(couponsTable)
        .set(sqlPatch)
        .where(eq(couponsTable.id, id))
        .returning();
      updated = u;
    }

    emitCouponEvent("coupon:updated", updated);
    res.json({
      coupon: {
        id: updated.id,
        code: updated.code,
        type: updated.type,
        value: updated.value,
        description: updated.description,
        offerDisplayText: updated.offerDisplayText ?? null,
        minimumOrderValue: updated.minimumOrderValue ? Number(updated.minimumOrderValue) : 0,
        maxDiscountAmount: updated.maxDiscountAmount != null ? Number(updated.maxDiscountAmount) : null,
        eligibleCategories: updated.eligibleCategories ?? null,
        firstOrderOnly: Boolean(updated.firstOrderOnly),
        perCustomerLimit: updated.perCustomerLimit != null ? Number(updated.perCustomerLimit) : null,
        startDate: updated.startDate ?? null,
        active: updated.active,
        expiresAt: updated.expiresAt,
        maxUses: updated.maxUses ?? null,
        usedCount: updated.usedCount ?? 0,
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
    let success = false;
    try {
      const existing = await mongoCoupons.findById(id);
      if (existing) {
        await mongoCoupons.update(id, { active: false });
        success = true;
      }
    } catch {
      // Fallback
    }

    if (!success) {
      const rows = await db
        .select({ id: couponsTable.id })
        .from(couponsTable)
        .where(eq(couponsTable.id, id))
        .limit(1)
        .catch(() => []);

      if (rows.length === 0) {
        res.status(404).json({ error: "Coupon not found" });
        return;
      }

      await db
        .update(couponsTable)
        .set({ active: false })
        .where(eq(couponsTable.id, id))
        .catch(() => {});
    }

    writeAuditLog({ action: "coupon_deactivated", module: "Coupons", details: { couponId: id }, ipAddress: getIp(req) }).catch(() => {});
    emitCouponEvent("coupon:expired", { id, active: false });
    res.json({ success: true, message: "Coupon deactivated" });
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate coupon");
    res.status(500).json({ error: "Failed to deactivate coupon" });
  }
});

// ─── Shopper endpoints ────────────────────────────────────────────────────────

router.get("/coupons/validate", couponValidateLimiter, async (req: any, res: any): Promise<void> => {
  const raw = req.query.code;
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "Missing coupon code" });
    return;
  }

  const code = raw.trim().toUpperCase();
  let userId: string | undefined = req.userId;
  try {
    const auth = getAuth(req);
    userId = (auth?.sessionClaims as any)?.userId || auth?.userId || req.userId;
  } catch {}

  const hasSubtotalParam = req.query.subtotal !== undefined || req.query.cartSubtotal !== undefined;
  const subtotalVal = Number(req.query.subtotal ?? req.query.cartSubtotal ?? 0);

  let items: any[] = [];
  if (req.query.items) {
    try {
      items = typeof req.query.items === "string" ? JSON.parse(req.query.items) : req.query.items;
    } catch {}
  }

  try {
    if (hasSubtotalParam || items.length > 0) {
      const result = await validateAndCalculateCoupon({
        code,
        userId,
        items,
        cartSubtotal: isNaN(subtotalVal) ? 0 : subtotalVal,
      });

      if (!result.valid) {
        res.status(400).json({
          error: result.error,
          valid: false,
          shortfall: result.shortfall,
          minimumOrderValue: result.minimumOrderValue,
        });
        return;
      }

      if (userId && result.coupon) {
        maybeNotifyCouponExpiry(userId, {
          id: result.coupon.id,
          code: result.coupon.code,
          expiresAt: result.coupon.expiresAt ? new Date(result.coupon.expiresAt) : null,
        }).catch(() => {});
      }

      res.json({
        code: result.coupon!.code,
        type: result.coupon!.type,
        value: result.coupon!.value,
        description: result.coupon!.description,
        offerDisplayText: result.coupon!.offerDisplayText ?? null,
        minimumOrderValue: result.coupon!.minimumOrderValue ?? 0,
        maxDiscountAmount: result.coupon!.maxDiscountAmount ?? null,
        eligibleCategories: result.coupon!.eligibleCategories ?? null,
        firstOrderOnly: Boolean(result.coupon!.firstOrderOnly),
        perCustomerLimit: result.coupon!.perCustomerLimit ?? null,
        startDate: result.coupon!.startDate ?? null,
        maxUses: result.coupon!.maxUses ?? null,
        usedCount: result.coupon!.usedCount ?? 0,
        expiresAt: result.coupon!.expiresAt,
        discount: result.discount,
        eligibleSubtotal: result.eligibleSubtotal,
        totalMerchandiseSubtotal: result.totalMerchandiseSubtotal,
        shortfall: result.shortfall,
        valid: true,
      });
      return;
    }

    let coupon: any = null;
    try {
      coupon = await mongoCoupons.findByCode(code);
    } catch {}

    if (!coupon) {
      const rows = await db
        .select()
        .from(couponsTable)
        .where(eq(couponsTable.code, code))
        .limit(1)
        .catch(() => []);
      coupon = rows[0] || null;
    }

    if (!coupon) {
      res.status(404).json({ error: "Invalid coupon code" });
      return;
    }

    if (!coupon.active) {
      res.status(400).json({ error: "This coupon is no longer active" });
      return;
    }

    if (coupon.startDate && new Date(coupon.startDate) > new Date()) {
      res.status(400).json({ error: "This coupon promotion has not started yet" });
      return;
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      res.status(400).json({ error: "This coupon has expired" });
      return;
    }

    if (coupon.maxUses !== null && coupon.maxUses !== undefined && (coupon.usedCount || 0) >= coupon.maxUses) {
      res.status(400).json({ error: "This coupon has reached its usage limit" });
      return;
    }

    if (userId) {
      maybeNotifyCouponExpiry(userId, {
        id: coupon.id,
        code: coupon.code,
        expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
      }).catch(() => {});
    }

    res.json({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      description: coupon.description,
      offerDisplayText: coupon.offerDisplayText ?? null,
      minimumOrderValue: coupon.minimumOrderValue ?? 0,
      maxDiscountAmount: coupon.maxDiscountAmount ?? null,
      eligibleCategories: coupon.eligibleCategories ?? null,
      firstOrderOnly: Boolean(coupon.firstOrderOnly),
      perCustomerLimit: coupon.perCustomerLimit ?? null,
      startDate: coupon.startDate ?? null,
      maxUses: coupon.maxUses ?? null,
      usedCount: coupon.usedCount ?? 0,
      expiresAt: coupon.expiresAt,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to validate coupon");
    res.status(500).json({ error: "Failed to validate coupon" });
  }
});

router.post("/coupons/validate", couponValidateLimiter, async (req: any, res: any): Promise<void> => {
  const { code, items, cartSubtotal, subtotal } = req.body || {};
  if (!code || typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "Missing coupon code" });
    return;
  }

  let userId: string | undefined = req.userId;
  try {
    const auth = getAuth(req);
    userId = (auth?.sessionClaims as any)?.userId || auth?.userId || req.userId;
  } catch {}

  const subtotalVal = Number(cartSubtotal ?? subtotal ?? 0);

  try {
    const result = await validateAndCalculateCoupon({
      code: code.trim().toUpperCase(),
      userId,
      items: Array.isArray(items) ? items : undefined,
      cartSubtotal: isNaN(subtotalVal) ? 0 : subtotalVal,
    });

    if (!result.valid) {
      res.status(400).json({
        error: result.error,
        valid: false,
        shortfall: result.shortfall,
        minimumOrderValue: result.minimumOrderValue,
      });
      return;
    }

    res.json({
      code: result.coupon!.code,
      type: result.coupon!.type,
      value: result.coupon!.value,
      description: result.coupon!.description,
      offerDisplayText: result.coupon!.offerDisplayText ?? null,
      minimumOrderValue: result.coupon!.minimumOrderValue ?? 0,
      maxDiscountAmount: result.coupon!.maxDiscountAmount ?? null,
      eligibleCategories: result.coupon!.eligibleCategories ?? null,
      firstOrderOnly: Boolean(result.coupon!.firstOrderOnly),
      perCustomerLimit: result.coupon!.perCustomerLimit ?? null,
      startDate: result.coupon!.startDate ?? null,
      maxUses: result.coupon!.maxUses ?? null,
      usedCount: result.coupon!.usedCount ?? 0,
      expiresAt: result.coupon!.expiresAt,
      discount: result.discount,
      eligibleSubtotal: result.eligibleSubtotal,
      totalMerchandiseSubtotal: result.totalMerchandiseSubtotal,
      shortfall: result.shortfall,
      valid: true,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to validate coupon via POST");
    res.status(500).json({ error: "Failed to validate coupon" });
  }
});

router.get("/coupons/available", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    let rows: any[] = [];
    try {
      rows = await mongoCoupons.findMany({ active: true });
    } catch {}

    if (rows.length === 0) {
      rows = await db
        .select()
        .from(couponsTable)
        .where(eq(couponsTable.active, true))
        .catch(() => []);
    }

    const now = new Date();
    const available = rows.filter(
      (c) =>
        (!c.startDate || new Date(c.startDate) <= now) &&
        (!c.expiresAt || new Date(c.expiresAt) > now) &&
        (c.maxUses === null || c.maxUses === undefined || (c.usedCount || 0) < c.maxUses),
    );

    res.json({
      coupons: available.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        value: c.value,
        description: c.description,
        offerDisplayText: c.offerDisplayText ?? null,
        minimumOrderValue: c.minimumOrderValue ?? 0,
        maxDiscountAmount: c.maxDiscountAmount ?? null,
        eligibleCategories: c.eligibleCategories ?? null,
        firstOrderOnly: Boolean(c.firstOrderOnly),
        perCustomerLimit: c.perCustomerLimit ?? null,
        startDate: c.startDate ?? null,
        expiresAt: c.expiresAt,
        maxUses: c.maxUses ?? null,
        usedCount: c.usedCount ?? 0,
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
        offerDisplayText: couponsTable.offerDisplayText,
        type: couponsTable.type,
        value: couponsTable.value,
        orderId: couponRedemptionsTable.orderId,
        redeemedAt: couponRedemptionsTable.redeemedAt,
      })
      .from(couponRedemptionsTable)
      .innerJoin(couponsTable, eq(couponRedemptionsTable.couponId, couponsTable.id))
      .where(eq(couponRedemptionsTable.userId, req.userId))
      .orderBy(desc(couponRedemptionsTable.redeemedAt))
      .catch(() => []);

    res.json({ redemptions: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch used coupons");
    res.status(500).json({ error: "Failed to fetch used coupons" });
  }
});

router.get("/coupons/expired", async (req: any, res: any): Promise<void> => {
  try {
    const now = new Date();
    let rows: any[] = [];
    try {
      rows = await mongoCoupons.findMany({ active: true });
    } catch {}

    if (rows.length === 0) {
      rows = await db
        .select()
        .from(couponsTable)
        .where(eq(couponsTable.active, true))
        .catch(() => []);
    }

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
        offerDisplayText: c.offerDisplayText ?? null,
        expiresAt: c.expiresAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch expired coupons");
    res.status(500).json({ error: "Failed to fetch expired coupons" });
  }
});

export default router;
