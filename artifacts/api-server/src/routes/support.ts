import { Router } from "express";
import crypto from "crypto";
import { requireAuth, isAuthenticated } from "../middlewares/isAuthenticated";
import { db, mongoSupport, mongoOrders, mongoProducts } from "@workspace/db";
import {
  supportTicketsTable,
  ticketMessagesTable,
  vendorsTable,
  ordersTable,
  productsTable,
  CUSTOMER_TICKET_CATEGORIES,
  routeTicket,
} from "@workspace/db";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { computeSlaDueAt, notifyTicketEvent } from "../lib/ticketSupport";
import { ticketCreationLimiter } from "../middlewares/rateLimiter";
import { emitSupportEvent } from "../lib/socket";

const router = Router();

router.get("/support/tickets/open-count", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    let count = 0;
    try {
      count = await mongoSupport.countTickets({
        userId: req.userId,
        status: { $in: ["Open", "In Progress", "Waiting for Customer"] },
      });
    } catch {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(
          and(
            eq(supportTicketsTable.userId, req.userId),
            sql`${supportTicketsTable.status} IN ('Open', 'In Progress', 'Waiting for Customer')`
          )
        )
        .catch(() => []);
      count = row?.count ?? 0;
    }
    res.json({ count });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to fetch open ticket count");
    res.status(500).json({ error: "Failed to fetch open ticket count" });
  }
});

router.get("/support/categories", async (_req: any, res: any): Promise<void> => {
  res.json({ categories: CUSTOMER_TICKET_CATEGORIES });
});

