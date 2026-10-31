import { Router } from "express";
import { db, mongoCommission, mongoSettlements, mongoSellers, mongoGeneric, isMongoDbConnected } from "@workspace/db";
import {
  vendorSettlementsTable, commissionRulesTable, vendorsTable, reportSchedulesTable,
  REPORT_TYPES, REPORT_FREQUENCIES,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { insertSellerNotification } from "../lib/sellerNotifications";
import {
  sendVendorPayoutRequestApprovedEmail,
  sendVendorPayoutApprovedEmail,
  sendVendorPayoutRejectedEmail,
} from "../lib/transactionalEmail";
import {
  computeRevenueReport, computePaymentReport, computeRefundReport, computeProfitAnalysis,
  listSettlements,
} from "../lib/financialManagement";
import type { Period } from "../lib/businessIntelligence";

import { requireAdminKey } from "../middlewares/isAdmin";
import { CashfreePayoutProvider, processSettlementTransitions, syncEligibleOrderSettlements } from "../lib/settlementAutomation";
import { getCashfreeTransferStatus } from "../lib/cashfree";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { emitFinancialsEvent } from "../lib/socket";
import { safeInvalidatePattern } from "../lib/cacheEngine";

const router = Router();

router.get("/admin/financial/settlements", requireAdminKey, async (req: any, res: any) => {
  try {
    const { status, vendorId, seller } = req.query as Record<string, string>;
    const targetVendor = vendorId || seller;
    const { settlements, summary, dataValidation } = await listSettlements(status, targetVendor);
    const pendingTotal = summary?.pendingTotal ?? settlements
      .filter(s => ["pending", "eligible", "approved", "processing", "on_hold"].includes(String(s.status || "").toLowerCase()))
      .reduce((s, x) => s + (x.amount || 0), 0);
    const completedTotal = summary?.completedTotal ?? settlements
      .filter(s => ["completed", "paid"].includes(String(s.status || "").toLowerCase()))
      .reduce((s, x) => s + (x.amount || 0), 0);
    res.json({ settlements, summary: { pendingTotal, completedTotal, count: settlements.length }, dataValidation });
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

    safeInvalidatePattern(/financial|settlement|revenue|payment|refund|profit/);
    try {
      emitFinancialsEvent("settlement:created", { settlementId: settlement.id, vendorId, amount });
      emitFinancialsEvent("financials:updated", { source: "settlement:created", settlementId: settlement.id, vendorId });
    } catch {}

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

    // Fetch vendor info for email notifications (name, contactEmail, ownerId)
    let vendor: any = null;
    try {
      const [v] = await db
        .select({ name: vendorsTable.name, contactEmail: vendorsTable.contactEmail, ownerId: vendorsTable.ownerId })
        .from(vendorsTable)
        .where(eq(vendorsTable.id, existing.vendorId))
        .limit(1);
      vendor = v;
    } catch {}

    if (!vendor && mongoSellers && typeof mongoSellers.findById === "function") {
      try {
        const sv = await mongoSellers.findById(existing.vendorId);
        if (sv) {
          vendor = {
            name: sv.name || sv.sellerName || sv.shopName,
            contactEmail: sv.contactEmail || sv.email,
            ownerId: sv.ownerId || sv.userId,
          };
        }
      } catch {}
    }

    const newStatus = decision === "approve" ? "approved"
      : decision === "reject" ? "rejected"
      : decision === "paid" ? "paid"
      : decision === "process" ? "processing"
      : "completed";
    const isSettled = newStatus === "completed" || newStatus === "paid";
    const isRejected = newStatus === "rejected";
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

    const payAmount = existing.netPayout ?? existing.amount;

    if (isSettled) {
      await insertSellerNotification({
        vendorId: existing.vendorId,
        type: existing.type === "payout" ? "payout_successful" : "settlement_released",
        title: existing.type === "payout" ? "Payout successful" : "Settlement paid",
        body: `Your settlement of ₹${payAmount.toLocaleString("en-IN")} has been transferred.${utrNumber ? ` UTR: ${utrNumber}` : ""}`,
        metadata: { settlementId: id, utrNumber: utrNumber ?? null },
      });

      if (vendor) {
        sendVendorPayoutApprovedEmail({
          vendorId: existing.vendorId,
          vendorName: vendor.name,
          contactEmail: vendor.contactEmail ?? null,
          ownerId: vendor.ownerId ?? null,
          amount: payAmount,
          utrNumber: utrNumber ?? existing.utrNumber ?? null,
        }).catch((err) => req.log.error({ err, settlementId: id }, "Failed to send payout approved email"));
      }
    }

    if (newStatus === "approved" && vendor) {
      sendVendorPayoutRequestApprovedEmail({
        vendorId: existing.vendorId,
        vendorName: vendor.name,
        contactEmail: vendor.contactEmail ?? null,
        ownerId: vendor.ownerId ?? null,
        amount: payAmount,
      }).catch((err) => req.log.error({ err, settlementId: id }, "Failed to send payout request approved email"));
    }

    if (isRejected && vendor) {
      sendVendorPayoutRejectedEmail({
        vendorId: existing.vendorId,
        vendorName: vendor.name,
        contactEmail: vendor.contactEmail ?? null,
        ownerId: vendor.ownerId ?? null,
        amount: payAmount,
        note: req.body?.note ?? null,
      }).catch((err) => req.log.error({ err, settlementId: id }, "Failed to send payout rejected email"));
    }

    writeAuditLog({
      action: "settlement_review_decision",
      module: "Financial Management",
      details: { settlementId: id, vendorId: existing.vendorId, decision, newStatus, payAmount, utrNumber: utrNumber ?? existing.utrNumber },
      ipAddress: getIp(req),
    }).catch(() => {});

    safeInvalidatePattern(/financial|settlement|revenue|payment|refund|profit/);
    try {
      emitFinancialsEvent("settlement:processed", { settlementId: id, vendorId: existing.vendorId, status: newStatus, utrNumber: utrNumber ?? existing.utrNumber });
      emitFinancialsEvent("financials:updated", { source: "settlement:review", settlementId: id, status: newStatus });
    } catch {}

    res.json({ settlement: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to review settlement");
    res.status(500).json({ error: "Failed to review settlement" });
  }
});

// POST /admin/financial/settlements/:id/payout
router.post("/admin/financial/settlements/:id/payout", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    let existing: any = null;
    if (isMongoDbConnected()) {
      existing = await mongoGeneric.getCollection("vendor_settlements").findOne({ id });
    }
    if (!existing) {
      const [row] = await db.select().from(vendorSettlementsTable).where(eq(vendorSettlementsTable.id, id)).limit(1);
      existing = row;
    }

    if (!existing) {
      res.status(404).json({ error: "Settlement not found" });
      return;
    }

    if (existing.status === "paid" || existing.status === "completed") {
      res.status(400).json({ error: "Settlement is already paid" });
      return;
    }

    const provider = new CashfreePayoutProvider();
    const result = await provider.processPayout({
      id: existing.id,
      amount: existing.amount,
      vendorId: existing.vendorId,
      existingTransferId: existing.cashfreeTransferId,
    });

    const now = new Date();
    const newStatus = result.status === "SUCCESS" ? "paid" : result.status === "PENDING" ? "processing" : "failed";

    const updateFields: any = {
      status: newStatus,
      cashfreeTransferId: result.payoutReference || existing.cashfreeTransferId,
      utrNumber: result.utrNumber || existing.utrNumber || null,
      failureReason: result.error || null,
      reviewedAt: now,
      paidAt: newStatus === "paid" ? now : existing.paidAt,
      approvedAt: now,
      approvedBy: req.adminId || "admin",
      updatedAt: now,
    };

    if (isMongoDbConnected()) {
      await mongoGeneric.getCollection("vendor_settlements").updateOne({ id }, { $set: updateFields });
    }
    try {
      await db.update(vendorSettlementsTable).set(updateFields).where(eq(vendorSettlementsTable.id, id));
    } catch {}

    writeAuditLog({
      action: "settlement_payout_executed",
      module: "Financial Management",
      details: {
        settlementId: id,
        vendorId: existing.vendorId,
        status: newStatus,
        transferId: result.payoutReference,
        utrNumber: result.utrNumber,
        error: result.error,
      },
      ipAddress: getIp(req),
    }).catch(() => {});

    if (newStatus === "paid") {
      await insertSellerNotification({
        vendorId: existing.vendorId,
        type: "payout_successful",
        title: "Cashfree Payout successful",
        body: `Your settlement of ₹${Math.round(existing.amount > 1000 ? existing.amount / 100 : existing.amount).toLocaleString("en-IN")} has been transferred via Cashfree.${result.utrNumber ? ` UTR: ${result.utrNumber}` : ""}`,
        metadata: { settlementId: id, utrNumber: result.utrNumber },
      }).catch(() => {});
    }

    safeInvalidatePattern(/financial|settlement|revenue|payment|refund|profit/);
    try {
      emitFinancialsEvent("settlement:processed", { settlementId: id, vendorId: existing.vendorId, status: newStatus, utrNumber: result.utrNumber });
      emitFinancialsEvent("financials:updated", { source: "settlement:payout", settlementId: id, status: newStatus });
    } catch {}

    res.json({
      success: result.success,
      status: newStatus,
      transferId: result.payoutReference,
      utrNumber: result.utrNumber,
      error: result.error,
      settlement: { ...existing, ...updateFields },
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to execute payout");
    res.status(500).json({ error: err?.message || "Failed to execute payout" });
  }
});

// POST /admin/financial/settlements/batch-payout
router.post("/admin/financial/settlements/batch-payout", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { settlementIds } = req.body ?? {};
  if (!Array.isArray(settlementIds) || settlementIds.length === 0) {
    res.status(400).json({ error: "settlementIds array is required" });
    return;
  }

  try {
    const provider = new CashfreePayoutProvider();
    const results: any[] = [];
    let successfulCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    for (const id of settlementIds) {
      let settlement: any = null;
      if (isMongoDbConnected()) {
        settlement = await mongoGeneric.getCollection("vendor_settlements").findOne({ id });
      }
      if (!settlement) {
        const [row] = await db.select().from(vendorSettlementsTable).where(eq(vendorSettlementsTable.id, id)).limit(1);
        settlement = row;
      }

      if (!settlement) {
        results.push({ id, success: false, error: "Settlement not found" });
        failedCount++;
        continue;
      }

      if (settlement.status === "paid" || settlement.status === "completed") {
        results.push({ id, success: false, error: "Already paid" });
        continue;
      }

      const resPayout = await provider.processPayout({
        id: settlement.id,
        amount: settlement.amount,
        vendorId: settlement.vendorId,
        existingTransferId: settlement.cashfreeTransferId,
      });

      const now = new Date();
      const newStatus = resPayout.status === "SUCCESS" ? "paid" : resPayout.status === "PENDING" ? "processing" : "failed";

      const updateFields: any = {
        status: newStatus,
        cashfreeTransferId: resPayout.payoutReference || settlement.cashfreeTransferId,
        utrNumber: resPayout.utrNumber || settlement.utrNumber || null,
        failureReason: resPayout.error || null,
        reviewedAt: now,
        paidAt: newStatus === "paid" ? now : settlement.paidAt,
        approvedAt: now,
        approvedBy: req.adminId || "admin",
        updatedAt: now,
      };

      if (isMongoDbConnected()) {
        await mongoGeneric.getCollection("vendor_settlements").updateOne({ id }, { $set: updateFields });
      }
      try {
        await db.update(vendorSettlementsTable).set(updateFields).where(eq(vendorSettlementsTable.id, id));
      } catch {}

      if (newStatus === "paid") successfulCount++;
      else if (newStatus === "processing") pendingCount++;
      else failedCount++;

      results.push({
        id,
        success: resPayout.success,
        status: newStatus,
        transferId: resPayout.payoutReference,
        utrNumber: resPayout.utrNumber,
        error: resPayout.error,
      });
    }

    writeAuditLog({
      action: "batch_settlement_payout_executed",
      module: "Financial Management",
      details: {
        totalRequested: settlementIds.length,
        successfulCount,
        pendingCount,
        failedCount,
      },
      ipAddress: getIp(req),
    }).catch(() => {});

    safeInvalidatePattern(/financial|settlement|revenue|payment|refund|profit/);
    try {
      emitFinancialsEvent("settlement:processed", { settlementIds, status: "batch_processed", successfulCount, failedCount });
      emitFinancialsEvent("financials:updated", { source: "settlement:batch_payout" });
    } catch {}

    res.json({
      total: settlementIds.length,
      successful: successfulCount,
      pending: pendingCount,
      failed: failedCount,
      results,
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Batch payout execution error");
    res.status(500).json({ error: err?.message || "Failed to execute batch payout" });
  }
});

// POST /admin/financial/settlements/:id/reconcile
router.post("/admin/financial/settlements/:id/reconcile", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    let settlement: any = null;
    if (isMongoDbConnected()) {
      settlement = await mongoGeneric.getCollection("vendor_settlements").findOne({ id });
    }
    if (!settlement) {
      const [row] = await db.select().from(vendorSettlementsTable).where(eq(vendorSettlementsTable.id, id)).limit(1);
      settlement = row;
    }

    if (!settlement) {
      res.status(404).json({ error: "Settlement not found" });
      return;
    }

    if (!settlement.cashfreeTransferId) {
      res.status(400).json({ error: "No Cashfree transfer reference found on this settlement to reconcile" });
      return;
    }

    const check = await getCashfreeTransferStatus(settlement.cashfreeTransferId);
    const now = new Date();
    const newStatus = check.status === "SUCCESS" ? "paid" : check.status === "FAILED" ? "failed" : "processing";

    const updateFields: any = {
      status: newStatus,
      utrNumber: check.utrNumber || settlement.utrNumber || null,
      failureReason: check.error || null,
      paidAt: newStatus === "paid" ? now : settlement.paidAt,
      updatedAt: now,
    };

    if (isMongoDbConnected()) {
      await mongoGeneric.getCollection("vendor_settlements").updateOne({ id }, { $set: updateFields });
    }
    try {
      await db.update(vendorSettlementsTable).set(updateFields).where(eq(vendorSettlementsTable.id, id));
    } catch {}

    safeInvalidatePattern(/financial|settlement|revenue|payment|refund|profit/);
    try {
      emitFinancialsEvent("settlement:processed", { settlementId: id, status: newStatus, utrNumber: check.utrNumber });
      emitFinancialsEvent("financials:updated", { source: "settlement:reconciled", settlementId: id, status: newStatus });
    } catch {}

    res.json({
      reconciled: true,
      status: newStatus,
      utrNumber: check.utrNumber,
      error: check.error,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to reconcile transfer" });
  }
});

// POST /admin/financial/settlements/run-cycle — Automated Wednesday Payout & Return-Hold Transition
router.post("/admin/financial/settlements/run-cycle", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { returnWindowDays } = req.body ?? {};
    const result = await processSettlementTransitions({
      returnWindowDays: typeof returnWindowDays === "number" ? returnWindowDays : undefined,
    });

    writeAuditLog({
      action: "settlement_cycle_executed",
      module: "Financial Management",
      details: {
        eligibleCount: result.eligibleCount,
        paidCount: result.paidCount,
        auditLogsCount: result.auditLogs.length,
      },
      ipAddress: getIp(req),
    }).catch(() => {});

    safeInvalidatePattern(/financial|settlement|revenue|payment|refund|profit/);
    try {
      emitFinancialsEvent("settlement:processed", { type: "cycle_run", ...result });
      emitFinancialsEvent("financials:updated", { source: "settlement:cycle_run", ...result });
    } catch {}

    res.json({
      success: true,
      message: `Settlement cycle processed. ${result.eligibleCount} order(s) eligible, ${result.paidCount} settlement(s) disbursed.`,
      ...result,
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to run settlement cycle");
    res.status(500).json({ error: err?.message || "Failed to run settlement cycle" });
  }
});

router.get("/admin/financial/commission-rules", requireAdminKey, async (req: any, res: any) => {
  try {
    let rules: any[] = [];
    let vendors: any[] = [];
    try {
      rules = await mongoCommission.findRules();
      vendors = await mongoSellers.findMany();
    } catch {
      rules = await db.select().from(commissionRulesTable).catch(() => []);
      vendors = await db.select().from(vendorsTable).catch(() => []);
    }
    const vendorById = new Map(vendors.map(v => [v.id || v.vendorId, v]));
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
    if (supersedesId) {
      try {
        await mongoCommission.updateRule(supersedesId, { active: false, effectiveTo: new Date() });
      } catch {
        await db.update(commissionRulesTable)
          .set({ active: false, effectiveTo: new Date(), updatedAt: new Date() })
          .where(eq(commissionRulesTable.id, supersedesId))
          .catch(() => {});
      }
    }
    let rule: any;
    try {
      rule = await mongoCommission.insertRule({
        scope, category: category ?? null, vendorId: vendorId ?? null, rate,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        supersedesId: supersedesId ?? null,
      });
    } catch {
      const [r] = await db.insert(commissionRulesTable).values({
        scope, category: category ?? null, vendorId: vendorId ?? null, rate,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        supersedesId: supersedesId ?? null,
      }).returning();
      rule = r;
    }

    writeAuditLog({
      action: "commission_rule_created",
      module: "Financial Management",
      details: {
        ruleId: rule.id,
        scope,
        category: category ?? null,
        vendorId: vendorId ?? null,
        rate,
        supersedesId: supersedesId ?? null,
      },
      ipAddress: getIp(req),
    }).catch(() => {});

    safeInvalidatePattern(/financial|settlement|commission|revenue|payment|refund|profit/);
    try {
      emitFinancialsEvent("commission_rule:updated", { ruleId: rule.id, scope, rate });
      emitFinancialsEvent("financials:updated", { source: "commission_rule:created", ruleId: rule.id });
    } catch {}

    res.status(201).json({ rule });
  } catch (err) {
    req.log.error({ err }, "Failed to create commission rule");
    res.status(500).json({ error: "Failed to create commission rule" });
  }
});

router.post("/admin/financial/commission-rules/:id/deactivate", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { id } = req.params;
    let updated: any = null;
    try {
      updated = await mongoCommission.updateRule(id, { active: false });
    } catch {
      const [u] = await db.update(commissionRulesTable)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(commissionRulesTable.id, id))
        .returning();
      updated = u;
    }
    if (!updated) {
      res.status(404).json({ error: "Commission rule not found" });
      return;
    }

    writeAuditLog({
      action: "commission_rule_deactivated",
      module: "Financial Management",
      details: { ruleId: id },
      ipAddress: getIp(req),
    }).catch(() => {});

    safeInvalidatePattern(/financial|settlement|commission|revenue|payment|refund|profit/);
    try {
      emitFinancialsEvent("commission_rule:updated", { ruleId: id, active: false });
      emitFinancialsEvent("financials:updated", { source: "commission_rule:deactivated", ruleId: id });
    } catch {}

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
    req.log?.error?.({ err }, "Failed to compute revenue report");
    res.json({
      summary: { totalGrossRevenue: 0, totalNetRevenue: 0, totalPlatformFee: 0, totalVendorPayout: 0, totalTaxAmount: 0, totalOrdersCount: 0 },
      breakdown: [],
      dataValidation: null,
    });
  }
});

router.get("/admin/financial/reports/payments", requireAdminKey, async (req: any, res: any) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const report = await computePaymentReport({ from, to });
    res.json(report);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to compute payment report");
    res.json({
      byMethod: [],
      byStatus: [],
      gatewayFeeEstimate: 0,
      totalProcessed: 0,
    });
  }
});

