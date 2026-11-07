import { Router } from "express";
import { mongoLogs } from "@workspace/db";
import { requireAdminKey } from "../middlewares/isAdmin";
import { LoggerService } from "../services/loggerService";

const router = Router();

// ── GET /api/admin/logs/audit ──────────────────────────────────────────────
router.get("/audit", requireAdminKey, async (req: any, res: any, next: any) => {
  try {
    const {
      role,
      actorId,
      action,
      resourceType,
      resourceId,
      result,
      search,
      startDate,
      endDate,
      page,
      limit,
    } = req.query;

    const data = await mongoLogs.queryAuditLogs({
      role: role as string,
      actorId: actorId as string,
      action: action as string,
      resourceType: resourceType as string,
      resourceId: resourceId as string,
      result: result as string,
      search: search as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: Number(page) || 1,
      limit: Number(limit) || 25,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/logs/app ────────────────────────────────────────────────
router.get("/app", requireAdminKey, async (req: any, res: any, next: any) => {
  try {
    const { level, service, requestId, provider, startDate, endDate, page, limit } = req.query;

    const data = await mongoLogs.queryAppLogs({
      level: level as string,
      service: service as string,
      requestId: requestId as string,
      provider: provider as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: Number(page) || 1,
      limit: Number(limit) || 25,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/logs/export/csv ─────────────────────────────────────────
router.get("/export/csv", requireAdminKey, async (req: any, res: any, next: any) => {
  try {
    const { role, action, result, startDate, endDate } = req.query;
    const { logs } = await mongoLogs.queryAuditLogs({
      role: role as string,
      action: action as string,
      result: result as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: 1,
      limit: 5000,
    });

    const headers = [
      "Timestamp (UTC)",
      "Role",
      "Actor ID",
      "Actor Email",
      "Action",
      "Resource Type",
      "Resource ID",
      "Result",
      "Message",
      "Request ID",
    ];

    const rows = logs.map((l) => [
      `"${l.timestamp}"`,
      `"${l.actor?.role || ""}"`,
      `"${l.actor?.id || ""}"`,
      `"${l.actor?.email || ""}"`,
      `"${l.action || ""}"`,
      `"${l.resource?.type || ""}"`,
      `"${l.resource?.id || ""}"`,
      `"${l.result || ""}"`,
      `"${(l.message || "").replace(/"/g, '""')}"`,
      `"${l.requestId || ""}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=vastraa_audit_logs_${Date.now()}.csv`);
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

export default router;

