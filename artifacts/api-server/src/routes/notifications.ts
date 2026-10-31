import { Router } from "express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { db, mongoGeneric, mongoNotifications, mongoNotificationPreferences, isMongoDbConnected } from "@workspace/db";
import { notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { eq, and, desc, sql, inArray, isNull } from "@workspace/db";

const router = Router();

router.get("/notifications/unread-count", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const mongoActive = (typeof isMongoDbConnected === "function" && isMongoDbConnected()) || ((mongoNotifications?.inMemoryNotificationsMap?.size ?? 0) > 0);
    if (mongoActive && mongoNotifications?.count) {
      try {
        const count = await mongoNotifications.count({
          userId: req.userId,
          vendorId: null,
          $or: [{ isRead: false }, { read: false }],
        });
        res.json({ count });
        return;
      } catch {}
    }

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, req.userId),
        eq(notificationsTable.read, false),
        isNull(notificationsTable.vendorId),
      ));
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to fetch unread count");
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

router.get("/notifications", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const rawType = req.query.type;
    const offset = (page - 1) * limit;

    const mongoActive = (typeof isMongoDbConnected === "function" && isMongoDbConnected()) || ((mongoNotifications?.inMemoryNotificationsMap?.size ?? 0) > 0);
    if (mongoActive && mongoNotifications?.findMany) {
      try {
        const filter: any = { userId: req.userId, vendorId: null };

        if (rawType) {
          const types = (Array.isArray(rawType) ? rawType : String(rawType).split(",")).map(String).filter(Boolean);
          if (types.length > 0) filter.type = { $in: types };
        }

        const total = await mongoNotifications.count(filter);
        const rows = await mongoNotifications.findMany(filter, { sort: { isRead: 1, createdAt: -1 }, skip: offset, limit });
        res.json({ notifications: rows, total, page, limit });
        return;
      } catch {}
    }
      const types: string[] = rawType
        ? (Array.isArray(rawType) ? rawType : String(rawType).split(",")).map(String).filter(Boolean)
        : [];

      const conditions: any[] = [
        eq(notificationsTable.userId, req.userId),
        isNull(notificationsTable.vendorId),
      ];
      if (types.length === 1) conditions.push(eq(notificationsTable.type, types[0] as any));
      else if (types.length > 1) conditions.push(inArray(notificationsTable.type, types as any[]));
      const whereClause = and(...conditions);

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
    req.log?.error?.({ err }, "Failed to fetch notifications");
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/notifications/read-all", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    try {
      await mongoNotifications.markAllRead(req.userId, { vendorId: null });
    } catch {}
    try {
      await db
        .update(notificationsTable)
        .set({ read: true })
        .where(and(
          eq(notificationsTable.userId, req.userId),
          isNull(notificationsTable.vendorId),
        ))
        .catch(() => {});
    } catch {}
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to mark all notifications as read");
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req: any, res: any): Promise<void> => {
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
        if (existing.userId !== req.userId) {
          res.status(403).json({ error: "Forbidden: Notification belongs to another account" });
          return;
        }
        const updated = await mongoNotifications.update(id, { isRead: true, read: true });
        res.json({ success: true, notification: updated || { ...existing, read: true, isRead: true }, message: "Notification marked as read" });
        return;
      }
    } catch {
      // Fallback
    }

    const rows = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId)))
      .returning({ id: notificationsTable.id })
      .catch(() => []);
    if (rows.length === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ success: true, notification: { id, read: true, isRead: true }, message: "Notification marked as read" });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to mark notification as read");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.patch("/notifications/:id/unread", requireAuth, async (req: any, res: any): Promise<void> => {
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
        if (existing.userId !== req.userId) {
          res.status(403).json({ error: "Forbidden: Notification belongs to another account" });
          return;
        }
        await mongoNotifications.update(id, { isRead: false, read: false });
        success = true;
      }
    } catch {
      // Fallback
    }

    if (!success) {
      const rows = await db
        .update(notificationsTable)
        .set({ read: false })
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId)))
        .returning({ id: notificationsTable.id })
        .catch(() => []);
      if (rows.length === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
    }
    res.json({ success: true, message: "Notification marked as unread" });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to mark notification as unread");
    res.status(500).json({ error: "Failed to mark notification as unread" });
  }
});

