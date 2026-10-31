import { Router } from "express";
import { db, mongoNotifications } from "@workspace/db";
import { notificationsTable, ADMIN_NOTIFICATION_USER_ID, emailOutboxTable } from "@workspace/db";
import { eq, and, desc, sql, inArray, ilike, or, gte, lte } from "drizzle-orm";

const router = Router();

import { requireAdminKey } from "../middlewares/isAdmin";

router.get("/admin/notifications/unread-count", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    let count = 0;
    try {
      count = await mongoNotifications.count({
        userId: ADMIN_NOTIFICATION_USER_ID,
        $or: [{ read: false }, { isRead: false }],
      });
    } catch {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationsTable)
        .where(and(eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID), eq(notificationsTable.read, false)))
        .catch(() => []);
      count = row?.count ?? 0;
    }
    res.json({ count });
  } catch (err: any) {
    req.log?.error?.({ err }, "admin/notifications/unread-count failed");
    res.json({ count: 0 });
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

    let rows: any[] = [];
    let total = 0;
    try {
      const filter: any = { userId: ADMIN_NOTIFICATION_USER_ID };
      if (types.length === 1) filter.type = types[0];
      else if (types.length > 1) filter.type = { $in: types };
      if (search) filter.$or = [{ title: { $regex: search, $options: "i" } }, { body: { $regex: search, $options: "i" } }];
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }

      rows = await mongoNotifications.findMany(filter, { limit, skip: offset, sort: { read: 1, createdAt: -1 } });
      total = await mongoNotifications.count(filter);
    } catch {
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

      rows = await db
        .select()
        .from(notificationsTable)
        .where(whereClause)
        .orderBy(sql`${notificationsTable.read} ASC`, desc(notificationsTable.createdAt))
        .limit(limit)
        .offset(offset)
        .catch(() => []);

      const countRows = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(notificationsTable)
        .where(whereClause)
        .catch(() => []);
      total = countRows[0]?.total ?? 0;
    }

    res.json({ notifications: rows, total, page, limit });
  } catch (err: any) {
    req.log?.error?.({ err }, "admin/notifications failed");
    res.json({ notifications: [], total: 0, page: 1, limit: 20 });
  }
});

router.patch("/admin/notifications/read-all", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    try {
      await mongoNotifications.markAllRead(ADMIN_NOTIFICATION_USER_ID);
    } catch {}
    try {
      await db
        .update(notificationsTable)
        .set({ read: true })
        .where(and(eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID), eq(notificationsTable.read, false)))
        .catch(() => {});
    } catch {}
    res.json({ success: true, message: "All admin notifications marked as read" });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications/read-all failed");
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

router.patch("/admin/notifications/:id/read", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "Notification ID is required" });
    return;
  }
  try {
    let success = false;
    try {
      const existing = await mongoNotifications.findById(id);
      if (existing) {
        if (existing.userId && existing.userId !== ADMIN_NOTIFICATION_USER_ID) {
          res.status(403).json({ error: "Forbidden: Notification belongs to another account" });
          return;
        }
        await mongoNotifications.update(id, { read: true, isRead: true });
        success = true;
      }
    } catch {
      // Fallback
    }

    if (!success) {
      const rows = await db
        .update(notificationsTable)
        .set({ read: true })
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID)))
        .returning({ id: notificationsTable.id })
        .catch(() => []);
      if (rows.length === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
    }
    res.json({ success: true, message: "Notification marked as read" });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications/:id/read failed");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.patch("/admin/notifications/:id/unread", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "Notification ID is required" });
    return;
  }
  try {
    let success = false;
    try {
      const existing = await mongoNotifications.findById(id);
      if (existing) {
        if (existing.userId && existing.userId !== ADMIN_NOTIFICATION_USER_ID) {
          res.status(403).json({ error: "Forbidden: Notification belongs to another account" });
          return;
        }
        await mongoNotifications.update(id, { read: false, isRead: false });
        success = true;
      }
    } catch {
      // Fallback
    }

    if (!success) {
      const rows = await db
        .update(notificationsTable)
        .set({ read: false })
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID)))
        .returning({ id: notificationsTable.id })
        .catch(() => []);
      if (rows.length === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
    }
    res.json({ success: true, message: "Notification marked as unread" });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications/:id/unread failed");
    res.status(500).json({ error: "Failed to mark notification as unread" });
  }
});

// Clear all admin notifications handler
const handleAdminClearAll = async (req: any, res: any): Promise<void> => {
  try {
    let clearedCount = 0;
    try {
      clearedCount = await mongoNotifications.deleteMany({ userId: ADMIN_NOTIFICATION_USER_ID });
    } catch {}

    try {
      await db
        .delete(notificationsTable)
        .where(eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID))
        .catch(() => []);
    } catch {}

    res.json({ success: true, clearedCount, deletedCount: clearedCount, message: "All admin notifications cleared successfully" });
  } catch (err: any) {
    req.log?.error({ err }, "admin/notifications clear-all failed");
    res.status(500).json({ error: "Failed to clear admin notifications" });
  }
};

router.delete("/admin/notifications/clear-all", requireAdminKey, handleAdminClearAll);
router.delete("/admin/notifications", requireAdminKey, handleAdminClearAll);
router.post("/admin/notifications/clear-all", requireAdminKey, handleAdminClearAll);

router.delete("/admin/notifications/:id", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  if (!id || id === "clear-all") {
    return handleAdminClearAll(req, res);
  }
  try {
    let success = false;
    try {
      const existing = await mongoNotifications.findById(id);
      if (existing) {
        if (existing.userId && existing.userId !== ADMIN_NOTIFICATION_USER_ID) {
          res.status(403).json({ error: "Forbidden: Notification belongs to another account" });
          return;
        }
        success = await mongoNotifications.delete(id);
      }
    } catch {
      // Fallback
    }

    if (!success) {
      const rows = await db
        .delete(notificationsTable)
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID)))
        .returning({ id: notificationsTable.id })
        .catch(() => []);
      if (rows.length === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
    }
    res.json({ success: true, message: "Notification deleted successfully" });
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
