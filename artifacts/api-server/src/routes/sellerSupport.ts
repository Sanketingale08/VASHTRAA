import { Router } from "express";
import { db } from "@workspace/db";
import {
  supportTicketsTable,
  ticketMessagesTable,
  SELLER_TICKET_CATEGORIES,
} from "@workspace/db";
import { eq, and, desc, sql, ilike, or, gte, lte } from "drizzle-orm";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import { notifyTicketEvent } from "../lib/ticketSupport";

const router = Router();

router.get("/seller/support/categories", requireVendorAuth, async (_req: any, res: any): Promise<void> => {
  res.json({ categories: SELLER_TICKET_CATEGORIES });
});

router.get("/seller/support/tickets/open-count", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.vendorId, req.vendorId),
          eq(supportTicketsTable.assignedTo, "seller"),
          sql`${supportTicketsTable.status} IN ('Open', 'In Progress', 'Waiting for Customer')`
        )
      );
    res.json({ count: row?.count ?? 0 });
  } catch (err: any) {
    req.log?.error({ err }, "seller/support/tickets/open-count failed");
    res.status(500).json({ error: "Failed to fetch open ticket count" });
  }
});

router.get("/seller/support/tickets", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();

    const scope = req.query.scope as string | undefined; // "customer" (routed from customers) | "mine" (raised by seller to admin)
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const conditions: any[] = [eq(supportTicketsTable.vendorId, req.vendorId)];
    if (scope === "customer") conditions.push(eq(supportTicketsTable.userType, "customer"));
    else if (scope === "mine") conditions.push(eq(supportTicketsTable.userType, "seller"));
    if (status) conditions.push(eq(supportTicketsTable.status, status as any));
    if (search) {
      const searchPat = `%${search}%`;
      conditions.push(
        or(
          ilike(supportTicketsTable.subject, searchPat),
          // UUID column must be cast to text before a case-insensitive match
          sql`${supportTicketsTable.id}::text ilike ${searchPat}`,
          ilike(supportTicketsTable.category, searchPat)
        )
      );
    }
    if (dateFrom) conditions.push(gte(supportTicketsTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      // Include the full dateTo day
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(supportTicketsTable.createdAt, end));
    }
    const whereClause = and(...conditions);

    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(whereClause)
      .orderBy(desc(supportTicketsTable.updatedAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(supportTicketsTable)
      .where(whereClause);

    res.json({ tickets, total, page, limit });
  } catch (err: any) {
    req.log?.error({ err }, "seller/support/tickets failed");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.get("/seller/support/tickets/:id", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, req.vendorId)));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const messages = await db
      .select()
      .from(ticketMessagesTable)
      .where(and(eq(ticketMessagesTable.ticketId, id), eq(ticketMessagesTable.internal, false)))
      .orderBy(ticketMessagesTable.createdAt);

    const unreadIds = messages.filter((m) => !m.isStaff && !m.readAt).map((m) => m.id);
    if (unreadIds.length > 0) {
      await db
        .update(ticketMessagesTable)
        .set({ readAt: new Date() })
        .where(sql`${ticketMessagesTable.id} IN (${sql.join(unreadIds.map((mid) => sql`${mid}`), sql`, `)})`);
    }

    res.json({ ...ticket, messages });
  } catch (err: any) {
    req.log?.error({ err }, "seller/support/tickets/:id failed");
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

router.post("/seller/support/tickets/:id/messages", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { body, attachments } = req.body;
  if (!body?.trim()) {
    res.status(400).json({ error: "body is required" });
    return;
  }
  const cleanAttachments = Array.isArray(attachments) ? attachments.filter((a: unknown) => typeof a === "string") : [];
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, req.vendorId)));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    if (ticket.status === "Closed" || ticket.status === "Resolved") {
      res.status(400).json({ error: "Cannot reply to a closed or resolved ticket" });
      return;
    }

    // A vendor's own ticket can flow in two directions:
    // - assignedTo "seller": the customer raised it and the seller is staff
    //   answering them, so the ball moves to the customer.
    // - assignedTo "admin": the seller raised (or it was escalated to) Super
    //   Admin, so the seller is the ticket owner messaging admin, and the
    //   ball moves to admin, not the customer.
    const repliesToAdmin = ticket.assignedTo === "admin";

    const [msg] = await db
      .insert(ticketMessagesTable)
      .values({ ticketId: id, userId: req.userId, body: body.trim(), attachments: cleanAttachments, isStaff: !repliesToAdmin })
      .returning();

    const [updated] = await db
      .update(supportTicketsTable)
      .set(
        repliesToAdmin
          ? { updatedAt: new Date(), status: ticket.status === "Waiting for Customer" ? "In Progress" : ticket.status }
          : { updatedAt: new Date(), status: "Waiting for Customer", slaDueAt: null }
      )
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await notifyTicketEvent(
      updated,
      "ticket_replied",
      repliesToAdmin ? "New reply from seller" : "Seller replied to your ticket",
      `${ticket.subject}: ${body.trim().slice(0, 120)}`,
      repliesToAdmin ? { notifyAdmin: true } : { notifyCustomer: true }
    );

    res.status(201).json(msg);
  } catch (err: any) {
    req.log?.error({ err }, "seller/support/tickets/:id/messages failed");
    res.status(500).json({ error: "Failed to add message" });
  }
});

