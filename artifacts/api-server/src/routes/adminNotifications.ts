import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable, ADMIN_NOTIFICATION_USER_ID, emailOutboxTable } from "@workspace/db";
import { eq, and, desc, sql, inArray, ilike, or, gte, lte } from "drizzle-orm";

const router = Router();

import { requireAdminKey } from "../middlewares/isAdmin";

router.get("/admin/notifications/unread-count", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID), eq(notificationsTable.read, false)));
    res.json({ count: row?.count ?? 0 });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications/unread-count failed");
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

router.get("/admin/notifications", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string | undefined)?.trim();
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const rawType = req.query.type;
    const types: string[] = rawType
      ? (Array.isArray(rawType) ? rawType : String(rawType).split(",")).map(String).filter(Boolean)
      : [];

    const conditions: any[] = [eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID)];
    if (types.length === 1) conditions.push(eq(notificationsTable.type, types[0] as any));
    else if (types.length > 1) conditions.push(inArray(notificationsTable.type, types as any));
    if (search) {
      conditions.push(
        or(ilike(notificationsTable.title, `%${search}%`), ilike(notificationsTable.body, `%${search}%`))
      );
    }
    if (dateFrom) conditions.push(gte(notificationsTable.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(notificationsTable.createdAt, new Date(dateTo)));
    const whereClause = and(...conditions);

    const rows = await db
      .select()
      .from(notificationsTable)
      .where(whereClause)
      .orderBy(sql`${notificationsTable.read} ASC`, desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(whereClause);

    res.json({ notifications: rows, total, page, limit });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications failed");
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/admin/notifications/read-all", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID), eq(notificationsTable.read, false)));
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications/read-all failed");
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

router.patch("/admin/notifications/:id/read", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const rows = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID)))
      .returning({ id: notificationsTable.id });
    if (rows.length === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications/:id/read failed");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.patch("/admin/notifications/:id/unread", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const rows = await db
      .update(notificationsTable)
      .set({ read: false })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID)))
      .returning({ id: notificationsTable.id });
    if (rows.length === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications/:id/unread failed");
    res.status(500).json({ error: "Failed to mark notification as unread" });
  }
});

router.delete("/admin/notifications/:id", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const rows = await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID)))
      .returning({ id: notificationsTable.id });
    if (rows.length === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications/:id delete failed");
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

// Retry a dead outbox email — resets to pending so the worker picks it up again.
// Only entries with status="dead" can be re-queued; all other states return 409.
router.post("/admin/email-outbox/:id/retry", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    // First verify the entry exists and check its status
    const [existing] = await db
      .select({ id: emailOutboxTable.id, status: emailOutboxTable.status })
      .from(emailOutboxTable)
      .where(eq(emailOutboxTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Outbox entry not found" });
      return;
    }

    if (existing.status !== "dead") {
      res.status(409).json({
        error: "not_retryable",
        message: `Email cannot be retried: current status is "${existing.status}". Only dead emails can be re-queued.`,
      });
      return;
    }

    await db
      .update(emailOutboxTable)
      .set({
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        nextRetryAt: new Date(),
        errorMessage: null,
      })
      .where(and(eq(emailOutboxTable.id, id), eq(emailOutboxTable.status, "dead")));

    req.log?.info({ outboxId: id }, "admin/email-outbox/:id/retry — entry re-queued");
    res.json({ success: true, outboxId: id });
  } catch (err: any) {
    req.log?.error({ err }, "admin/email-outbox/:id/retry failed");
    res.status(500).json({ error: "Failed to retry email" });
  }
});

// Dead email outbox — lists emails that permanently failed delivery for manual follow-up
router.get("/admin/email-outbox/dead", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        id: emailOutboxTable.id,
        orderId: emailOutboxTable.orderId,
        userId: emailOutboxTable.userId,
        toEmail: emailOutboxTable.toEmail,
        subject: emailOutboxTable.subject,
        type: emailOutboxTable.type,
        attempts: emailOutboxTable.attempts,
        lastAttemptAt: emailOutboxTable.lastAttemptAt,
        errorMessage: emailOutboxTable.errorMessage,
        createdAt: emailOutboxTable.createdAt,
      })
      .from(emailOutboxTable)
      .where(eq(emailOutboxTable.status, "dead"))
      .orderBy(desc(emailOutboxTable.lastAttemptAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(emailOutboxTable)
      .where(eq(emailOutboxTable.status, "dead"));

    res.json({ entries: rows, total, page, limit });
  } catch (err: any) {
    req.log?.error({ err }, "admin/email-outbox/dead failed");
    res.status(500).json({ error: "Failed to fetch dead email outbox" });
  }
});

export default router;
