import { Router } from "express";
import { db, mongoNotifications } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, and, desc, sql, inArray, ilike, or, gte, lte } from "drizzle-orm";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";

const router = Router();

function getCandidateVendorIds(req: any): string[] {
  return Array.from(
    new Set(
      [
        req.vendorId,
        req.sellerId,
        req.vendor?.id,
        req.vendor?.vendorId,
        req.vendor?.sellerId,
        req.vendor?.ownerId,
        req.vendor?._id ? String(req.vendor._id) : null,
      ].filter(Boolean)
    )
  );
}

router.get("/seller/notifications/unread-count", requireVendorAuth, async (req: any, res: any) => {
  try {
    const vendorIds = getCandidateVendorIds(req);
    const ownerId = req.vendor?.ownerId || req.userId;
    const allUserIds = Array.from(new Set([...vendorIds, ownerId, req.userId].filter(Boolean)));
    let count = 0;
    try {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationsTable)
        .where(and(inArray(notificationsTable.vendorId, vendorIds), eq(notificationsTable.read, false)));
      count = row?.count ?? 0;
    } catch {}

    if (mongoNotifications) {
      try {
        const mongoCount = await mongoNotifications.count({
          $or: [
            { vendorId: { $in: vendorIds } },
            { userId: { $in: allUserIds } },
          ],
          read: false,
        });
        if (mongoCount > count) count = mongoCount;
      } catch {}
    }

    res.json({ count });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/unread-count failed");
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

router.get("/seller/notifications", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const ownerId = req.vendor?.ownerId || req.userId;
  const allUserIds = Array.from(new Set([...vendorIds, ownerId, req.userId].filter(Boolean)));

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

    const conditions: any[] = [inArray(notificationsTable.vendorId, vendorIds)];
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

    let rows: any[] = [];
    let total = 0;
    try {
      rows = await db
        .select()
        .from(notificationsTable)
        .where(whereClause)
        .orderBy(sql`${notificationsTable.read} ASC`, desc(notificationsTable.createdAt))
        .limit(limit)
        .offset(offset);

      const totalRows = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(notificationsTable)
        .where(whereClause);
      total = totalRows[0]?.total ?? rows.length;
    } catch {}

    if (rows.length === 0 && mongoNotifications) {
      try {
        const mongoFilter: any = {
          $or: [
            { vendorId: { $in: vendorIds } },
            { userId: { $in: allUserIds } },
          ],
        };
        if (types.length > 0) mongoFilter.type = { $in: types };
        const mongoList = await mongoNotifications.findMany(mongoFilter, { skip: offset, limit });
        rows = mongoList.map((m: any) => ({
          id: m.id || m._id,
          type: m.type,
          title: m.title,
          body: m.body,
          read: m.read ?? m.isRead ?? false,
          metadata: m.metadata ?? {},
          createdAt: m.createdAt,
        }));
        total = await mongoNotifications.count(mongoFilter);
      } catch {}
    }

    res.json({ notifications: rows, total, page, limit });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications failed");
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/seller/notifications/read-all", requireVendorAuth, async (req: any, res: any) => {
  const ownerId = req.vendor?.ownerId || req.userId;
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.vendorId, req.vendorId), eq(notificationsTable.read, false)))
      .catch(() => {});
    if (mongoNotifications) {
      await mongoNotifications.markAllRead(req.vendorId).catch(() => {});
      if (ownerId && ownerId !== req.vendorId) {
        await mongoNotifications.markAllRead(ownerId).catch(() => {});
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/read-all failed");
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

router.patch("/seller/notifications/:id/read", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.vendorId, req.vendorId)))
      .catch(() => {});
    if (mongoNotifications) {
      await mongoNotifications.update(id, { read: true, isRead: true }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/:id/read failed");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.patch("/seller/notifications/:id/unread", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    await db
      .update(notificationsTable)
      .set({ read: false })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.vendorId, req.vendorId)))
      .catch(() => {});
    if (mongoNotifications) {
      await mongoNotifications.update(id, { read: false, isRead: false }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/:id/unread failed");
    res.status(500).json({ error: "Failed to mark notification as unread" });
  }
});

router.delete("/seller/notifications/:id", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.vendorId, req.vendorId)))
      .catch(() => {});
    if (mongoNotifications) {
      await mongoNotifications.delete(id).catch(() => {});
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/:id delete failed");
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

// Bulk-delete all notifications for the current vendor
const handleClearSellerNotifications = async (req: any, res: any) => {
  try {
    const vendorIds = getCandidateVendorIds(req);
    const ownerId = req.vendor?.ownerId || req.userId;
    const allUserIds = Array.from(new Set([...vendorIds, ownerId, req.userId].filter(Boolean)));

    let deleted = 0;
    try {
      const result = await db
        .delete(notificationsTable)
        .where(inArray(notificationsTable.vendorId, vendorIds))
        .catch(() => []);
      deleted = result?.length ?? 0;
    } catch {}

    if (mongoNotifications) {
      try {
        const mCount = await mongoNotifications.deleteMany({
          $or: [
            { vendorId: { $in: vendorIds } },
            { userId: { $in: allUserIds } },
          ],
        });
        if (typeof mCount === "number" && mCount > 0) {
          deleted = Math.max(deleted, mCount);
        }
      } catch {}
    }

    res.json({ success: true, deleted });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications bulk delete failed");
    res.status(500).json({ error: "Failed to clear notifications" });
  }
};

router.delete("/seller/notifications", requireVendorAuth, handleClearSellerNotifications);
router.delete("/seller/notifications/clear-all", requireVendorAuth, handleClearSellerNotifications);
router.post("/seller/notifications/clear-all", requireVendorAuth, handleClearSellerNotifications);

export default router;
