import { Router } from "express";
import { db, mongoSupport } from "@workspace/db";
import {
  supportTicketsTable,
  ticketMessagesTable,
  ADMIN_NOTIFICATION_USER_ID,
} from "@workspace/db";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { notifyTicketEvent, isPastSla } from "../lib/ticketSupport";
import { emitSupportEvent } from "../lib/socket";

const router = Router();

import { requireAdminKey } from "../middlewares/isAdmin";

async function autoEscalateOverdue() {
  const candidates = await db
    .select()
    .from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.assignedTo, "seller"), eq(supportTicketsTable.escalated, false)));

  const overdue = candidates.filter(isPastSla);
  for (const ticket of overdue) {
    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        assignedTo: "admin",
        escalated: true,
        escalatedAt: new Date(),
        escalatedReason: "Auto-escalated: seller did not respond within the SLA window",
        updatedAt: new Date(),
      })
      .where(eq(supportTicketsTable.id, ticket.id))
      .returning();

    await db.insert(ticketMessagesTable).values({
      ticketId: ticket.id,
      userId: "system",
      body: "This ticket was automatically escalated to Super Admin because the seller did not respond within the SLA window.",
      isStaff: true,
    });

    await notifyTicketEvent(updated, "ticket_escalated", "Ticket auto-escalated", `"${updated.subject}" missed its SLA and was escalated.`, {
      notifyAdmin: true,
      notifyCustomer: true,
    });
  }
}

router.get("/admin/support/tickets/unread-count", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    let count = 0;
    try {
      count = await mongoSupport.countTickets({ status: { $in: ["Open", "In Progress"] } });
    } catch {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(sql`${supportTicketsTable.status} IN ('Open', 'In Progress')`)
        .catch(() => []);
      count = row?.count ?? 0;
    }
    res.json({ count });
  } catch (err: any) {
    req.log?.error({ err }, "admin/support/tickets/unread-count failed");
    res.status(500).json({ error: "Failed to fetch count" });
  }
});

router.get("/admin/support/tickets", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    await autoEscalateOverdue().catch(() => {});

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const scope = (req.query.scope as string | undefined) ?? "customer"; // "customer" | "seller"

    let tickets: any[] = [];
    let total = 0;
    try {
      const filter: any = {};
      if (scope === "seller") {
        filter.$or = [{ userType: "seller" }, { escalated: true }, { assignedTo: "seller" }];
      } else if (scope === "customer") {
        filter.$or = [
          { userType: "customer" },
          { userType: "guest" },
          { userType: { $ne: "seller" } },
          { assignedTo: "admin" },
        ];
      }
      if (status) filter.status = status;
      if (search) filter.subject = { $regex: search, $options: "i" };

      tickets = await mongoSupport.findTickets(filter, { limit, skip: offset, sort: { updatedAt: -1 } });
      total = await mongoSupport.countTickets(filter);
    } catch {
      const conditions: any[] = [];
      if (scope === "seller") {
        conditions.push(sql`(${supportTicketsTable.userType} = 'seller' OR ${supportTicketsTable.escalated} = true OR ${supportTicketsTable.assignedTo} = 'seller')`);
      } else if (scope === "customer") {
        conditions.push(sql`(${supportTicketsTable.userType} != 'seller' OR ${supportTicketsTable.userType} IS NULL OR ${supportTicketsTable.assignedTo} = 'admin')`);
      }
      if (status) conditions.push(eq(supportTicketsTable.status, status as any));
      if (search) conditions.push(ilike(supportTicketsTable.subject, `%${search}%`));
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      tickets = await db
        .select()
        .from(supportTicketsTable)
        .where(whereClause)
        .orderBy(desc(supportTicketsTable.updatedAt))
        .limit(limit)
        .offset(offset)
        .catch(() => []);

      const countRows = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(whereClause)
        .catch(() => []);
      total = countRows[0]?.total ?? 0;
    }

    res.json({ tickets, total, page, limit });
  } catch (err: any) {
    req.log?.error?.({ err }, "admin/support/tickets failed");
    res.json({ tickets: [], total: 0, page, limit });
  }
});

router.get("/admin/support/tickets/:id", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    let ticket: any = null;
    let messages: any[] = [];
    try {
      ticket = await mongoSupport.findTicketById(id);
      if (ticket) {
        messages = await mongoSupport.findTicketMessages(id);
      }
    } catch {
      // Fallback
    }

    if (!ticket) {
      const [t] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).catch(() => []);
      ticket = t;
      if (ticket) {
        messages = await db
          .select()
          .from(ticketMessagesTable)
          .where(eq(ticketMessagesTable.ticketId, id))
          .orderBy(ticketMessagesTable.createdAt)
          .catch(() => []);
      }
    }

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.json({ ...ticket, messages });
  } catch (err: any) {
    req.log?.error({ err }, "admin/support/tickets/:id failed");
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

router.post("/admin/support/tickets/:id/messages", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { body, internal, attachments } = req.body;
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
      const [t] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).catch(() => []);
      ticket = t;
    }

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    let msg: any = null;
    try {
      msg = await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: ADMIN_NOTIFICATION_USER_ID,
        body: body.trim(),
        attachments: cleanAttachments,
        isStaff: true,
        internal: !!internal,
      });
    } catch {
      const [m] = await db
        .insert(ticketMessagesTable)
        .values({
          ticketId: id,
          userId: ADMIN_NOTIFICATION_USER_ID,
          body: body.trim(),
          attachments: cleanAttachments,
          isStaff: true,
          internal: !!internal,
        })
        .returning();
      msg = m;
    }

    if (!internal) {
      let updated: any = null;
      try {
        updated = await mongoSupport.updateTicket(id, { updatedAt: new Date(), status: "Waiting for Customer" });
      } catch {
        const [u] = await db
          .update(supportTicketsTable)
          .set({ updatedAt: new Date(), status: "Waiting for Customer" })
          .where(eq(supportTicketsTable.id, id))
          .returning()
          .catch(() => []);
        updated = u;
      }

      if (updated) {
        await notifyTicketEvent(updated, "ticket_replied", "Support replied to your ticket", `${ticket.subject}: ${body.trim().slice(0, 120)}`, {
          notifyCustomer: ticket.userType === "customer",
          notifySeller: ticket.userType === "seller",
        }).catch(() => {});
      }
    }

    emitSupportEvent("support:message_added", {
      ticketId: id,
      userId: ticket.userId,
      vendorId: ticket.vendorId,
      message: msg,
    });

    res.status(201).json(msg);
  } catch (err: any) {
    req.log?.error({ err }, "admin/support/tickets/:id/messages failed");
    res.status(500).json({ error: "Failed to add message" });
  }
});