// Clear all user notifications handler (scoped strictly to authenticated user, non-vendor)
const handleUserClearAll = async (req: any, res: any): Promise<void> => {
  try {
    let clearedCount = 0;
    try {
      clearedCount = await mongoNotifications.deleteMany({
        userId: req.userId,
        $or: [{ vendorId: null }, { vendorId: { $exists: false } }],
      });
    } catch {}

    try {
      await db
        .delete(notificationsTable)
        .where(and(
          eq(notificationsTable.userId, req.userId),
          isNull(notificationsTable.vendorId)
        ))
        .catch(() => []);
    } catch {}

    res.json({ success: true, clearedCount, deletedCount: clearedCount, message: "All notifications cleared successfully" });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to clear notifications");
    res.status(500).json({ error: "Failed to clear notifications" });
  }
};

router.delete("/notifications/clear-all", requireAuth, handleUserClearAll);
router.delete("/notifications", requireAuth, handleUserClearAll);
router.post("/notifications/clear-all", requireAuth, handleUserClearAll);

router.delete("/notifications/:id", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  if (!id || id === "clear-all") {
    return handleUserClearAll(req, res);
  }
  try {
    let success = false;
    try {
      const existing = await mongoNotifications.findById(id);
      if (existing) {
        if (existing.userId !== req.userId) {
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
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId)))
        .returning({ id: notificationsTable.id })
        .catch(() => []);
      if (rows.length === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
    }
    res.json({ success: true, message: "Notification deleted successfully" });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to delete notification");
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

router.get("/notifications/preferences", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const prefs = await mongoNotificationPreferences.findByUserId(req.userId);
    res.json({
      orderUpdates: prefs.orderUpdates,
      offerAlerts: prefs.offerAlerts,
      emailOrderUpdates: prefs.emailOrderUpdates,
      emailMarketingUpdates: prefs.emailMarketingUpdates,
      emailOfferUpdates: prefs.emailOfferUpdates,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to fetch notification preferences");
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
});

router.patch("/notifications/preferences", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const { orderUpdates, offerAlerts, emailOrderUpdates, emailMarketingUpdates, emailOfferUpdates } = req.body || {};

    const updates: Partial<{
      orderUpdates: boolean;
      offerAlerts: boolean;
      emailOrderUpdates: boolean;
      emailMarketingUpdates: boolean;
      emailOfferUpdates: boolean;
    }> = {};

    if (typeof orderUpdates === "boolean") updates.orderUpdates = orderUpdates;
    if (typeof offerAlerts === "boolean") updates.offerAlerts = offerAlerts;
    if (typeof emailOrderUpdates === "boolean") updates.emailOrderUpdates = emailOrderUpdates;
    if (typeof emailMarketingUpdates === "boolean") updates.emailMarketingUpdates = emailMarketingUpdates;
    if (typeof emailOfferUpdates === "boolean") updates.emailOfferUpdates = emailOfferUpdates;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid preference fields provided to update" });
      return;
    }

    const saved = await mongoNotificationPreferences.upsert(req.userId, updates);

    const activePreferences = {
      orderUpdates: saved.orderUpdates,
      offerAlerts: saved.offerAlerts,
      emailOrderUpdates: saved.emailOrderUpdates,
      emailMarketingUpdates: saved.emailMarketingUpdates,
      emailOfferUpdates: saved.emailOfferUpdates,
    };

    // Also update SQL table fallback if exists
    try {
      await db
        .insert(notificationPreferencesTable)
        .values({
          userId: req.userId,
          orderUpdates: activePreferences.orderUpdates,
          offerAlerts: activePreferences.offerAlerts,
          emailOrderUpdates: activePreferences.emailOrderUpdates,
          emailMarketingUpdates: activePreferences.emailMarketingUpdates,
          emailOfferUpdates: activePreferences.emailOfferUpdates,
        })
        .onConflictDoUpdate({
          target: notificationPreferencesTable.userId,
          set: updates,
        });
    } catch {}

    res.json({
      success: true,
      preferences: activePreferences,
      ...activePreferences,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to update notification preferences");
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

export default router;
