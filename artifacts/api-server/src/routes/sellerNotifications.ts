import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, and, desc, sql, inArray, ilike, or } from "drizzle-orm";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";

const router = Router();

router.get("/seller/notifications/unread-count", requireVendorAuth, async (req: any, res: any) => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.vendorId, req.vendorId), eq(notificationsTable.read, false)));
    res.json({ count: row?.count ?? 0 });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/unread-count failed");
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

router.get("/seller/notifications", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string | undefined)?.trim();

    const rawType = req.query.type;
    const types: string[] = rawType
      ? (Array.isArray(rawType) ? rawType : String(rawType).split(",")).map(String).filter(Boolean)
      : [];

    const conditions: any[] = [eq(notificationsTable.vendorId, vendorId)];
    if (types.length === 1) conditions.push(eq(notificationsTable.type, types[0] as any));
    else if (types.length > 1) conditions.push(inArray(notificationsTable.type, types as any));
    if (search) {
      conditions.push(
        or(ilike(notificationsTable.title, `%${search}%`), ilike(notificationsTable.body, `%${search}%`))
      );
    }
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
    req.log?.error({ err }, "seller/notifications failed");
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/seller/notifications/read-all", requireVendorAuth, async (req: any, res: any) => {
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.vendorId, req.vendorId), eq(notificationsTable.read, false)));
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/read-all failed");
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

router.patch("/seller/notifications/:id/read", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const rows = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.vendorId, req.vendorId)))
      .returning({ id: notificationsTable.id });
    if (rows.length === 0) return res.status(404).json({ error: "Notification not found" });
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/:id/read failed");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.patch("/seller/notifications/:id/unread", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const rows = await db
      .update(notificationsTable)
      .set({ read: false })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.vendorId, req.vendorId)))
      .returning({ id: notificationsTable.id });
    if (rows.length === 0) return res.status(404).json({ error: "Notification not found" });
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/:id/unread failed");
    res.status(500).json({ error: "Failed to mark notification as unread" });
  }
});

router.delete("/seller/notifications/:id", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const rows = await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.vendorId, req.vendorId)))
      .returning({ id: notificationsTable.id });
    if (rows.length === 0) return res.status(404).json({ error: "Notification not found" });
    res.json({ success: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/notifications/:id delete failed");
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

export default router;
