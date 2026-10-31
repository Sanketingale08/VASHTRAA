import { Router } from "express";
import crypto from "crypto";
import { db, mongoSupport } from "@workspace/db";
import {
  supportTicketsTable,
  ticketMessagesTable,
  SELLER_TICKET_CATEGORIES,
} from "@workspace/db";
import { eq, and, desc, sql, ilike, or, inArray, gte, lte } from "drizzle-orm";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import { notifyTicketEvent } from "../lib/ticketSupport";

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

router.get("/seller/support/categories", requireVendorAuth, async (_req: any, res: any): Promise<void> => {
  res.json({ categories: SELLER_TICKET_CATEGORIES });
});

router.get("/seller/support/tickets/open-count", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  try {
    const vendorIds = getCandidateVendorIds(req);
    let count = 0;
    try {
      count = await mongoSupport.countTickets({
        $or: [
          { vendorId: { $in: vendorIds } },
          { userId: req.userId },
        ],
        status: { $in: ["Open", "In Progress", "Waiting for Customer"] },
      });
    } catch {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(
          and(
            inArray(supportTicketsTable.vendorId, vendorIds),
            sql`${supportTicketsTable.status} IN ('Open', 'In Progress', 'Waiting for Customer')`
          )
        )
        .catch(() => []);
      count = row?.count ?? 0;
    }
    res.json({ count });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/support/tickets/open-count failed");
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
    const scope = req.query.scope as string | undefined;

    const vendorIds = getCandidateVendorIds(req);
    let tickets: any[] = [];
    let total = 0;

    try {
      const filter: any = {
        $or: [
          { vendorId: { $in: vendorIds } },
          { userId: req.userId },
        ],
      };
      if (scope === "customer") filter.userType = { $in: ["customer", "guest"] };
      else if (scope === "mine") filter.userType = "seller";
      if (status && status !== "all") filter.status = status;
      if (search) filter.subject = { $regex: search, $options: "i" };

      tickets = await mongoSupport.findTickets(filter, { limit, skip: offset, sort: { updatedAt: -1 } });
      total = await mongoSupport.countTickets(filter);
    } catch {
      // Fallback
    }

    if (tickets.length === 0 && total === 0) {
      try {
        const conditions: any[] = [
          or(
            inArray(supportTicketsTable.vendorId, vendorIds),
            eq(supportTicketsTable.userId, req.userId)
          ),
        ];
        if (scope === "customer") conditions.push(sql`${supportTicketsTable.userType} != 'seller'`);
        else if (scope === "mine") conditions.push(eq(supportTicketsTable.userType, "seller"));
        if (status && status !== "all") conditions.push(eq(supportTicketsTable.status, status as any));
        if (search) {
          const searchPat = `%${search}%`;
          conditions.push(or(ilike(supportTicketsTable.subject, searchPat), ilike(supportTicketsTable.category, searchPat)));
        }
        const whereClause = and(...conditions);
        tickets = await db
          .select()
          .from(supportTicketsTable)
          .where(whereClause)
          .orderBy(desc(supportTicketsTable.updatedAt))
          .limit(limit)
          .offset(offset)
          .catch(() => []);

        const [totRow] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(supportTicketsTable)
          .where(whereClause)
          .catch(() => [{ total: 0 }]);
        total = totRow?.total ?? tickets.length;
      } catch {
        // Fallback
      }
    }

    res.json({ tickets, total, page, limit });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/support/tickets failed");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.get("/seller/support/tickets/:id", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const vendorIds = getCandidateVendorIds(req);
  try {
    let ticket: any = null;
    let messages: any[] = [];

    try {
      ticket = await mongoSupport.findTicketById(id);
      const isOwner = ticket && (vendorIds.includes(ticket.vendorId) || ticket.userId === req.userId);
      if (ticket && isOwner) {
        const allMsgs = await mongoSupport.findTicketMessages(id);
        messages = allMsgs.filter((m: any) => !m.internal || m.userId === req.userId || vendorIds.includes(m.vendorId));
      } else if (ticket && !isOwner) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }
    } catch {
      // Fallback
    }

    if (!ticket) {
      const [t] = await db
        .select()
        .from(supportTicketsTable)
        .where(and(eq(supportTicketsTable.id, id), or(inArray(supportTicketsTable.vendorId, vendorIds), eq(supportTicketsTable.userId, req.userId))))
        .catch(() => []);
      ticket = t;
      if (ticket) {
        messages = await db
          .select()
          .from(ticketMessagesTable)
          .where(and(eq(ticketMessagesTable.ticketId, id), eq(ticketMessagesTable.internal, false)))
          .orderBy(ticketMessagesTable.createdAt)
          .catch(() => []);
      }
    }

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const unreadIds = messages.filter((m) => !m.isStaff && !m.readAt).map((m) => m.id);
    if (unreadIds.length > 0) {
      await mongoSupport.markMessagesRead(id, unreadIds).catch(() => {});
    }

    res.json({ ...ticket, messages });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/support/tickets/:id failed");
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

router.post("/seller/support/tickets/:id/messages", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { body, attachments } = req.body;
  const vendorIds = getCandidateVendorIds(req);
  if (!body?.trim()) {
    res.status(400).json({ error: "body is required" });
    return;
  }
  const cleanAttachments = Array.isArray(attachments) ? attachments.filter((a: unknown) => typeof a === "string") : [];
  try {
    let ticket: any = null;
    try {
      ticket = await mongoSupport.findTicketById(id);
    } catch {
      // Fallback
    }

    if (!ticket) {
      const [t] = await db
        .select()
        .from(supportTicketsTable)
        .where(and(eq(supportTicketsTable.id, id), or(inArray(supportTicketsTable.vendorId, vendorIds), eq(supportTicketsTable.userId, req.userId))))
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || (!vendorIds.includes(ticket.vendorId) && ticket.userId !== req.userId)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    if (ticket.status === "Closed" || ticket.status === "Resolved") {
      res.status(400).json({ error: "Cannot reply to a closed or resolved ticket" });
      return;
    }

    const repliesToAdmin = ticket.assignedTo === "admin";

    let msg: any = null;
    try {
      msg = await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: req.userId,
        vendorId: req.vendorId,
        body: body.trim(),
        attachments: cleanAttachments,
        isStaff: !repliesToAdmin,
        internal: false,
      });
    } catch {
      const [m] = await db
        .insert(ticketMessagesTable)
        .values({
          ticketId: id,
          userId: req.userId,
          body: body.trim(),
          attachments: cleanAttachments,
          isStaff: !repliesToAdmin,
        })
        .returning()
        .catch(() => []);
      msg = m;
    }

    const updates = repliesToAdmin
      ? { updatedAt: new Date(), status: ticket.status === "Waiting for Customer" ? "In Progress" : ticket.status }
      : { updatedAt: new Date(), status: "Waiting for Customer", slaDueAt: null };

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, updates);
    } catch {
      const [u] = await db
        .update(supportTicketsTable)
        .set(updates)
        .where(eq(supportTicketsTable.id, id))
        .returning()
        .catch(() => []);
      updated = u;
    }

    await notifyTicketEvent(
      updated || ticket,
      "ticket_replied",
      repliesToAdmin ? "New reply from seller" : "Seller replied to your ticket",
      `${ticket.subject}: ${body.trim().slice(0, 120)}`,
      repliesToAdmin ? { notifyAdmin: true } : { notifyCustomer: true }
    ).catch(() => {});

    res.status(201).json(msg || { ticketId: id, userId: req.userId, body: body.trim(), createdAt: new Date() });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/support/tickets/:id/messages failed");
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
    let ticket: any = null;
    try {
      ticket = await mongoSupport.findTicketById(id);
    } catch {
      const [t] = await db
        .select()
        .from(supportTicketsTable)
        .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, req.vendorId)))
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || (ticket.vendorId !== req.vendorId && ticket.userId !== req.userId)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const updates = {
      status,
      updatedAt: new Date(),
      resolvedAt: status === "Resolved" || status === "Closed" ? new Date() : null,
    };

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, updates);
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: "system",
        body: `Ticket status changed to "${status}" by the seller.`,
        isStaff: true,
        internal: false,
      });
    } catch {
      const [u] = await db
        .update(supportTicketsTable)
        .set(updates)
        .where(eq(supportTicketsTable.id, id))
        .returning()
        .catch(() => []);
      updated = u;
    }

    await notifyTicketEvent(
      updated || ticket,
      status === "Resolved" ? "ticket_resolved" : "ticket_status_changed",
      status === "Resolved" ? "Ticket resolved" : "Ticket status updated",
      `"${ticket.subject}" is now ${status}.`,
      { notifyCustomer: true }
    ).catch(() => {});

    res.json(updated || { ...ticket, ...updates });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/support/tickets/:id/status failed");
    res.status(500).json({ error: "Failed to update ticket status" });
  }
});

