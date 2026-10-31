import { db, mongoNotifications, mongoSellers } from "@workspace/db";
import { notificationsTable, vendorsTable, ADMIN_NOTIFICATION_USER_ID } from "@workspace/db";
import type { SupportTicket, TicketNotificationType, AdminNotificationType, SellerNotificationType } from "@workspace/db";
import { eq } from "drizzle-orm";

type NotifyTicketEventType = TicketNotificationType | AdminNotificationType | SellerNotificationType;

export const SLA_HOURS = 48;

export function computeSlaDueAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + SLA_HOURS * 60 * 60 * 1000);
}

// Statuses where the seller currently owes the customer a response.
// "Waiting for Customer" means the ball is in the customer's court, so it
// must never be treated as an SLA breach against the seller.
const SELLER_OWES_RESPONSE_STATUSES = new Set(["Open", "In Progress"]);

export function isPastSla(ticket: Pick<SupportTicket, "slaDueAt" | "status" | "escalated" | "assignedTo">): boolean {
  if (!ticket.slaDueAt || ticket.escalated) return false;
  if (ticket.assignedTo !== "seller") return false;
  if (!SELLER_OWES_RESPONSE_STATUSES.has(ticket.status)) return false;
  return new Date(ticket.slaDueAt).getTime() < Date.now();
}

async function insertNotification(opts: {
  userId: string;
  vendorId?: string | null;
  type: NotifyTicketEventType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  await mongoNotifications.insert({
    userId: opts.userId,
    vendorId: opts.vendorId ?? null,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    metadata: opts.metadata ?? {},
  }).catch(() => {});

  await db.insert(notificationsTable).values({
    userId: opts.userId,
    vendorId: opts.vendorId ?? null,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    metadata: opts.metadata ?? {},
  }).catch(() => {});

  try {
    const { emitNotificationEvent } = await import("./socket");
    emitNotificationEvent({
      recipientRole: opts.userId === ADMIN_NOTIFICATION_USER_ID ? "admin" : (opts.vendorId ? "vendor" : "user"),
      recipientId: opts.userId,
      title: opts.title,
      message: opts.body,
      data: { type: opts.type, metadata: opts.metadata },
    });
  } catch {}
}

/**
 * Notifies the current owner of a ticket (customer, the assigned vendor's owner,
 * or the admin sentinel inbox) about a lifecycle event.
 */
export async function notifyTicketEvent(
  ticket: Pick<SupportTicket, "id" | "userId" | "userType" | "vendorId" | "assignedTo" | "subject">,
  type: NotifyTicketEventType,
  title: string,
  body: string,
  opts: { notifyCustomer?: boolean; notifySeller?: boolean; notifyAdmin?: boolean } = {}
): Promise<void> {
  const { notifyCustomer, notifySeller, notifyAdmin } = opts;
  const metadata = { ticketId: ticket.id };

  if (notifyCustomer && ticket.userType === "customer") {
    await insertNotification({ userId: ticket.userId, type, title, body, metadata });
    try {
      const emailType =
        type === "ticket_replied"
          ? ("support_ticket_reply" as const)
          : type === "ticket_status_changed" || type === "ticket_resolved" || type === "ticket_closed"
          ? ("support_ticket_status" as const)
          : type === "ticket_created"
          ? ("support_ticket_created" as const)
          : null;

      if (emailType) {
        const { sendSupportTicketEmail } = await import("./transactionalEmail");
        void sendSupportTicketEmail({
          userId: ticket.userId,
          type: emailType,
          ticketId: ticket.id,
          ticketSubject: ticket.subject,
          status: type.replace("ticket_", ""),
          messagePreview: body,
        });
      }
    } catch {}
  }

  if (notifySeller && ticket.vendorId) {
    let ownerId: string | null = null;
    try {
      const seller =
        (await mongoSellers.findById?.(ticket.vendorId)) ||
        (await mongoSellers.findByVendorId?.(ticket.vendorId)) ||
        (await mongoSellers.findBySellerId?.(ticket.vendorId)) ||
        (await mongoSellers.findByOwnerId?.(ticket.vendorId));
      ownerId = seller?.ownerId || seller?.userId || seller?.id || null;
    } catch {
      // Fallback
    }
    if (!ownerId) {
      const [vendor] = await db
        .select({ ownerId: vendorsTable.ownerId })
        .from(vendorsTable)
        .where(eq(vendorsTable.id, ticket.vendorId))
        .limit(1)
        .catch(() => []);
      ownerId = vendor?.ownerId || null;
    }
    const targetUserId = ownerId || ticket.vendorId;
    await insertNotification({ userId: targetUserId, vendorId: ticket.vendorId, type, title, body, metadata });
    if (ownerId && ownerId !== ticket.vendorId) {
      await insertNotification({ userId: ticket.vendorId, vendorId: ticket.vendorId, type, title, body, metadata }).catch(() => {});
    }
  }

  if (notifyAdmin) {
    await insertNotification({ userId: ADMIN_NOTIFICATION_USER_ID, type, title, body, metadata });
  }
}
