import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { supportTicketsTable, ticketMessagesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

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
          sql`${supportTicketsTable.status} IN ('Open', 'In Progress')`
        )
      );
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch open ticket count");
    res.status(500).json({ error: "Failed to fetch open ticket count" });
  }
});

router.post("/support/tickets", requireAuth, async (req: any, res: any): Promise<void> => {
  const { subject, category, description } = req.body;
  if (!subject || !category || !description) {
    res.status(400).json({ error: "subject, category and description are required" });
    return;
  }
  const validCategories = ["Order Issue", "Payment Issue", "Return/Refund", "Product Query", "Other"];
  if (!validCategories.includes(category)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  try {
    const ticket = await db.transaction(async (tx) => {
      const [newTicket] = await tx
        .insert(supportTicketsTable)
        .values({ userId: req.userId, subject, category })
        .returning();

      await tx.insert(ticketMessagesTable).values([
        {
          ticketId: newTicket.id,
          userId: req.userId,
          body: description,
          isStaff: false,
        },
        {
          ticketId: newTicket.id,
          userId: "system",
          body: "Your ticket has been received. Our team will respond within 24 hours.",
          isStaff: true,
        },
      ]);

      return newTicket;
    });

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
          .where(eq(ticketMessagesTable.ticketId, ticket.id))
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
      .set({ status: "Open", updatedAt: new Date() })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    await db.insert(ticketMessagesTable).values({
      ticketId: id,
      userId: "system",
      body: "This ticket has been reopened by the customer.",
      isStaff: true,
    });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to reopen ticket");
    res.status(500).json({ error: "Failed to reopen ticket" });
  }
});

router.post("/support/tickets/:id/messages", requireAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { body } = req.body;
  if (!body?.trim()) {
    res.status(400).json({ error: "body is required" });
    return;
  }
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
      .values({ ticketId: id, userId: req.userId, body: body.trim(), isStaff: false })
      .returning();

    await db
      .update(supportTicketsTable)
      .set({ updatedAt: new Date() })
      .where(eq(supportTicketsTable.id, id));

    res.status(201).json(msg);
  } catch (err) {
    req.log.error({ err }, "Failed to add message");
    res.status(500).json({ error: "Failed to add message" });
  }
});

export default router;
