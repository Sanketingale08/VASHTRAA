import { Router } from "express";
import { db } from "@workspace/db";
import {
  vendorSettlementsTable, commissionRulesTable, vendorsTable, reportSchedulesTable,
  REPORT_TYPES, REPORT_FREQUENCIES,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { insertSellerNotification } from "../lib/sellerNotifications";
import {
  computeRevenueReport, computePaymentReport, computeRefundReport, computeProfitAnalysis,
  listSettlements,
} from "../lib/financialManagement";
import type { Period } from "../lib/businessIntelligence";

const router = Router();

const requireAdminKey = (req: any, res: any, next: any) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

router.get("/admin/financial/settlements", requireAdminKey, async (req: any, res: any) => {
  try {
    const { status, vendorId } = req.query as Record<string, string>;
    const settlements = await listSettlements(status, vendorId);
    const pendingTotal = settlements.filter(s => ["pending", "processing"].includes(s.status)).reduce((s, x) => s + x.amount, 0);
    const completedTotal = settlements.filter(s => ["completed", "paid"].includes(s.status)).reduce((s, x) => s + x.amount, 0);
    res.json({ settlements, summary: { pendingTotal, completedTotal, count: settlements.length } });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch settlements");
    res.status(500).json({ error: "Failed to fetch settlements" });
  }
});

router.post("/admin/financial/settlements", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { vendorId, amount, type, note } = req.body ?? {};
    if (!vendorId || typeof amount !== "number" || amount <= 0 || !["release", "payout"].includes(type)) {
      res.status(400).json({ error: "vendorId, positive amount, and valid type (release/payout) are required" });
      return;
    }
    const [settlement] = await db.insert(vendorSettlementsTable).values({
      vendorId, amount, type, status: "pending", note: note ?? null,
    }).returning();
    res.status(201).json({ settlement });
  } catch (err) {
    req.log.error({ err }, "Failed to create settlement");
    res.status(500).json({ error: "Failed to create settlement" });
  }
});

router.post("/admin/financial/settlements/:id/review", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { id } = req.params;
    const { decision, paymentMethod, transactionId, utrNumber } = req.body ?? {};
    if (!["approve", "reject", "complete", "paid", "process"].includes(decision)) {
      res.status(400).json({ error: "decision must be approve, reject, complete, paid, or process" });
      return;
    }
    const [existing] = await db.select().from(vendorSettlementsTable).where(eq(vendorSettlementsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Settlement not found" });
      return;
    }
    const newStatus = decision === "approve" ? "approved"
      : decision === "reject" ? "rejected"
      : decision === "paid" ? "paid"
      : decision === "process" ? "processing"
      : "completed";
    const isSettled = newStatus === "completed" || newStatus === "paid";
    const [updated] = await db.update(vendorSettlementsTable)
      .set({
        status: newStatus,
        paymentMethod: paymentMethod ?? existing.paymentMethod,
        transactionId: transactionId ?? existing.transactionId,
        utrNumber: utrNumber ?? existing.utrNumber,
        paidAt: isSettled ? new Date() : existing.paidAt,
        reviewedAt: new Date(),
      })
      .where(eq(vendorSettlementsTable.id, id))
      .returning();

    if (isSettled) {
      const payAmount = existing.netPayout ?? existing.amount;
      await insertSellerNotification({
        vendorId: existing.vendorId,
        type: existing.type === "payout" ? "payout_successful" : "settlement_released",
        title: existing.type === "payout" ? "Payout successful" : "Settlement paid",
        body: `Your settlement of ₹${payAmount.toLocaleString("en-IN")} has been transferred.${utrNumber ? ` UTR: ${utrNumber}` : ""}`,
        metadata: { settlementId: id, utrNumber: utrNumber ?? null },
      });
    }

    res.json({ settlement: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to review settlement");
    res.status(500).json({ error: "Failed to review settlement" });
  }
});

router.get("/admin/financial/commission-rules", requireAdminKey, async (req: any, res: any) => {
  try {
    const rules = await db.select().from(commissionRulesTable);
    const vendors = await db.select().from(vendorsTable);
    const vendorById = new Map(vendors.map(v => [v.id, v]));
    res.json({
      rules: rules.map(r => ({ ...r, vendorName: r.vendorId ? vendorById.get(r.vendorId)?.name ?? "Unknown" : null })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch commission rules");
    res.status(500).json({ error: "Failed to fetch commission rules" });
  }
});

router.post("/admin/financial/commission-rules", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { scope, category, vendorId, rate, effectiveFrom, effectiveTo, supersedesId } = req.body ?? {};
    if (!["global", "category", "vendor"].includes(scope) || typeof rate !== "number" || rate < 0 || rate > 1) {
      res.status(400).json({ error: "scope (global/category/vendor) and rate (0-1) are required" });
      return;
    }
    if (scope === "category" && !category) {
      res.status(400).json({ error: "category is required for category-scoped rules" });
      return;
    }
    if (scope === "vendor" && !vendorId) {
      res.status(400).json({ error: "vendorId is required for vendor-scoped rules" });
      return;
    }
    // Editing a rule is modeled as: deactivate the old rule (kept for history)
    // and insert a new one linked via supersedesId, so past effective rates
    // remain auditable instead of being overwritten in place.
    if (supersedesId) {
      await db.update(commissionRulesTable)
        .set({ active: false, effectiveTo: new Date(), updatedAt: new Date() })
        .where(eq(commissionRulesTable.id, supersedesId));
    }
    const [rule] = await db.insert(commissionRulesTable).values({
      scope, category: category ?? null, vendorId: vendorId ?? null, rate,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      supersedesId: supersedesId ?? null,
    }).returning();
    res.status(201).json({ rule });
  } catch (err) {
    req.log.error({ err }, "Failed to create commission rule");
    res.status(500).json({ error: "Failed to create commission rule" });
  }
});

router.post("/admin/financial/commission-rules/:id/deactivate", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(commissionRulesTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(commissionRulesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Commission rule not found" });
      return;
    }
    res.json({ rule: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate commission rule");
    res.status(500).json({ error: "Failed to deactivate commission rule" });
  }
});

router.get("/admin/financial/reports/revenue", requireAdminKey, async (req: any, res: any) => {
  try {
    const { from, to, vendorId, category, paymentStatus } = req.query as Record<string, string>;
    const report = await computeRevenueReport({ from, to, vendorId, category, paymentStatus });
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Failed to compute revenue report");
    res.status(500).json({ error: "Failed to compute revenue report" });
  }
});

router.get("/admin/financial/reports/payments", requireAdminKey, async (req: any, res: any) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const report = await computePaymentReport({ from, to });
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Failed to compute payment report");
    res.status(500).json({ error: "Failed to compute payment report" });
  }
});

router.get("/admin/financial/reports/refunds", requireAdminKey, async (req: any, res: any) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const report = await computeRefundReport({ from, to });
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Failed to compute refund report");
    res.status(500).json({ error: "Failed to compute refund report" });
  }
});