router.patch("/admin/support/tickets/:id/status", requireAdminKey, async (req: any, res: any): Promise<void> => {
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
      const [t] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).catch(() => []);
      ticket = t;
    }
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, { status, updatedAt: new Date(), resolvedAt: status === "Resolved" || status === "Closed" ? new Date() : null });
    } catch {
      const [u] = await db
        .update(supportTicketsTable)
        .set({ status, updatedAt: new Date(), resolvedAt: status === "Resolved" || status === "Closed" ? new Date() : null })
        .where(eq(supportTicketsTable.id, id))
        .returning()
        .catch(() => []);
      updated = u;
    }

    try {
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: "system",
        body: `Ticket status changed to "${status}" by Super Admin.`,
        isStaff: true,
      });
    } catch {
      await db.insert(ticketMessagesTable).values({
        ticketId: id,
        userId: "system",
        body: `Ticket status changed to "${status}" by Super Admin.`,
        isStaff: true,
      }).catch(() => {});
    }

    if (updated) {
      await notifyTicketEvent(
        updated,
        status === "Resolved" ? "ticket_resolved" : "ticket_status_changed",
        status === "Resolved" ? "Ticket resolved" : "Ticket status updated",
        `"${updated.subject}" is now ${status}.`,
        { notifyCustomer: ticket.userType === "customer", notifySeller: ticket.userType === "seller" }
      ).catch(() => {});
    }

    emitSupportEvent("support:status_changed", {
      ticketId: id,
      userId: ticket.userId,
      vendorId: ticket.vendorId,
      status,
    });

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "admin/support/tickets/:id/status failed");
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.patch("/admin/support/tickets/:id/assign", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { assignedAdmin } = req.body;
  try {
    let ticket: any = null;
    try {
      ticket = await mongoSupport.findTicketById(id);
    } catch {
      const [t] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).catch(() => []);
      ticket = t;
    }
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, { assignedAdmin: assignedAdmin || null, updatedAt: new Date() });
    } catch {
      const [u] = await db
        .update(supportTicketsTable)
        .set({ assignedAdmin: assignedAdmin || null, updatedAt: new Date() })
        .where(eq(supportTicketsTable.id, id))
        .returning()
        .catch(() => []);
      updated = u;
    }

    try {
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: "system",
        body: assignedAdmin ? `Ticket assigned to ${assignedAdmin}.` : "Ticket unassigned.",
        isStaff: true,
        internal: true,
      });
    } catch {
      await db.insert(ticketMessagesTable).values({
        ticketId: id,
        userId: "system",
        body: assignedAdmin ? `Ticket assigned to ${assignedAdmin}.` : "Ticket unassigned.",
        isStaff: true,
        internal: true,
      }).catch(() => {});
    }

    if (assignedAdmin && updated) {
      await notifyTicketEvent(
        updated,
        "ticket_assigned",
        "Ticket assigned",
        `"${updated.subject}" was assigned to ${assignedAdmin}.`,
        { notifyAdmin: true }
      ).catch(() => {});
    }

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "admin/support/tickets/:id/assign failed");
    res.status(500).json({ error: "Failed to assign ticket" });
  }
});

router.get("/admin/support/stats", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    let stats: any = null;
    try {
      stats = await mongoSupport.getStats();
    } catch {
      // Fallback
    }

    if (!stats) {
      const [row] = await db
        .select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${supportTicketsTable.status} = 'Open')::int`,
          inProgress: sql<number>`count(*) filter (where ${supportTicketsTable.status} = 'In Progress')::int`,
          resolved: sql<number>`count(*) filter (where ${supportTicketsTable.status} = 'Resolved')::int`,
          closed: sql<number>`count(*) filter (where ${supportTicketsTable.status} = 'Closed')::int`,
          escalated: sql<number>`count(*) filter (where ${supportTicketsTable.escalated} = true)::int`,
          customerRouted: sql<number>`count(*) filter (where ${supportTicketsTable.assignedTo} = 'admin' and ${supportTicketsTable.userType} = 'customer' and ${supportTicketsTable.escalated} = false)::int`,
          sellerRouted: sql<number>`count(*) filter (where ${supportTicketsTable.assignedTo} = 'seller')::int`,
        })
        .from(supportTicketsTable)
        .catch(() => []);
      stats = row ?? { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0, escalated: 0, customerRouted: 0, sellerRouted: 0 };
    }

    res.json(stats);
  } catch (err: any) {
    req.log?.error?.({ err }, "admin/support/stats failed");
    res.json({ total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0, escalated: 0, customerRouted: 0, sellerRouted: 0 });
  }
});

export default router;