router.post("/support/tickets", ticketCreationLimiter, async (req: any, res: any): Promise<void> => {
  // Attempt authentication if credentials provided
  try {
    await new Promise<void>((resolve) => {
      isAuthenticated(req, res, () => resolve());
    });
  } catch {}

  // If not authenticated, support guest inquiries (e.g. from Contact Us page)
  if (!req.userId) {
    const rawGuest = (req.headers["x-user-id"] as string) || req.body?.email;
    if (rawGuest && typeof rawGuest === "string" && rawGuest.trim()) {
      req.userId = rawGuest.startsWith("guest_")
        ? rawGuest.trim()
        : `guest_${rawGuest.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      req.userRole = "customer";
    } else {
      req.userId = `guest_${crypto.randomUUID().slice(0, 8)}`;
      req.userRole = "customer";
    }
  }

  const {
    subject,
    category,
    description,
    orderId,
    productId,
    orderItemId,
    attachments,
    vendorId: bodyVendorId,
    name,
    email,
    customerName,
    customerEmail,
  } = req.body;
  if (!subject || !category || !description) {
    res.status(400).json({ error: "subject, category and description are required" });
    return;
  }
  if (!(CUSTOMER_TICKET_CATEGORIES as readonly string[]).includes(category)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const cleanAttachments = Array.isArray(attachments) ? attachments.filter((a) => typeof a === "string") : [];

  const effectiveCustomerName = (customerName || name || req.user?.name || (req.user?.firstName ? `${req.user.firstName} ${req.user?.lastName || ""}`.trim() : null) || "Customer");
  const effectiveCustomerEmail = (customerEmail || email || req.user?.email || null);

  try {
    let vendorId: string | null = bodyVendorId ? String(bodyVendorId).trim() : null;
    let targetProductId: string | null = productId ?? null;

    if (!vendorId && orderId) {
      let order: any = null;
      try {
        order = await mongoOrders.findById(orderId);
      } catch {
        const [ord] = await db
          .select({ id: ordersTable.id, items: ordersTable.items })
          .from(ordersTable)
          .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.userId)))
          .catch(() => []);
        order = ord;
      }

      if (order) {
        const items = (order.items as Array<{ productId?: string; id?: string; vendorId?: string }>) ?? [];
        const matchedItem = items.find(
          (i) => (targetProductId && i.productId === targetProductId) || (orderItemId && i.id === orderItemId)
        ) ?? items[0];

        if (matchedItem) {
          if (matchedItem.vendorId) {
            vendorId = matchedItem.vendorId;
          }
          if (matchedItem.productId) {
            targetProductId = matchedItem.productId;
            if (!vendorId) {
              try {
                const product = await mongoProducts.findById(matchedItem.productId);
                vendorId = product?.vendorId ?? null;
              } catch {
                const [product] = await db
                  .select({ vendorId: productsTable.vendorId })
                  .from(productsTable)
                  .where(eq(productsTable.id, matchedItem.productId))
                  .catch(() => []);
                vendorId = product?.vendorId ?? null;
              }
            }
          }
        }
      }
      // If order is not found, do not reject the message; keep orderId as reference and route to admin
    } else if (!vendorId && productId) {
      try {
        const product = await mongoProducts.findById(productId);
        vendorId = product?.vendorId ?? null;
      } catch {
        const [product] = await db
          .select({ vendorId: productsTable.vendorId })
          .from(productsTable)
          .where(eq(productsTable.id, productId))
          .catch(() => []);
        vendorId = product?.vendorId ?? null;
      }
    }

    const assignedTo = routeTicket("customer", category, vendorId);
    const now = new Date();
    const id = `TCK_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const ticketData = {
      id,
      userId: req.userId,
      userType: "customer",
      customerName: effectiveCustomerName,
      customerEmail: effectiveCustomerEmail,
      subject: subject.trim(),
      category,
      assignedTo,
      vendorId: vendorId ?? null,
      orderId: orderId ? String(orderId).trim() : null,
      productId: targetProductId ?? null,
      orderItemId: orderItemId ?? null,
      attachments: cleanAttachments,
      slaDueAt: assignedTo === "seller" ? computeSlaDueAt(now) : null,
      status: "Open",
      createdAt: now,
      updatedAt: now,
    };

    let ticket: any = null;
    try {
      ticket = await mongoSupport.insertTicket(ticketData);
      // Initial user message
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: req.userId,
        body: description.trim(),
        attachments: cleanAttachments,
        isStaff: false,
        internal: false,
        createdAt: now,
      });
      // System acknowledgement message
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: "system",
        body: vendorId
          ? "Your query has been submitted successfully and delivered to both the Seller and Admin. Updates will appear here."
          : "Your query has been submitted successfully. Our support team will respond within 24 hours.",
        attachments: [],
        isStaff: true,
        internal: false,
        createdAt: new Date(now.getTime() + 100),
      });
    } catch {
      ticket = await db.transaction(async (tx: any) => {
        const pgData = { ...ticketData };
        delete (pgData as any).id;
        const [newTicket] = await tx
          .insert(supportTicketsTable)
          .values(pgData)
          .returning();

        const ticketId = newTicket?.id || id;
        await tx.insert(ticketMessagesTable).values([
          {
            ticketId,
            userId: req.userId,
            body: description.trim(),
            attachments: cleanAttachments,
            isStaff: false,
          },
          {
            ticketId,
            userId: "system",
            body: vendorId
              ? "Your query has been submitted successfully and delivered to both the Seller and Admin. Updates will appear here."
              : "Your query has been submitted successfully. Our support team will respond within 24 hours.",
            isStaff: true,
          },
        ]);
        return newTicket || ticketData;
      }).catch(() => ticketData);
    }

    await notifyTicketEvent(
      ticket,
      assignedTo === "seller" ? "new_customer_query" : "ticket_created",
      assignedTo === "seller" ? "New customer query" : "New support ticket",
      `${subject} — ${category}`,
      { notifySeller: !!vendorId, notifyAdmin: true }
    ).catch(() => {});

    emitSupportEvent("support:ticket_created", {
      ticketId: ticket.id,
      userId: req.userId,
      vendorId: ticket.vendorId,
      ticket,
    });

    if (ticket.userType === "customer") {
      try {
        const { sendSupportTicketEmail } = await import("../lib/transactionalEmail");
        void sendSupportTicketEmail({
          userId: req.userId,
          type: "support_ticket_created",
          ticketId: ticket.id,
          ticketSubject: ticket.subject,
          status: ticket.status || "Open",
        });
      } catch {}
    }

    res.status(201).json(ticket);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to create ticket");
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