router.get("/admin/financial/profit-analysis", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "monthly", from, to } = req.query as Record<string, string>;
    const validPeriods: Period[] = ["daily", "weekly", "monthly", "yearly"];
    const p: Period = validPeriods.includes(period as Period) ? (period as Period) : "monthly";
    const analysis = await computeProfitAnalysis(p, from, to);
    res.json(analysis);
  } catch (err) {
    req.log.error({ err }, "Failed to compute profit analysis");
    res.status(500).json({ error: "Failed to compute profit analysis" });
  }
});

router.get("/admin/financial/report-schedules", requireAdminKey, async (req: any, res: any) => {
  try {
    const schedules = await db.select().from(reportSchedulesTable).orderBy(desc(reportSchedulesTable.createdAt));
    res.json({ schedules });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch report schedules");
    res.status(500).json({ error: "Failed to fetch report schedules" });
  }
});

router.post("/admin/financial/report-schedules", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { reportType, frequency, recipientEmail } = req.body ?? {};
    if (!REPORT_TYPES.includes(reportType) || !REPORT_FREQUENCIES.includes(frequency)) {
      res.status(400).json({ error: `reportType must be one of ${REPORT_TYPES.join(", ")} and frequency one of ${REPORT_FREQUENCIES.join(", ")}` });
      return;
    }
    const [schedule] = await db.insert(reportSchedulesTable).values({
      reportType, frequency, recipientEmail: recipientEmail ?? null,
    }).returning();
    res.status(201).json({ schedule });
  } catch (err) {
    req.log.error({ err }, "Failed to create report schedule");
    res.status(500).json({ error: "Failed to create report schedule" });
  }
});

router.post("/admin/financial/report-schedules/:id/toggle", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { id } = req.params;
    const [existing] = await db.select().from(reportSchedulesTable).where(eq(reportSchedulesTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Report schedule not found" });
      return;
    }
    const [updated] = await db.update(reportSchedulesTable)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(eq(reportSchedulesTable.id, id))
      .returning();
    res.json({ schedule: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to toggle report schedule");
    res.status(500).json({ error: "Failed to toggle report schedule" });
  }
});

router.delete("/admin/financial/report-schedules/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.delete(reportSchedulesTable).where(eq(reportSchedulesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete report schedule");
    res.status(500).json({ error: "Failed to delete report schedule" });
  }
});

export default router;
