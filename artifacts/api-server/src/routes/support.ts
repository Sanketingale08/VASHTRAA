import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  supportTicketsTable,
  ticketMessagesTable,
  vendorsTable,
  ordersTable,
  productsTable,
  CUSTOMER_TICKET_CATEGORIES,
  routeTicket,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { computeSlaDueAt, notifyTicketEvent } from "../lib/ticketSupport";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};

router.get("/support/tickets/open-count", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.userId, req.userId),
          sql`${supportTicketsTable.status} IN ('Open', 'In Progress', 'Waiting for Customer')`
        )
      );
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch open ticket count");
    res.status(500).json({ error: "Failed to fetch open ticket count" });
  }
});

router.get("/support/categories", requireAuth, async (_req: any, res: any): Promise<void> => {
  res.json({ categories: CUSTOMER_TICKET_CATEGORIES });
});

router.post("/support/tickets", requireAuth, async (req: any, res: any): Promise<void> => {
  const { subject, category, description, orderId, attachments } = req.body;
  if (!subject || !category || !description) {
    res.status(400).json({ error: "subject, category and description are required" });
    return;
  }
  if (!(CUSTOMER_TICKET_CATEGORIES as readonly string[]).includes(category)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const cleanAttachments = Array.isArray(attachments) ? attachments.filter((a) => typeof a === "string") : [];

  try {
    // Never trust a client-supplied vendorId — derive it server-side from the
    // linked order (owned by this user) so tickets always route to the
    // correct seller.
    let vendorId: string | null = null;
    if (orderId) {
      const [order] = await db
        .select({ id: ordersTable.id, items: ordersTable.items })
        .from(ordersTable)
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.userId)));
      if (!order) {
        res.status(400).json({ error: "Order not found" });
        return;
      }
      const items = (order.items as Array<{ productId?: string }>) ?? [];
      const firstProductId = items[0]?.productId;
      if (firstProductId) {
        const [product] = await db
          .select({ vendorId: productsTable.vendorId })
          .from(productsTable)
          .where(eq(productsTable.id, firstProductId));
        vendorId = product?.vendorId ?? null;
      }
    }

    const assignedTo = routeTicket("customer", category, vendorId);
    const now = new Date();

    const ticket = await db.transaction(async (tx) => {
      const [newTicket] = await tx
        .insert(supportTicketsTable)
        .values({
          userId: req.userId,
          userType: "customer",
          subject,
          category,
          assignedTo,
          vendorId: assignedTo === "seller" ? vendorId ?? null : null,
          orderId: orderId ?? null,
          attachments: cleanAttachments,
          slaDueAt: assignedTo === "seller" ? computeSlaDueAt(now) : null,
        })
        .returning();

      await tx.insert(ticketMessagesTable).values([
        {
          ticketId: newTicket.id,
          userId: req.userId,
          body: description,
          attachments: cleanAttachments,
          isStaff: false,
        },
        {
          ticketId: newTicket.id,
          userId: "system",
          body:
            assignedTo === "seller"
              ? "Your ticket has been received and routed to the seller. They typically respond within 48 hours."
              : "Your ticket has been received. Our support team will respond within 24 hours.",
          isStaff: true,
        },
      ]);

      return newTicket;
    });

    await notifyTicketEvent(
      ticket,
      "ticket_created",
      assignedTo === "seller" ? "New customer ticket" : "New support ticket",
      `${subject} — ${category}`,
      assignedTo === "seller" ? { notifySeller: true } : { notifyAdmin: true }
    );

    res.status(201).json(ticket);
  } catch (err) {
    req.log.error({ err }, "Failed to create ticket");
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

router.get("/support/tickets", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.userId, req.userId))
      .orderBy(desc(supportTicketsTable.updatedAt));

    const ticketsWithLastReply = await Promise.all(
      tickets.map(async (ticket) => {
        const [lastMsg] = await db
          .select({ createdAt: ticketMessagesTable.createdAt })
          .from(ticketMessagesTable)
          .where(and(eq(ticketMessagesTable.ticketId, ticket.id), eq(ticketMessagesTable.internal, false)))
          .orderBy(desc(ticketMessagesTable.createdAt))
          .limit(1);
        return { ...ticket, lastReplyAt: lastMsg?.createdAt ?? ticket.createdAt };
      })
    );

    res.json(ticketsWithLastReply);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch tickets");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.get("/support/tickets/:id", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, req.userId)));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const messages = await db
      .select()
      .from(ticketMessagesTable)
      .where(and(eq(ticketMessagesTable.ticketId, id), eq(ticketMessagesTable.internal, false)))
      .orderBy(ticketMessagesTable.createdAt);

    const unreadStaffMsgIds = messages.filter((m) => m.isStaff && !m.readAt).map((m) => m.id);
    if (unreadStaffMsgIds.length > 0) {
      await db
        .update(ticketMessagesTable)
        .set({ readAt: new Date() })
        .where(sql`${ticketMessagesTable.id} IN (${sql.join(unreadStaffMsgIds.map((mid) => sql`${mid}`), sql`, `)})`);
    }

    res.json({ ...ticket, messages });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch ticket");
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

