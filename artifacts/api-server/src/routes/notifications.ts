import { Router } from "express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { db, mongoGeneric } from "@workspace/db";
import { notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { eq, and, desc, sql, inArray, ilike, or, gte, lte, isNull } from "@workspace/db";

const router = Router();

router.get("/notifications/unread-count", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    try {
      const col = mongoGeneric.getCollection("notifications");
      const count = await col.countDocuments({ userId: req.userId, $or: [{ isRead: false }, { read: false }], vendorId: null });
      res.json({ count });
      return;
    } catch {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationsTable)
        .where(and(
          eq(notificationsTable.userId, req.userId),
          eq(notificationsTable.read, false),
          isNull(notificationsTable.vendorId),
        ));
      res.json({ count: row?.count ?? 0 });
    }
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

    try {
      const col = mongoGeneric.getCollection("notifications");
      const filter: any = { userId: req.userId, vendorId: null };

      if (rawType) {
        const types = (Array.isArray(rawType) ? rawType : String(rawType).split(",")).map(String).filter(Boolean);
        if (types.length > 0) filter.type = { $in: types };
      }

      const total = await col.countDocuments(filter);
      const rows = await col.find(filter).sort({ isRead: 1, createdAt: -1 }).skip(offset).limit(limit).toArray();
      res.json({ notifications: rows, total, page, limit });
      return;
    } catch {
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
    }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch notifications");
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/notifications/read-all", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    try {
      const col = mongoGeneric.getCollection("notifications");
      await col.updateMany({ userId: req.userId, vendorId: null }, { $set: { isRead: true, read: true } });
      res.json({ success: true });
      return;
    } catch {
      await db
        .update(notificationsTable)
        .set({ read: true })
        .where(and(
          eq(notificationsTable.userId, req.userId),
          eq(notificationsTable.read, false),
          isNull(notificationsTable.vendorId),
        ));
      res.json({ success: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications as read");
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    try {
      const col = mongoGeneric.getCollection("notifications");
      const resDoc = await col.updateOne({ $or: [{ id }, { _id: id as any }], userId: req.userId }, { $set: { isRead: true, read: true } });
      if (resDoc.matchedCount === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
      res.json({ success: true });
      return;
    } catch {
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
    }
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification as read");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.patch("/notifications/:id/unread", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    try {
      const col = mongoGeneric.getCollection("notifications");
      const resDoc = await col.updateOne({ $or: [{ id }, { _id: id as any }], userId: req.userId }, { $set: { isRead: false, read: false } });
      if (resDoc.matchedCount === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
      res.json({ success: true });
      return;
    } catch {
      const rows = await db
        .update(notificationsTable)
        .set({ read: false })
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId)))
        .returning({ id: notificationsTable.id });
      if (rows.length === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
      res.json({ success: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification as unread");
    res.status(500).json({ error: "Failed to mark notification as unread" });
  }
});

router.delete("/notifications/:id", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    try {
      const col = mongoGeneric.getCollection("notifications");
      const resDoc = await col.deleteOne({ $or: [{ id }, { _id: id as any }], userId: req.userId });
      if (resDoc.deletedCount === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
      res.json({ success: true });
      return;
    } catch {
      const rows = await db
        .delete(notificationsTable)
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId)))
        .returning({ id: notificationsTable.id });
      if (rows.length === 0) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }
      res.json({ success: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to delete notification");
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

router.get("/notifications/preferences", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    try {
      const col = mongoGeneric.getCollection("notification_preferences");
      const prefDoc = await col.findOne({ userId: req.userId });
      if (!prefDoc) {
        res.json({ orderUpdates: true, offerAlerts: true, stockAlerts: true, emailOrderUpdates: true, emailMarketingUpdates: true, emailOfferUpdates: true, emailStockAlerts: true });
      } else {
        const { orderUpdates, offerAlerts, stockAlerts, emailOrderUpdates, emailMarketingUpdates, emailOfferUpdates, emailStockAlerts } = prefDoc;
        res.json({ orderUpdates: orderUpdates ?? true, offerAlerts: offerAlerts ?? true, stockAlerts: stockAlerts ?? true, emailOrderUpdates: emailOrderUpdates ?? true, emailMarketingUpdates: emailMarketingUpdates ?? true, emailOfferUpdates: emailOfferUpdates ?? true, emailStockAlerts: emailStockAlerts ?? true });
      }
      return;
    } catch {
      const rows = await db
        .select()
        .from(notificationPreferencesTable)
        .where(eq(notificationPreferencesTable.userId, req.userId))
        .limit(1);

      if (rows.length === 0) {
        res.json({ orderUpdates: true, offerAlerts: true, stockAlerts: true, emailOrderUpdates: true, emailMarketingUpdates: true, emailOfferUpdates: true, emailStockAlerts: true });
      } else {
        const { orderUpdates, offerAlerts, stockAlerts, emailOrderUpdates, emailMarketingUpdates, emailOfferUpdates, emailStockAlerts } = rows[0];
        res.json({ orderUpdates, offerAlerts, stockAlerts, emailOrderUpdates, emailMarketingUpdates, emailOfferUpdates, emailStockAlerts });
      }
    }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch notification preferences");
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
});

router.patch("/notifications/preferences", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const { orderUpdates, offerAlerts, stockAlerts, emailOrderUpdates, emailMarketingUpdates, emailOfferUpdates, emailStockAlerts } = req.body;

    try {
      const col = mongoGeneric.getCollection("notification_preferences");
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof orderUpdates === "boolean") updates.orderUpdates = orderUpdates;
      if (typeof offerAlerts === "boolean") updates.offerAlerts = offerAlerts;
      if (typeof stockAlerts === "boolean") updates.stockAlerts = stockAlerts;
      if (typeof emailOrderUpdates === "boolean") updates.emailOrderUpdates = emailOrderUpdates;
      if (typeof emailMarketingUpdates === "boolean") updates.emailMarketingUpdates = emailMarketingUpdates;
      if (typeof emailOfferUpdates === "boolean") updates.emailOfferUpdates = emailOfferUpdates;
      if (typeof emailStockAlerts === "boolean") updates.emailStockAlerts = emailStockAlerts;

      await col.updateOne(
        { userId: req.userId },
        {
          $set: updates,
          $setOnInsert: {
            userId: req.userId,
            orderUpdates: typeof orderUpdates === "boolean" ? orderUpdates : true,
            offerAlerts: typeof offerAlerts === "boolean" ? offerAlerts : true,
            stockAlerts: typeof stockAlerts === "boolean" ? stockAlerts : true,
            emailOrderUpdates: typeof emailOrderUpdates === "boolean" ? emailOrderUpdates : true,
            emailMarketingUpdates: typeof emailMarketingUpdates === "boolean" ? emailMarketingUpdates : true,
            emailOfferUpdates: typeof emailOfferUpdates === "boolean" ? emailOfferUpdates : true,
            emailStockAlerts: typeof emailStockAlerts === "boolean" ? emailStockAlerts : true,
            createdAt: new Date(),
          }
        },
        { upsert: true }
      );
      res.json({ success: true });
      return;
    } catch {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof orderUpdates === "boolean") updates.orderUpdates = orderUpdates;
      if (typeof offerAlerts === "boolean") updates.offerAlerts = offerAlerts;
      if (typeof stockAlerts === "boolean") updates.stockAlerts = stockAlerts;
      if (typeof emailOrderUpdates === "boolean") updates.emailOrderUpdates = emailOrderUpdates;
      if (typeof emailMarketingUpdates === "boolean") updates.emailMarketingUpdates = emailMarketingUpdates;
      if (typeof emailOfferUpdates === "boolean") updates.emailOfferUpdates = emailOfferUpdates;
      if (typeof emailStockAlerts === "boolean") updates.emailStockAlerts = emailStockAlerts;

      await db
        .insert(notificationPreferencesTable)
        .values({
          userId: req.userId,
          orderUpdates: typeof orderUpdates === "boolean" ? orderUpdates : true,
          offerAlerts: typeof offerAlerts === "boolean" ? offerAlerts : true,
          stockAlerts: typeof stockAlerts === "boolean" ? stockAlerts : true,
          emailOrderUpdates: typeof emailOrderUpdates === "boolean" ? emailOrderUpdates : true,
          emailMarketingUpdates: typeof emailMarketingUpdates === "boolean" ? emailMarketingUpdates : true,
          emailOfferUpdates: typeof emailOfferUpdates === "boolean" ? emailOfferUpdates : true,
          emailStockAlerts: typeof emailStockAlerts === "boolean" ? emailStockAlerts : true,
        })
        .onConflictDoUpdate({
          target: notificationPreferencesTable.userId,
          set: updates,
        });

      res.json({ success: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update notification preferences");
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

export default router;