router.post("/seller/support/tickets/:id/escalate", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    let ticket: any = null;
    try {
      ticket = await mongoSupport.findTicketById(id);
    } catch {
      const [t] = await db
        .select()
        .from(supportTicketsTable)
        .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, req.vendorId)))
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || (ticket.vendorId !== req.vendorId && ticket.userId !== req.userId)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    if (ticket.escalated || ticket.assignedTo === "admin") {
      res.status(400).json({ error: "Ticket is already with Super Admin" });
      return;
    }

    const updates = {
      assignedTo: "admin",
      escalated: true,
      escalatedAt: new Date(),
      escalatedReason: reason || "Escalated by seller",
      status: "Open",
      updatedAt: new Date(),
    };

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, updates);
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: "system",
        body: `This ticket was escalated to Super Admin by the seller${reason ? `: ${reason}` : "."}`,
        isStaff: true,
        internal: false,
      });
    } catch {
      const [u] = await db
        .update(supportTicketsTable)
        .set(updates)
        .where(eq(supportTicketsTable.id, id))
        .returning()
        .catch(() => []);
      updated = u;
    }

    await notifyTicketEvent(
      updated || ticket,
      "ticket_escalated",
      "Ticket escalated to Admin",
      `"${ticket.subject}" was escalated by the seller.`,
      { notifyAdmin: true, notifyCustomer: true }
    ).catch(() => {});

    res.json(updated || { ...ticket, ...updates });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/support/tickets/:id/escalate failed");
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
    const id = `TCK_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();

    const ticketData = {
      id,
      userId: req.userId,
      userType: "seller",
      subject: subject.trim(),
      category,
      assignedTo: "admin",
      vendorId: req.vendorId,
      attachments: cleanAttachments,
      status: "Open",
      createdAt: now,
      updatedAt: now,
    };

    let ticket: any = null;
    try {
      ticket = await mongoSupport.insertTicket(ticketData);
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: req.userId,
        vendorId: req.vendorId,
        body: description.trim(),
        attachments: cleanAttachments,
        isStaff: false,
        internal: false,
        createdAt: now,
      });
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: "system",
        body: "Your ticket has been received by Super Admin support and will be reviewed shortly.",
        attachments: [],
        isStaff: true,
        internal: false,
        createdAt: new Date(now.getTime() + 100),
      });
    } catch {
      ticket = ticketData;
    }

    await notifyTicketEvent(ticket, "seller_support_request", "New seller support request", `${subject} — ${category}`, {
      notifyAdmin: true,
    }).catch(() => {});

    res.status(201).json(ticket);
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/support/tickets create failed");
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

export default router;
