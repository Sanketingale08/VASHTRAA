import { Router } from "express";
import { computeBusinessIntelligence, type Period } from "../lib/businessIntelligence";
import { requireAdminKey } from "../middlewares/isAdmin";
import { globalCache } from "../lib/cacheEngine";

const router = Router();

router.get(["/admin/bi/dashboard", "/admin/bi/overview"], requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "monthly", from, to } = req.query as Record<string, string>;
    const validPeriods: Period[] = ["daily", "weekly", "monthly", "yearly"];
    const p: Period = validPeriods.includes(period as Period) ? (period as Period) : "monthly";

    const cacheKey = globalCache.generateKey("admin-dashboard:statistics", { period: p, from, to });
    const data = await globalCache.getOrFetch(cacheKey, () => computeBusinessIntelligence(p, from, to), 30_000);
    return res.json(data);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to compute business intelligence dashboard");
    res.json({
      period: req.query?.period || "monthly",
      summary: { totalRevenue: 0, totalOrders: 0, activeVendors: 0, totalProducts: 0, averageOrderValue: 0, repeatCustomerRate: 0 },
      charts: { revenueTrend: [], orderStatusDistribution: [], topCategories: [] },
      topVendors: [],
      dataValidation: null,
    });
  }
});

export default router;