router.get("/admin/financial/reports/refunds", requireAdminKey, async (req: any, res: any) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const report = await computeRefundReport({ from, to });
    res.json(report);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to compute refund report");
    res.json({
      summary: { totalRefundCount: 0, totalRefundAmount: 0, vendorShare: 0, platformShare: 0 },
      byReason: [],
      byStatus: [],
    });
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
    req.log?.error?.({ err }, "Failed to compute profit analysis");
    res.json({
      period: req.query?.period || "monthly",
      summary: { grossRevenue: 0, vendorCost: 0, netMargin: 0, netMarginPct: 0, platformTakeRatePct: 0 },
      trend: [],
      topProfitableVendors: [],
      topProfitableCategories: [],
    });
  }
});

router.get("/admin/financial/report-schedules", requireAdminKey, async (req: any, res: any) => {
  try {
    let schedules: any[] = [];
    if (isMongoDbConnected()) {
      try {
        const col = mongoGeneric.getCollection("report_schedules");
        schedules = await col.find({}).sort({ createdAt: -1 }).toArray();
        schedules = schedules.map(s => ({ ...s, id: s.id || s._id }));
      } catch {
        // Fallback to Drizzle below
      }
    }
    if (schedules.length === 0) {
      schedules = await db.select().from(reportSchedulesTable).orderBy(desc(reportSchedulesTable.createdAt)).catch(() => []);
    }
    res.json({ schedules });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to fetch report schedules");
    res.json({ schedules: [] });
  }
});

