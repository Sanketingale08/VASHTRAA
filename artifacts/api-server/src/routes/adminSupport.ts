import { Router } from "express";
import { db } from "@workspace/db";
import {
  supportTicketsTable,
  ticketMessagesTable,
  ADMIN_NOTIFICATION_USER_ID,
} from "@workspace/db";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { notifyTicketEvent, isPastSla } from "../lib/ticketSupport";

const router = Router();

function requireAdminKey(req: any, res: any, next: any) {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

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
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.assignedTo, "admin"), sql`${supportTicketsTable.status} IN ('Open', 'In Progress')`));
    res.json({ count: row?.count ?? 0 });
  } catch (err: any) {
    req.log?.error({ err }, "admin/support/tickets/unread-count failed");
    res.status(500).json({ error: "Failed to fetch count" });
  }
});

router.get("/admin/support/tickets", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
    await autoEscalateOverdue();

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const scope = (req.query.scope as string | undefined) ?? "customer"; // "customer" | "seller"

    const conditions: any[] = [eq(supportTicketsTable.assignedTo, "admin")];
    if (scope === "seller") {
      conditions.push(sql`(${supportTicketsTable.userType} = 'seller' OR ${supportTicketsTable.escalated} = true)`);
    } else {
      conditions.push(eq(supportTicketsTable.userType, "customer"));
      conditions.push(eq(supportTicketsTable.escalated, false));
    }
    if (status) conditions.push(eq(supportTicketsTable.status, status as any));
    if (search) conditions.push(ilike(supportTicketsTable.subject, `%${search}%`));
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
    req.log?.error({ err }, "admin/support/tickets failed");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.get("/admin/support/tickets/:id", requireAdminKey, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const messages = await db
      .select()
      .from(ticketMessagesTable)
      .where(eq(ticketMessagesTable.ticketId, id))
      .orderBy(ticketMessagesTable.createdAt);

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
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const [msg] = await db
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

    if (!internal) {
      const [updated] = await db
        .update(supportTicketsTable)
        .set({ updatedAt: new Date(), status: "Waiting for Customer" })
        .where(eq(supportTicketsTable.id, id))
        .returning();

      await notifyTicketEvent(updated, "ticket_replied", "Support replied to your ticket", `${ticket.subject}: ${body.trim().slice(0, 120)}`, {
        notifyCustomer: ticket.userType === "customer",
        notifySeller: ticket.userType === "seller",
      });
    }

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
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const [updated] = await db
      .update(supportTicketsTable)
      .set({ status, updatedAt: new Date(), resolvedAt: status === "Resolved" || status === "Closed" ? new Date() : null })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await db.insert(ticketMessagesTable).values({
      ticketId: id,
      userId: "system",
      body: `Ticket status changed to "${status}" by Super Admin.`,
      isStaff: true,
    });

    await notifyTicketEvent(
      updated,
      status === "Resolved" ? "ticket_resolved" : "ticket_status_changed",
      status === "Resolved" ? "Ticket resolved" : "Ticket status updated",
      `"${updated.subject}" is now ${status}.`,
      { notifyCustomer: ticket.userType === "customer", notifySeller: ticket.userType === "seller" }
    );

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
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const [updated] = await db
      .update(supportTicketsTable)
      .set({ assignedAdmin: assignedAdmin || null, updatedAt: new Date() })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await db.insert(ticketMessagesTable).values({
      ticketId: id,
      userId: "system",
      body: assignedAdmin ? `Ticket assigned to ${assignedAdmin}.` : "Ticket unassigned.",
      isStaff: true,
      internal: true,
    });

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "admin/support/tickets/:id/assign failed");
    res.status(500).json({ error: "Failed to assign ticket" });
  }
});

router.get("/admin/support/stats", requireAdminKey, async (req: any, res: any): Promise<void> => {
  try {
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
      .from(supportTicketsTable);

    res.json(row);
  } catch (err: any) {
    req.log?.error({ err }, "admin/support/stats failed");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
