import { db } from "@workspace/db";
import { notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type OrderNotifType = "order_shipped" | "order_delivered" | "order_cancelled";

interface InsertOrderNotificationOpts {
  tx?: any;
  userId: string;
  type: OrderNotifType;
  orderId: string;
  itemName: string;
  extraItemCount: number;
}

function buildNotifContent(
  type: OrderNotifType,
  itemName: string,
  extra: string
): { title: string; body: string } {
  switch (type) {
    case "order_shipped":
      return {
        title: "Order shipped",
        body: `${itemName}${extra} has been dispatched and is on its way to you.`,
      };
    case "order_delivered":
      return {
        title: "Order delivered",
        body: `${itemName}${extra} has been delivered. Enjoy your purchase!`,
      };
    case "order_cancelled":
      return {
        title: "Order cancelled",
        body: `Your order for ${itemName}${extra} has been cancelled.`,
      };
  }
}

export async function insertOrderStatusNotification(
  opts: InsertOrderNotificationOpts
): Promise<void> {
  const { userId, type, orderId, itemName, extraItemCount } = opts;
  const client = opts.tx ?? db;

  const prefs = await client
    .select({ orderUpdates: notificationPreferencesTable.orderUpdates })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);

  const wantsOrderUpdates = prefs.length === 0 || prefs[0].orderUpdates;
  if (!wantsOrderUpdates) return;

  const extra = extraItemCount > 0 ? ` and ${extraItemCount} more item(s)` : "";
  const { title, body } = buildNotifContent(type, itemName, extra);

  await client.insert(notificationsTable).values({
    userId,
    type,
    title,
    body,
    metadata: { orderId },
  });
}