router.patch("/seller/support/tickets/:id/status", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;
  const valid = ["Open", "In Progress", "Resolved", "Closed", "Waiting for Customer"];
  if (!valid.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, req.vendorId)));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        status,
        updatedAt: new Date(),
        resolvedAt: status === "Resolved" || status === "Closed" ? new Date() : null,
      })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await db.insert(ticketMessagesTable).values({
      ticketId: id,
      userId: "system",
      body: `Ticket status changed to "${status}" by the seller.`,
      isStaff: true,
    });

    await notifyTicketEvent(
      updated,
      status === "Resolved" ? "ticket_resolved" : "ticket_status_changed",
      status === "Resolved" ? "Ticket resolved" : "Ticket status updated",
      `"${updated.subject}" is now ${status}.`,
      { notifyCustomer: true }
    );

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "seller/support/tickets/:id/status failed");
    res.status(500).json({ error: "Failed to update ticket status" });
  }
});

router.post("/seller/support/tickets/:id/escalate", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, req.vendorId)));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    if (ticket.escalated || ticket.assignedTo === "admin") {
      res.status(400).json({ error: "Ticket is already with Super Admin" });
      return;
    }

    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        assignedTo: "admin",
        escalated: true,
        escalatedAt: new Date(),
        escalatedReason: reason || "Escalated by seller",
        status: "Open",
        updatedAt: new Date(),
      })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await db.insert(ticketMessagesTable).values({
      ticketId: id,
      userId: "system",
      body: `This ticket was escalated to Super Admin by the seller${reason ? `: ${reason}` : "."}`,
      isStaff: true,
    });

    await notifyTicketEvent(
      updated,
      "ticket_escalated",
      "Ticket escalated to Admin",
      `"${updated.subject}" was escalated by the seller.`,
      { notifyAdmin: true, notifyCustomer: true }
    );

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "seller/support/tickets/:id/escalate failed");
    res.status(500).json({ error: "Failed to escalate ticket" });
  }
});

router.post("/seller/support/tickets", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { subject, category, description, attachments } = req.body;
  if (!subject || !category || !description) {
    res.status(400).json({ error: "subject, category and description are required" });
    return;
  }
  if (!(SELLER_TICKET_CATEGORIES as readonly string[]).includes(category)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const cleanAttachments = Array.isArray(attachments) ? attachments.filter((a: unknown) => typeof a === "string") : [];
  try {
    const ticket = await db.transaction(async (tx) => {
      const [newTicket] = await tx
        .insert(supportTicketsTable)
        .values({
          userId: req.userId,
          userType: "seller",
          subject,
          category,
          assignedTo: "admin",
          vendorId: req.vendorId,
          attachments: cleanAttachments,
        })
        .returning();

      await tx.insert(ticketMessagesTable).values([
        { ticketId: newTicket.id, userId: req.userId, body: description, attachments: cleanAttachments, isStaff: false },
        {
          ticketId: newTicket.id,
          userId: "system",
          body: "Your ticket has been received by Super Admin support and will be reviewed shortly.",
          isStaff: true,
        },
      ]);

      return newTicket;
    });

    await notifyTicketEvent(ticket, "seller_support_request", "New seller support request", `${subject} — ${category}`, {
      notifyAdmin: true,
    });

    res.status(201).json(ticket);
  } catch (err: any) {
    req.log?.error({ err }, "seller/support/tickets create failed");
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

export default router;
