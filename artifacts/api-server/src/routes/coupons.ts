import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { couponsTable, couponRedemptionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};

const router = Router();

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

    res.json({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      description: coupon.description,
      maxUses: coupon.maxUses ?? null,
      usedCount: coupon.usedCount,
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