router.post("/admin/financial/report-schedules", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { reportType, frequency, recipientEmail } = req.body ?? {};
    if (!REPORT_TYPES.includes(reportType) || !REPORT_FREQUENCIES.includes(frequency)) {
      res.status(400).json({ error: `reportType must be one of ${REPORT_TYPES.join(", ")} and frequency one of ${REPORT_FREQUENCIES.join(", ")}` });
      return;
    }
    let schedule: any;
    const now = new Date();
    const doc = {
      id: crypto.randomUUID(),
      reportType,
      frequency,
      recipientEmail: recipientEmail ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    if (isMongoDbConnected()) {
      try {
        await mongoGeneric.getCollection("report_schedules").insertOne(doc);
        schedule = doc;
      } catch {
        // Fallback to Drizzle
      }
    }
    if (!schedule) {
      const [s] = await db.insert(reportSchedulesTable).values({
        reportType, frequency, recipientEmail: recipientEmail ?? null,
      }).returning();
      schedule = s;
    }
    res.status(201).json({ schedule });
  } catch (err) {
    req.log.error({ err }, "Failed to create report schedule");
    res.status(500).json({ error: "Failed to create report schedule" });
  }
});

router.post("/admin/financial/report-schedules/:id/toggle", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const { id } = req.params;
    let updated: any = null;
    if (isMongoDbConnected()) {
      try {
        const col = mongoGeneric.getCollection("report_schedules");
        const existing = await col.findOne({ $or: [{ id }, { _id: id as any }] });
        if (existing) {
          const newActive = !existing.active;
          await col.updateOne({ $or: [{ id }, { _id: id as any }] }, { $set: { active: newActive, updatedAt: new Date() } });
          updated = { ...existing, active: newActive, id: existing.id || existing._id };
        }
      } catch {
        // Fallback
      }
    }
    if (!updated) {
      const [existing] = await db.select().from(reportSchedulesTable).where(eq(reportSchedulesTable.id, id)).limit(1).catch(() => []);
      if (existing) {
        const [u] = await db.update(reportSchedulesTable)
          .set({ active: !existing.active, updatedAt: new Date() })
          .where(eq(reportSchedulesTable.id, id))
          .returning();
        updated = u;
      }
    }
    if (!updated) {
      res.status(404).json({ error: "Report schedule not found" });
      return;
    }
    res.json({ schedule: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to toggle report schedule");
    res.status(500).json({ error: "Failed to toggle report schedule" });
  }
});

