import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable, ADMIN_NOTIFICATION_USER_ID } from "@workspace/db";
import { eq, and, desc, sql, inArray, ilike, or, gte, lte } from "drizzle-orm";

const router = Router();

const requireAdminKey = (req: any, res: any, next: any) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

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

export default router;
