import { db, mongoGeneric, mongoNotifications, mongoNotificationPreferences } from "@workspace/db";
import { notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendTransactionalEmail, type TransactionalEmailType } from "./transactionalEmail";

type OrderNotifType =
  | "order_placed"
  | "order_confirmed"
  | "order_processing"
  | "order_packed"
  | "order_shipped"
  | "out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "refund_completed"
  | "payment_successful"
  | "payment_failed"
  | "vendor_item_rejected";

const EMAIL_TYPES = new Set<OrderNotifType>([
  "order_placed",
  "order_confirmed",
  "order_processing",
  "order_packed",
  "order_shipped",
  "out_for_delivery",
  "order_delivered",
  "order_cancelled",
  "vendor_item_rejected",
  "return_requested",
  "return_approved",
  "return_rejected",
  "refund_requested",
  "refund_approved",
  "refund_rejected",
  "refund_completed",
  "payment_successful",
  "payment_failed",
]);

interface InsertOrderNotificationOpts {
  tx?: any;
  userId: string;
  type: OrderNotifType;
  orderId: string;
  itemName: string;
  extraItemCount: number;
  totalAmount?: number;
  trackingNumber?: string;
  carrier?: string;
  note?: string;
  invoiceAttachment?: { filename: string; content: Buffer };
  customerEmail?: string;
  toEmail?: string;
}

function buildNotifContent(
  type: OrderNotifType,
  itemName: string,
  extra: string
): { title: string; body: string } {
  switch (type) {
    case "order_placed":
      return {
        title: "Order placed successfully",
        body: `We have received your order for ${itemName}${extra}. Thank you for shopping with VASTRAA!`,
      };
    case "order_confirmed":
      return {
        title: "Order confirmed",
        body: `Your order for ${itemName}${extra} has been confirmed.`,
      };
    case "order_processing":
      return {
        title: "Order processing",
        body: `Your order for ${itemName}${extra} is being processed.`,
      };
    case "order_packed":
      return {
        title: "Order packed",
        body: `Your order for ${itemName}${extra} has been packed and will ship soon.`,
      };
    case "order_shipped":
      return {
        title: "Order shipped",
        body: `Your order for ${itemName}${extra} has been shipped.`,
      };
    case "out_for_delivery":
      return {
        title: "Out for delivery",
        body: `Your order for ${itemName}${extra} is out for delivery.`,
      };
    case "order_delivered":
      return {
        title: "Order delivered",
        body: `Your order for ${itemName}${extra} has been delivered.`,
      };
    case "order_cancelled":
      return {
        title: "Order cancelled",
        body: `Your order for ${itemName}${extra} has been cancelled.`,
      };
    case "return_requested":
      return {
        title: "Return requested",
        body: `Your return request for ${itemName}${extra} has been received and is under review.`,
      };
    case "return_approved":
      return {
        title: "Return approved",
        body: `Your return request for ${itemName}${extra} has been approved.`,
      };
    case "return_rejected":
      return {
        title: "Return rejected",
        body: `Your return request for ${itemName}${extra} could not be approved. Please contact support.`,
      };
    case "refund_requested":
      return {
        title: "Refund requested",
        body: `Your refund request for ${itemName}${extra} has been received and is under review.`,
      };
    case "refund_approved":
      return {
        title: "Refund approved",
        body: `Your refund for ${itemName}${extra} has been approved.`,
      };
    case "refund_rejected":
      return {
        title: "Refund not approved",
        body: `Your refund request for ${itemName}${extra} could not be processed. Please contact support.`,
      };
    case "refund_completed":
      return {
        title: "Refund completed",
        body: `Your refund for ${itemName}${extra} has been completed.`,
      };
    case "payment_successful":
      return {
        title: "Payment successful",
        body: `Your payment for ${itemName}${extra} was successful.`,
      };
    case "payment_failed":
      return {
        title: "Payment unsuccessful",
        body: `Payment for your order with ${itemName}${extra} could not be completed. Please retry to secure your order.`,
      };
    case "vendor_item_rejected":
      return {
        title: "Item(s) unavailable",
        body: `A seller has notified us that ${itemName}${extra} cannot be fulfilled. Your order has been updated.`,
      };
  }
}

export async function insertOrderStatusNotification(
  opts: InsertOrderNotificationOpts
): Promise<void> {
  const { userId, type, orderId, itemName, extraItemCount, trackingNumber } = opts;

  let wantsOrderUpdates = true;
  let wantsEmailOrderUpdates = true;

  try {
    const prefs = await mongoNotificationPreferences.findByUserId(userId);
    if (prefs.orderUpdates === false) wantsOrderUpdates = false;
    if (prefs.emailOrderUpdates === false) wantsEmailOrderUpdates = false;
  } catch {}

  try {
    const client = opts.tx ?? db;
    const prefs = await client
      .select({
        orderUpdates: notificationPreferencesTable.orderUpdates,
        emailOrderUpdates: notificationPreferencesTable.emailOrderUpdates,
      })
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, userId))
      .limit(1);

    if (prefs && prefs.length > 0) {
      if (prefs[0].orderUpdates === false) wantsOrderUpdates = false;
      if (prefs[0].emailOrderUpdates === false) wantsEmailOrderUpdates = false;
    }
  } catch {}

  if (!wantsOrderUpdates) return;

  const extra = extraItemCount > 0 ? ` and ${extraItemCount} more item(s)` : "";
  const { title, body } = buildNotifContent(type, itemName, extra);

  const id = crypto.randomUUID();
  const notifDoc = {
    id,
    userId,
    type,
    title,
    body,
    read: false,
    isRead: false,
    metadata: { orderId },
    createdAt: new Date(),
  };

  // 1. Always persist to MongoDB (the primary source for notification bell & lists)
  try {
    if (typeof mongoNotifications !== "undefined") {
      if (typeof (mongoNotifications as any).insert === "function") {
        await (mongoNotifications as any).insert(notifDoc);
      } else if (typeof (mongoNotifications as any).create === "function") {
        await (mongoNotifications as any).create(notifDoc);
      }
    }
  } catch {}

  // 2. Also persist to relational notificationsTable
  try {
    const client = opts.tx ?? db;
    if (client && typeof client.insert === "function") {
      await client.insert(notificationsTable).values({
        id,
        userId,
        type,
        title,
        body,
        metadata: { orderId },
      });
    }
  } catch {}

  // 3. Emit real-time notification events to customer bell via socket
  try {
    const { emitNotificationEvent, emitUserEvent } = await import("./socket");
    emitNotificationEvent({
      recipientRole: "user",
      recipientId: userId,
      title,
      message: body,
      data: { id, orderId, type },
    });
    emitUserEvent(userId, "notification:new", notifDoc);
  } catch {}

  // 2. Transactional / notification email: gated strictly by emailOrderUpdates
  if (EMAIL_TYPES.has(type) && wantsEmailOrderUpdates) {
    void sendTransactionalEmail({
      userId,
      toEmail: opts.customerEmail || opts.toEmail,
      type: type as TransactionalEmailType,
      orderId,
      itemName,
      extraItemCount,
      totalAmount: opts.totalAmount,
      trackingNumber: opts.trackingNumber,
      carrier: opts.carrier,
      reference: trackingNumber,
      note: opts.note,
      attachments: opts.invoiceAttachment ? [opts.invoiceAttachment] : undefined,
    });
  }
}
