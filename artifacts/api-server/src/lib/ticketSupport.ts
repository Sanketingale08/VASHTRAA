import { db } from "@workspace/db";
import { notificationsTable, vendorsTable, ADMIN_NOTIFICATION_USER_ID } from "@workspace/db";
import type { SupportTicket, TicketNotificationType } from "@workspace/db";
import { eq } from "drizzle-orm";

export const SLA_HOURS = 48;

export function computeSlaDueAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + SLA_HOURS * 60 * 60 * 1000);
}

export function isPastSla(ticket: Pick<SupportTicket, "slaDueAt" | "status" | "escalated" | "assignedTo">): boolean {
  if (!ticket.slaDueAt || ticket.escalated) return false;
  if (ticket.assignedTo !== "seller") return false;
  if (ticket.status === "Resolved" || ticket.status === "Closed") return false;
  return new Date(ticket.slaDueAt).getTime() < Date.now();
}

async function insertNotification(opts: {
  userId: string;
  vendorId?: string | null;
  type: TicketNotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(notificationsTable).values({
    userId: opts.userId,
    vendorId: opts.vendorId ?? null,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    metadata: opts.metadata ?? {},
  });
}

/**
 * Notifies the current owner of a ticket (customer, the assigned vendor's owner,
 * or the admin sentinel inbox) about a lifecycle event.
 */
export async function notifyTicketEvent(
  ticket: Pick<SupportTicket, "id" | "userId" | "userType" | "vendorId" | "assignedTo" | "subject">,
  type: TicketNotificationType,
  title: string,
  body: string,
  opts: { notifyCustomer?: boolean; notifySeller?: boolean; notifyAdmin?: boolean } = {}
): Promise<void> {
  const { notifyCustomer, notifySeller, notifyAdmin } = opts;
  const metadata = { ticketId: ticket.id };

  if (notifyCustomer && ticket.userType === "customer") {
    await insertNotification({ userId: ticket.userId, type, title, body, metadata });
  }

  if (notifySeller && ticket.vendorId) {
    const [vendor] = await db
      .select({ ownerId: vendorsTable.ownerId })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, ticket.vendorId))
      .limit(1);
    if (vendor?.ownerId) {
      await insertNotification({ userId: vendor.ownerId, vendorId: ticket.vendorId, type, title, body, metadata });
    }
  }

  if (notifyAdmin) {
    await insertNotification({ userId: ADMIN_NOTIFICATION_USER_ID, type, title, body, metadata });
  }
}
