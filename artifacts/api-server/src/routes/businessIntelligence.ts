import { Router } from "express";
import { computeBusinessIntelligence, type Period } from "../lib/businessIntelligence";

const router = Router();

const requireAdminKey = (req: any, res: any, next: any) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

router.get("/admin/bi/dashboard", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "monthly", from, to } = req.query as Record<string, string>;
    const validPeriods: Period[] = ["daily", "weekly", "monthly", "yearly"];
    const p: Period = validPeriods.includes(period as Period) ? (period as Period) : "monthly";
    const data = await computeBusinessIntelligence(p, from, to);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to compute business intelligence dashboard");
    res.status(500).json({ error: "Failed to fetch business intelligence data" });
  }
});

export default router;
