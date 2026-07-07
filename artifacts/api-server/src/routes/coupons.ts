import { Router } from "express";
import { db } from "@workspace/db";
import { couponsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

    res.json({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      description: coupon.description,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to validate coupon");
    res.status(500).json({ error: "Failed to validate coupon" });
  }
});

export default router;