router.delete("/admin/financial/report-schedules/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    if (isMongoDbConnected()) {
      try {
        await mongoGeneric.getCollection("report_schedules").deleteOne({ $or: [{ id }, { _id: id as any }] });
      } catch {
        // Fallback
      }
    }
    await db.delete(reportSchedulesTable).where(eq(reportSchedulesTable.id, id)).catch(() => {});
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete report schedule");
    res.status(500).json({ error: "Failed to delete report schedule" });
  }
});

router.get("/admin/financials/summary", requireAdminKey, async (req: any, res: any) => {
  try {
    try {
      await syncEligibleOrderSettlements();
    } catch {}

    let allSettlements: any[] = [];
    try {
      allSettlements = await db.select().from(vendorSettlementsTable);
    } catch {}

    if (typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
      try {
        const mSettlements = mongoSettlements && typeof mongoSettlements.findMany === "function"
          ? await mongoSettlements.findMany({})
          : await mongoGeneric.getCollection("vendor_settlements").find({}).toArray();
        const seen = new Set(allSettlements.map((s) => String(s.id)));
        for (const ms of mSettlements) {
          if (!seen.has(String(ms.id))) {
            allSettlements.push(ms);
            seen.add(String(ms.id));
          }
        }
      } catch {}
    }

    let gmvPaise = 0;
    let platformCommissionPaise = 0;
    let gstCollectedPaise = 0;
    let gstOnCommissionPaise = 0;
    let platformKeepsPaise = 0;
    let tcsPaise = 0;
    let pendingSettlementsPaise = 0;
    let completedSettlementsPaise = 0;

    let pendingSettlementsRupees = 0;
    let completedSettlementsRupees = 0;

    for (const s of allSettlements) {
      const isPaise = s.pricingVersion === "v2" || (typeof s.amount === "number" && s.amount > 10000 && !s.netPayout && !s.productAmount);

      const customerPays = Number(s.customerPays ?? (s.productAmount ? s.productAmount * 100 : s.amount * 100) ?? 0);
      const comm = Number(s.platformCommission ?? (s.commission ? s.commission * 100 : 0) ?? 0);
      const gstColl = Number(s.gstAmount ?? 0);
      const gstComm = Number(s.gstOnCommission ?? (s.settlementTax ? s.settlementTax * 100 : 0) ?? 0);
      const pKeeps = Number(s.platformKeeps ?? (comm + gstComm));
      const tcsDed = Number(s.tcsDeduction ?? 0);

      gmvPaise += customerPays;
      platformCommissionPaise += comm;
      gstCollectedPaise += gstColl;
      gstOnCommissionPaise += gstComm;
      platformKeepsPaise += pKeeps;
      tcsPaise += tcsDed;

      const netRupees = isPaise
        ? Math.round(Number(s.sellerSettlement ?? s.amount ?? 0) / 100)
        : Number(s.netPayout ?? s.amount ?? 0);
      const netPaise = isPaise
        ? Number(s.sellerSettlement ?? s.amount ?? 0)
        : Math.round(Number(s.netPayout ?? s.amount ?? 0) * 100);

      const st = String(s.status || "pending").toLowerCase();
      if (["pending", "eligible", "processing", "approved", "on_hold"].includes(st)) {
        pendingSettlementsPaise += netPaise;
        pendingSettlementsRupees += netRupees;
      } else if (["paid", "completed"].includes(st)) {
        completedSettlementsPaise += netPaise;
        completedSettlementsRupees += netRupees;
      }
    }

    res.json({
      success: true,
      summary: {
        gmv: gmvPaise,
        platformCommission: platformCommissionPaise,
        gstCollected: gstCollectedPaise,
        gstOnCommission: gstOnCommissionPaise,
        platformKeeps: platformKeepsPaise,
        tcs: tcsPaise,
        pendingSettlements: pendingSettlementsPaise,
        completedSettlements: completedSettlementsPaise,
        totalRecords: allSettlements.length,
      },
      rupees: {
        gmv: Math.round(gmvPaise / 100),
        platformCommission: Math.round(platformCommissionPaise / 100),
        gstCollected: Math.round(gstCollectedPaise / 100),
        gstOnCommission: Math.round(gstOnCommissionPaise / 100),
        platformKeeps: Math.round(platformKeepsPaise / 100),
        tcs: Math.round(tcsPaise / 100),
        pendingSettlements: pendingSettlementsRupees,
        completedSettlements: completedSettlementsRupees,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch financial summary", details: err.message });
  }
});

router.get("/admin/financials/ledger", requireAdminKey, async (req: any, res: any) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
    const offset = (page - 1) * limit;

    const { fromDate, toDate, seller, vendorId, status, pricingVersion } = req.query as Record<string, string>;
    const targetVendor = seller || vendorId;

    let all: any[] = [];
    try {
      all = await db
        .select()
        .from(vendorSettlementsTable)
        .orderBy(desc(vendorSettlementsTable.createdAt));
    } catch {}

    if (all.length === 0 && typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
      try {
        if (mongoSettlements && typeof mongoSettlements.findMany === "function") {
          all = await mongoSettlements.findMany({}, { sort: { createdAt: -1 } });
        } else if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
          all = await mongoGeneric.getCollection("vendor_settlements").find({}).sort({ createdAt: -1 }).toArray();
        }
      } catch {}
    }

    // Load vendors for name resolution & alias filtering
    let vendorsList: any[] = [];
    try {
      if (mongoSellers && typeof mongoSellers.findMany === "function") {
        vendorsList = await mongoSellers.findMany({});
      }
    } catch {}
    if (vendorsList.length === 0) {
      try {
        vendorsList = await db.select().from(vendorsTable);
      } catch {}
    }

    const vendorById = new Map<string, any>();
    for (const v of vendorsList) {
      if (!v) continue;
      const aliases = [v.id, v.vendorId, v.sellerId, v.ownerId, v.userId, v._id ? String(v._id) : null].filter(Boolean);
      for (const a of aliases) {
        vendorById.set(String(a), v);
        vendorById.set(String(a).toLowerCase(), v);
      }
      if (v.name) vendorById.set(String(v.name).toLowerCase(), v);
      if (v.shopName) vendorById.set(String(v.shopName).toLowerCase(), v);
    }

    let allowedAliases: Set<string> | null = null;
    if (targetVendor) {
      const matchedVendor = vendorById.get(targetVendor) || vendorById.get(targetVendor.toLowerCase());
      if (matchedVendor) {
        allowedAliases = new Set([
          targetVendor,
          targetVendor.toLowerCase(),
          matchedVendor.id,
          matchedVendor.vendorId,
          matchedVendor.sellerId,
          matchedVendor.ownerId,
          matchedVendor.userId,
          matchedVendor._id ? String(matchedVendor._id) : null,
        ].filter(Boolean).map(String));
      }
    }

    // Apply filtering
    let filtered = all.filter((s) => {
      if (targetVendor) {
        if (allowedAliases) {
          if (!allowedAliases.has(s.vendorId) && !allowedAliases.has(String(s.vendorId).toLowerCase())) return false;
        } else if (s.vendorId !== targetVendor && String(s.vendorId).toLowerCase() !== targetVendor.toLowerCase()) {
          return false;
        }
      }
      if (status && status !== "all" && s.status !== status) return false;
      if (pricingVersion && pricingVersion !== "all" && (s.pricingVersion ?? "v1") !== pricingVersion) return false;
      if (fromDate && new Date(s.createdAt) < new Date(fromDate)) return false;
      if (toDate && new Date(s.createdAt) > new Date(toDate + "T23:59:59")) return false;
      return true;
    });

    const total = filtered.length;
    const ledger = filtered.slice(offset, offset + limit).map((s) => {
      const v = vendorById.get(s.vendorId) || vendorById.get(String(s.vendorId).toLowerCase());
      const vendorName = v?.shopName || v?.name || v?.sellerName || "Unknown Vendor";
      const sellerId = v?.sellerId || v?.vendorId || s.vendorId;
      return {
        ...s,
        vendorName,
        sellerName: vendorName,
        sellerId,
      };
    });

    res.json({
      success: true,
      ledger,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch financial ledger", details: err.message });
  }
});

export default router;