router.post("/support/tickets/:id/reopen", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, req.userId)));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.status !== "Resolved" && ticket.status !== "Closed") {
      res.status(400).json({ error: "Only resolved or closed tickets can be reopened" });
      return;
    }

    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        status: "Open",
        updatedAt: new Date(),
        escalated: false,
        escalatedAt: null,
        escalatedReason: null,
        slaDueAt: ticket.assignedTo === "seller" ? computeSlaDueAt() : null,
      })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await db.insert(ticketMessagesTable).values({
      ticketId: id,
      userId: "system",
      body: "This ticket has been reopened by the customer.",
      isStaff: true,
    });

    await notifyTicketEvent(
      updated,
      "ticket_status_changed",
      "Ticket reopened",
      `"${updated.subject}" was reopened by the customer.`,
      updated.assignedTo === "seller" ? { notifySeller: true } : { notifyAdmin: true }
    );

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to reopen ticket");
    res.status(500).json({ error: "Failed to reopen ticket" });
  }
});

router.post("/support/tickets/:id/escalate", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, req.userId)));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    if (ticket.assignedTo !== "seller") {
      res.status(400).json({ error: "Only seller-routed tickets can be escalated" });
      return;
    }
    if (ticket.escalated) {
      res.status(400).json({ error: "Ticket is already escalated" });
      return;
    }

    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        assignedTo: "admin",
        escalated: true,
        escalatedAt: new Date(),
        escalatedReason: reason || "Escalated by customer",
        status: "Open",
        updatedAt: new Date(),
      })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await db.insert(ticketMessagesTable).values({
      ticketId: id,
      userId: "system",
      body: `This ticket was escalated to Super Admin by the customer${reason ? `: ${reason}` : "."}`,
      isStaff: true,
    });

    await notifyTicketEvent(
      updated,
      "ticket_escalated",
      "Ticket escalated to Admin",
      `"${updated.subject}" was escalated by the customer.`,
      { notifyAdmin: true }
    );

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to escalate ticket");
    res.status(500).json({ error: "Failed to escalate ticket" });
  }
});

router.post("/support/tickets/:id/messages", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { body, attachments } = req.body;
  if (!body?.trim()) {
    res.status(400).json({ error: "body is required" });
    return;
  }
  const cleanAttachments = Array.isArray(attachments) ? attachments.filter((a) => typeof a === "string") : [];
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, req.userId)));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.status === "Closed" || ticket.status === "Resolved") {
      res.status(400).json({ error: "Cannot reply to a closed or resolved ticket" });
      return;
    }

    const [msg] = await db
      .insert(ticketMessagesTable)
      .values({ ticketId: id, userId: req.userId, body: body.trim(), attachments: cleanAttachments, isStaff: false })
      .returning();

    const [updated] = await db
      .update(supportTicketsTable)
      .set({ updatedAt: new Date(), status: ticket.status === "Waiting for Customer" ? "In Progress" : ticket.status })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await notifyTicketEvent(
      updated,
      "ticket_replied",
      "New reply from customer",
      `${ticket.subject}: ${body.trim().slice(0, 120)}`,
      updated.assignedTo === "seller" ? { notifySeller: true } : { notifyAdmin: true }
    );

    res.status(201).json(msg);
  } catch (err) {
    req.log.error({ err }, "Failed to add message");
    res.status(500).json({ error: "Failed to add message" });
  }
});

export default router;