router.get("/support/tickets", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;

    let tickets: any[] = [];
    let total = 0;

    const userIds = [req.userId];
    if (req.user?.id && !userIds.includes(req.user.id)) userIds.push(req.user.id);
    if (req.user?.email) {
      if (!userIds.includes(req.user.email)) userIds.push(req.user.email);
      const gId = `guest_${req.user.email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      if (!userIds.includes(gId)) userIds.push(gId);
    }

    try {
      const filter: any = { userId: { $in: userIds } };
      if (status && status !== "all") filter.status = status;
      if (search) filter.subject = { $regex: search, $options: "i" };

      tickets = await mongoSupport.findTickets(filter, { limit, skip: offset, sort: { updatedAt: -1 } });
      total = await mongoSupport.countTickets(filter);
    } catch {
      // Fallback
    }

    if (tickets.length === 0 && total === 0) {
      try {
        const conditions: any[] = [sql`${supportTicketsTable.userId} IN (${sql.join(userIds.map((uid) => sql`${uid}`), sql`, `)})`];
        if (status && status !== "all") conditions.push(eq(supportTicketsTable.status, status as any));
        if (search) conditions.push(ilike(supportTicketsTable.subject, `%${search}%`));
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

    const ticketsWithLastReply = await Promise.all(
      tickets.map(async (ticket) => {
        let lastMsgAt: any = ticket.updatedAt || ticket.createdAt;
        try {
          const msgs = await mongoSupport.findTicketMessages(ticket.id);
          const nonInternal = msgs.filter((m: any) => !m.internal);
          if (nonInternal.length > 0) {
            lastMsgAt = nonInternal[nonInternal.length - 1].createdAt;
          }
        } catch {
          const [lastMsg] = await db
            .select({ createdAt: ticketMessagesTable.createdAt })
            .from(ticketMessagesTable)
            .where(and(eq(ticketMessagesTable.ticketId, ticket.id), eq(ticketMessagesTable.internal, false)))
            .orderBy(desc(ticketMessagesTable.createdAt))
            .limit(1)
            .catch(() => []);
          if (lastMsg?.createdAt) lastMsgAt = lastMsg.createdAt;
        }
        return { ...ticket, lastReplyAt: lastMsgAt };
      })
    );

    res.json({ tickets: ticketsWithLastReply, total, page, limit });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to fetch tickets");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

function checkTicketOwner(ticket: any, req: any): boolean {
  if (!ticket) return false;
  if (req.userId === "admin" || req.userRole === "super_admin") return true;
  const userIds: string[] = [req.userId].filter(Boolean);
  if (req.user?.id && !userIds.includes(req.user.id)) userIds.push(req.user.id);
  const userEmail = (
    req.user?.email ||
    req.user?.primaryEmailAddress?.emailAddress ||
    (typeof req.user?.primaryEmail === "string" ? req.user.primaryEmail : "") ||
    ""
  ).toLowerCase();

  if (userEmail) {
    if (!userIds.includes(userEmail)) userIds.push(userEmail);
    const gId = `guest_${userEmail.replace(/[^a-z0-9]/g, "_")}`;
    if (!userIds.includes(gId)) userIds.push(gId);
  }

  if (userIds.includes(ticket.userId)) return true;
  if (userEmail && ticket.customerEmail && userEmail === ticket.customerEmail.toLowerCase()) return true;
  return false;
}

router.get("/support/tickets/:id", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    let ticket: any = null;
    let messages: any[] = [];

    try {
      ticket = await mongoSupport.findTicketById(id);
    } catch {
      // Fallback
    }

    if (!ticket) {
      const [t] = await db
        .select()
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.id, id))
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || !checkTicketOwner(ticket, req)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    try {
      const allMsgs = await mongoSupport.findTicketMessages(id);
      messages = allMsgs.filter((m: any) => !m.internal);
    } catch {}

    if (messages.length === 0) {
      messages = await db
        .select()
        .from(ticketMessagesTable)
        .where(and(eq(ticketMessagesTable.ticketId, id), eq(ticketMessagesTable.internal, false)))
        .orderBy(ticketMessagesTable.createdAt)
        .catch(() => []);
    }

    const unreadStaffMsgIds = messages.filter((m) => m.isStaff && !m.readAt).map((m) => m.id);
    if (unreadStaffMsgIds.length > 0) {
      await mongoSupport.markMessagesRead(id, unreadStaffMsgIds).catch(() => {});
      await db
        .update(ticketMessagesTable)
        .set({ readAt: new Date() })
        .where(sql`${ticketMessagesTable.id} IN (${sql.join(unreadStaffMsgIds.map((mid) => sql`${mid}`), sql`, `)})`)
        .catch(() => {});
    }

    res.json({ ...ticket, messages });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to fetch ticket");
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

router.post("/support/tickets/:id/reopen", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
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
        .where(eq(supportTicketsTable.id, id))
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || !checkTicketOwner(ticket, req)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.status !== "Resolved" && ticket.status !== "Closed") {
      res.status(400).json({ error: "Only resolved or closed tickets can be reopened" });
      return;
    }

    const updates = {
      status: "Open",
      updatedAt: new Date(),
      escalated: false,
      escalatedAt: null,
      escalatedReason: null,
      slaDueAt: ticket.assignedTo === "seller" ? computeSlaDueAt() : null,
    };

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, updates);
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: "system",
        body: "This ticket has been reopened by the customer.",
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
      await db.insert(ticketMessagesTable).values({
        ticketId: id,
        userId: "system",
        body: "This ticket has been reopened by the customer.",
        isStaff: true,
      }).catch(() => {});
    }

    await notifyTicketEvent(
      updated || ticket,
      "ticket_status_changed",
      "Ticket reopened",
      `"${ticket.subject}" was reopened by the customer.`,
      ticket.assignedTo === "seller" ? { notifySeller: true } : { notifyAdmin: true }
    ).catch(() => {});

    emitSupportEvent("support:status_changed", {
      ticketId: id,
      userId: ticket.userId,
      vendorId: ticket.vendorId,
      status: "Open",
    });

    res.json(updated || { ...ticket, ...updates });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to reopen ticket");
    res.status(500).json({ error: "Failed to reopen ticket" });
  }
});

router.post("/support/tickets/:id/escalate", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;
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
        .where(eq(supportTicketsTable.id, id))
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || !checkTicketOwner(ticket, req)) {
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

    const updates = {
      assignedTo: "admin",
      escalated: true,
      escalatedAt: new Date(),
      escalatedReason: reason || "Escalated by customer",
      status: "Open",
      updatedAt: new Date(),
    };

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, updates);
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: "system",
        body: `This ticket was escalated to Super Admin by the customer${reason ? `: ${reason}` : "."}`,
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
      await db.insert(ticketMessagesTable).values({
        ticketId: id,
        userId: "system",
        body: `This ticket was escalated to Super Admin by the customer${reason ? `: ${reason}` : "."}`,
        isStaff: true,
      }).catch(() => {});
    }

    await notifyTicketEvent(
      updated || ticket,
      "ticket_escalated",
      "Ticket escalated to Admin",
      `"${ticket.subject}" was escalated by the customer.`,
      { notifyAdmin: true }
    ).catch(() => {});

    emitSupportEvent("support:status_changed", {
      ticketId: id,
      userId: ticket.userId,
      vendorId: ticket.vendorId,
      status: "Open",
      escalated: true,
    });

    res.json(updated || { ...ticket, ...updates });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to escalate ticket");
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
        .where(eq(supportTicketsTable.id, id))
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || !checkTicketOwner(ticket, req)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.status === "Closed" || ticket.status === "Resolved") {
      res.status(400).json({ error: "Cannot reply to a closed or resolved ticket" });
      return;
    }

    let msg: any = null;
    try {
      msg = await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: req.userId,
        body: body.trim(),
        attachments: cleanAttachments,
        isStaff: false,
        internal: false,
      });
    } catch {
      const [m] = await db
        .insert(ticketMessagesTable)
        .values({ ticketId: id, userId: req.userId, body: body.trim(), attachments: cleanAttachments, isStaff: false })
        .returning()
        .catch(() => []);
      msg = m;
    }

    const backToSeller = ticket.status === "Waiting for Customer";
    const statusUpdate = {
      updatedAt: new Date(),
      status: backToSeller ? "In Progress" : ticket.status,
      slaDueAt: backToSeller && ticket.assignedTo === "seller" ? computeSlaDueAt() : ticket.slaDueAt,
    };

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, statusUpdate);
    } catch {
      const [u] = await db
        .update(supportTicketsTable)
        .set(statusUpdate)
        .where(eq(supportTicketsTable.id, id))
        .returning()
        .catch(() => []);
      updated = u;
    }

    await notifyTicketEvent(
      updated || ticket,
      "ticket_replied",
      "New reply from customer",
      `${ticket.subject}: ${body.trim().slice(0, 120)}`,
      { notifySeller: !!ticket.vendorId, notifyAdmin: true }
    ).catch(() => {});

    emitSupportEvent("support:message_added", {
      ticketId: id,
      userId: req.userId,
      vendorId: ticket.vendorId,
      message: msg,
    });

    res.status(201).json(msg || { ticketId: id, userId: req.userId, body: body.trim(), createdAt: new Date() });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to add message");
    res.status(500).json({ error: "Failed to add message" });
  }
});

export default router;
