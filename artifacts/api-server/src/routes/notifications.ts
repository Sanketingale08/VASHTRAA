import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};

router.get("/notifications/unread-count", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, req.userId), eq(notificationsTable.read, false)));
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch unread count");
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

router.get("/notifications", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const rawType = req.query.type;
    const offset = (page - 1) * limit;

    // rawType may be a string or array (Express parses repeated ?type= as array)
    const types: string[] = rawType
      ? (Array.isArray(rawType) ? rawType : String(rawType).split(",")).map(String).filter(Boolean)
      : [];

    let whereClause = eq(notificationsTable.userId, req.userId) as any;
    if (types.length > 0) {
      const typeFilter = types.length === 1
        ? eq(notificationsTable.type, types[0] as any)
        : inArray(notificationsTable.type, types as any[]);
      whereClause = and(eq(notificationsTable.userId, req.userId), typeFilter);
    }

    const rows = await db
      .select()
      .from(notificationsTable)
      .where(whereClause)
      .orderBy(
        sql`${notificationsTable.read} ASC`,
        desc(notificationsTable.createdAt)
      )
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(whereClause);

    res.json({ notifications: rows, total, page, limit });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch notifications");
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/notifications/read-all", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.userId, req.userId), eq(notificationsTable.read, false)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications as read");
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const rows = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId)))
      .returning({ id: notificationsTable.id });
    if (rows.length === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification as read");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.delete("/notifications/:id", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const rows = await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId)))
      .returning({ id: notificationsTable.id });
    if (rows.length === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete notification");
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

router.get("/notifications/preferences", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, req.userId))
      .limit(1);

    if (rows.length === 0) {
      res.json({ orderUpdates: true, offerAlerts: true, stockAlerts: true });
    } else {
      const { orderUpdates, offerAlerts, stockAlerts } = rows[0];
      res.json({ orderUpdates, offerAlerts, stockAlerts });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch notification preferences");
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
});

router.patch("/notifications/preferences", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const { orderUpdates, offerAlerts, stockAlerts } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof orderUpdates === "boolean") updates.orderUpdates = orderUpdates;
    if (typeof offerAlerts === "boolean") updates.offerAlerts = offerAlerts;
    if (typeof stockAlerts === "boolean") updates.stockAlerts = stockAlerts;

    await db
      .insert(notificationPreferencesTable)
      .values({
        userId: req.userId,
        orderUpdates: typeof orderUpdates === "boolean" ? orderUpdates : true,
        offerAlerts: typeof offerAlerts === "boolean" ? offerAlerts : true,
        stockAlerts: typeof stockAlerts === "boolean" ? stockAlerts : true,
      })
      .onConflictDoUpdate({
        target: notificationPreferencesTable.userId,
        set: updates,
      });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update notification preferences");
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

export default router;
