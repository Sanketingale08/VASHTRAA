import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import {
  ordersTable,
  productsTable,
  productReviewsTable,
  productQueriesTable,
  supportTicketsTable,
  ticketMessagesTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";

const router = Router();

async function getVendorProductIds(vendorId: string): Promise<Set<string>> {
  const products = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.vendorId, vendorId));
  return new Set(products.map((p) => p.id));
}

async function enrichCustomerEmails(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const u = await clerkClient.users.getUser(uid);
        map.set(uid, u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? "");
      } catch {
        map.set(uid, "");
      }
    })
  );
  return map;
}

// ---------- Customer Directory ----------

router.get("/seller/customers", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const search = (req.query.search as string | undefined)?.toLowerCase().trim();

  try {
    const productIdSet = await getVendorProductIds(vendorId);
    if (productIdSet.size === 0) return res.json({ customers: [] });

    const allOrders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));

    const customerMap = new Map<string, any>();
    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => productIdSet.has(i.productId));
      if (vendorItems.length === 0) continue;

      const address = (order.address as any) ?? {};
      const vendorTotal = vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);

      const existing = customerMap.get(order.userId);
      if (existing) {
        existing.totalOrders += 1;
        existing.totalSpent += vendorTotal;
        if (new Date(order.createdAt) > new Date(existing.lastOrderAt)) {
          existing.lastOrderAt = order.createdAt;
          existing.name = address.name ?? existing.name;
          existing.phone = address.phone ?? existing.phone;
          existing.city = address.city ?? existing.city;
          existing.state = address.state ?? existing.state;
        }
      } else {
        customerMap.set(order.userId, {
          userId: order.userId,
          name: address.name ?? "Customer",
          phone: address.phone ?? "",
          city: address.city ?? "",
          state: address.state ?? "",
          totalOrders: 1,
          totalSpent: vendorTotal,
          firstOrderAt: order.createdAt,
          lastOrderAt: order.createdAt,
        });
      }
    }

    let customers = [...customerMap.values()];

    const emailMap = await enrichCustomerEmails(customers.map((c) => c.userId));
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    customers = customers.map((c) => ({
      ...c,
      email: emailMap.get(c.userId) ?? "",
      status: now - new Date(c.lastOrderAt).getTime() <= ninetyDays ? "Active" : "Inactive",
    }));

    if (search) {
      customers = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.email.toLowerCase().includes(search) ||
          c.phone.toLowerCase().includes(search)
      );
    }

    customers.sort((a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime());

    res.json({ customers });
  } catch (err: any) {
    req.log?.error({ err }, "seller/customers failed");
    res.status(500).json({ error: "Failed to load customers" });
  }
});

router.get("/seller/customers/:userId", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { userId } = req.params;

  try {
    const productIdSet = await getVendorProductIds(vendorId);

    const allOrders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId))
      .orderBy(desc(ordersTable.createdAt));

    const vendorOrders: any[] = [];
    let totalSpent = 0;
    let name = "Customer";
    let phone = "";
    let email = "";
    let address: any = {};

    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => productIdSet.has(i.productId));
      if (vendorItems.length === 0) continue;

      const addr = (order.address as any) ?? {};
      const vendorTotal = vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);
      totalSpent += vendorTotal;
      name = addr.name ?? name;
      phone = addr.phone ?? phone;
      address = addr;

      vendorOrders.push({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        vendorItems: vendorItems.map((i) => ({ name: i.name, price: i.price ?? 0, quantity: i.quantity ?? 1 })),
        vendorTotal,
      });
    }

    if (vendorOrders.length === 0) {
      return res.status(404).json({ error: "Customer not found for this vendor" });
    }

    try {
      const u = await clerkClient.users.getUser(userId);
      email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? "";
    } catch {}

    const reviews = await db
      .select()
      .from(productReviewsTable)
      .where(and(eq(productReviewsTable.userId, userId), eq(productReviewsTable.vendorId, vendorId)))
      .orderBy(desc(productReviewsTable.createdAt));

    const queries = await db
      .select()
      .from(productQueriesTable)
      .where(and(eq(productQueriesTable.userId, userId), eq(productQueriesTable.vendorId, vendorId)))
      .orderBy(desc(productQueriesTable.createdAt));

    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.userId, userId), eq(supportTicketsTable.vendorId, vendorId)))
      .orderBy(desc(supportTicketsTable.createdAt));

    res.json({
      userId,
      name,
      email,
      phone,
      city: address.city ?? "",
      state: address.state ?? "",
      totalOrders: vendorOrders.length,
      totalSpent,
      orders: vendorOrders,
      reviews,
      queries,
      tickets,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/customers/:userId failed");
    res.status(500).json({ error: "Failed to load customer" });
  }
});

// ---------- Reviews ----------

router.get("/seller/reviews", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const ratingFilter = req.query.rating ? parseInt(req.query.rating as string) : undefined;
  const reportedOnly = req.query.reported === "true";

  try {
    const rows = await db
      .select({
        review: productReviewsTable,
        productName: productsTable.name,
        productImages: productsTable.images,
      })
      .from(productReviewsTable)
      .leftJoin(productsTable, eq(productReviewsTable.productId, productsTable.id))
      .where(eq(productReviewsTable.vendorId, vendorId))
      .orderBy(desc(productReviewsTable.createdAt));

    let reviews = rows.map((r) => ({
      ...r.review,
      productName: r.productName ?? "Product",
      productImage: (Array.isArray(r.productImages) ? r.productImages[0] : null) ?? null,
    }));

    if (ratingFilter) reviews = reviews.filter((r) => r.rating === ratingFilter);
    if (reportedOnly) reviews = reviews.filter((r) => r.reported);

    res.json({ reviews });
  } catch (err: any) {
    req.log?.error({ err }, "seller/reviews failed");
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

router.post("/seller/reviews/:id/reply", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { id } = req.params;
  const { reply } = req.body;
  if (!reply || !String(reply).trim()) return res.status(400).json({ error: "reply is required" });

  try {
    const [review] = await db.select().from(productReviewsTable).where(eq(productReviewsTable.id, id)).limit(1);
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.vendorId !== vendorId) return res.status(403).json({ error: "Forbidden" });

    const [updated] = await db
      .update(productReviewsTable)
      .set({ sellerReply: String(reply).trim(), sellerRepliedAt: new Date() })
      .where(eq(productReviewsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "seller/reviews/reply failed");
    res.status(500).json({ error: "Failed to reply to review" });
  }
});

router.post("/seller/reviews/:id/report", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const [review] = await db.select().from(productReviewsTable).where(eq(productReviewsTable.id, id)).limit(1);
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.vendorId !== vendorId) return res.status(403).json({ error: "Forbidden" });

    const [updated] = await db
      .update(productReviewsTable)
      .set({ reported: true, reportReason: reason ? String(reason).trim() : "Reported by seller" })
      .where(eq(productReviewsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "seller/reviews/report failed");
    res.status(500).json({ error: "Failed to report review" });
  }
});

// ---------- Product Queries ----------

router.get("/seller/queries", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const status = (req.query.status as string | undefined)?.trim();

  try {
    const rows = await db
      .select({
        query: productQueriesTable,
        productName: productsTable.name,
        productImages: productsTable.images,
      })
      .from(productQueriesTable)
      .leftJoin(productsTable, eq(productQueriesTable.productId, productsTable.id))
      .where(eq(productQueriesTable.vendorId, vendorId))
      .orderBy(desc(productQueriesTable.createdAt));

    let queries = rows.map((r) => ({
      ...r.query,
      productName: r.productName ?? "Product",
      productImage: (Array.isArray(r.productImages) ? r.productImages[0] : null) ?? null,
    }));

    if (status && status !== "all") queries = queries.filter((q) => q.status === status);

    res.json({ queries });
  } catch (err: any) {
    req.log?.error({ err }, "seller/queries failed");
    res.status(500).json({ error: "Failed to load queries" });
  }
});

router.post("/seller/queries/:id/reply", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { id } = req.params;
  const { reply, status } = req.body;
  if (!reply || !String(reply).trim()) return res.status(400).json({ error: "reply is required" });

  try {
    const [query] = await db.select().from(productQueriesTable).where(eq(productQueriesTable.id, id)).limit(1);
    if (!query) return res.status(404).json({ error: "Query not found" });
    if (query.vendorId !== vendorId) return res.status(403).json({ error: "Forbidden" });

    const nextStatus = status && ["Open", "In Progress", "Resolved"].includes(status) ? status : "Resolved";

    const [updated] = await db
      .update(productQueriesTable)
      .set({ sellerReply: String(reply).trim(), sellerRepliedAt: new Date(), status: nextStatus, updatedAt: new Date() })
      .where(eq(productQueriesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "seller/queries/reply failed");
    res.status(500).json({ error: "Failed to reply to query" });
  }
});

router.patch("/seller/queries/:id/status", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { id } = req.params;
  const { status } = req.body;
  if (!["Open", "In Progress", "Resolved"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const [query] = await db.select().from(productQueriesTable).where(eq(productQueriesTable.id, id)).limit(1);
    if (!query) return res.status(404).json({ error: "Query not found" });
    if (query.vendorId !== vendorId) return res.status(403).json({ error: "Forbidden" });

    const [updated] = await db
      .update(productQueriesTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(productQueriesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "seller/queries/status failed");
    res.status(500).json({ error: "Failed to update query status" });
  }
});

// ---------- Support Tickets (vendor-scoped) ----------

router.get("/seller/tickets", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const status = (req.query.status as string | undefined)?.trim();
  const priority = (req.query.priority as string | undefined)?.trim();

  try {
    let tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.vendorId, vendorId))
      .orderBy(desc(supportTicketsTable.updatedAt));

    if (status && status !== "all") tickets = tickets.filter((t) => t.status === status);
    if (priority && priority !== "all") tickets = tickets.filter((t) => t.priority === priority);

    res.json({ tickets });
  } catch (err: any) {
    req.log?.error({ err }, "seller/tickets failed");
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

router.get("/seller/tickets/:id", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { id } = req.params;

  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, vendorId)))
      .limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const messages = await db
      .select()
      .from(ticketMessagesTable)
      .where(eq(ticketMessagesTable.ticketId, id))
      .orderBy(ticketMessagesTable.createdAt);

    res.json({ ...ticket, messages });
  } catch (err: any) {
    req.log?.error({ err }, "seller/tickets/:id failed");
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

router.post("/seller/tickets/:id/messages", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { id } = req.params;
  const { body } = req.body;
  if (!body || !String(body).trim()) return res.status(400).json({ error: "body is required" });

  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, vendorId)))
      .limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const [msg] = await db
      .insert(ticketMessagesTable)
      .values({ ticketId: id, userId: req.userId, body: String(body).trim(), isStaff: true })
      .returning();

    await db.update(supportTicketsTable).set({ updatedAt: new Date() }).where(eq(supportTicketsTable.id, id));

    res.status(201).json(msg);
  } catch (err: any) {
    req.log?.error({ err }, "seller/tickets/:id/messages failed");
    res.status(500).json({ error: "Failed to add message" });
  }
});

router.patch("/seller/tickets/:id", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { id } = req.params;
  const { status, priority } = req.body;

  const validStatuses = ["Open", "In Progress", "Resolved", "Closed", "Waiting for Customer"];
  const validPriorities = ["Low", "Medium", "High", "Urgent"];

  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  if (priority !== undefined && !validPriorities.includes(priority)) {
    return res.status(400).json({ error: "Invalid priority" });
  }

  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.vendorId, vendorId)))
      .limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const updateSet: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined) updateSet.status = status;
    if (priority !== undefined) updateSet.priority = priority;

    const [updated] = await db
      .update(supportTicketsTable)
      .set(updateSet)
      .where(eq(supportTicketsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    req.log?.error({ err }, "seller/tickets/:id patch failed");
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// ---------- Summary Dashboard ----------

router.get("/seller/customers-summary", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;

  try {
    const productIdSet = await getVendorProductIds(vendorId);

    let totalCustomers = 0;
    let activeCustomers = 0;
    if (productIdSet.size > 0) {
      const allOrders = await db.select().from(ordersTable);
      const lastOrderMap = new Map<string, Date>();
      for (const order of allOrders) {
        const items = (order.items as any[]) ?? [];
        if (!items.some((i) => productIdSet.has(i.productId))) continue;
        const existing = lastOrderMap.get(order.userId);
        if (!existing || new Date(order.createdAt) > existing) {
          lastOrderMap.set(order.userId, new Date(order.createdAt));
        }
      }
      totalCustomers = lastOrderMap.size;
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      activeCustomers = [...lastOrderMap.values()].filter((d) => d.getTime() >= cutoff).length;
    }

    const [reviewStats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        avgRating: sql<number>`coalesce(avg(${productReviewsTable.rating}), 0)`,
        reported: sql<number>`count(*) filter (where ${productReviewsTable.reported} = true)::int`,
      })
      .from(productReviewsTable)
      .where(eq(productReviewsTable.vendorId, vendorId));

    const [pendingQueries] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productQueriesTable)
      .where(and(eq(productQueriesTable.vendorId, vendorId), sql`${productQueriesTable.status} != 'Resolved'`));

    const [openTickets] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.vendorId, vendorId),
          sql`${supportTicketsTable.status} IN ('Open', 'In Progress', 'Waiting for Customer')`
        )
      );

    res.json({
      totalCustomers,
      activeCustomers,
      totalReviews: reviewStats?.count ?? 0,
      avgRating: Number(reviewStats?.avgRating ?? 0),
      reportedReviews: reviewStats?.reported ?? 0,
      pendingQueries: pendingQueries?.count ?? 0,
      openTickets: openTickets?.count ?? 0,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/customers-summary failed");
    res.status(500).json({ error: "Failed to load summary" });
  }
});

export default router;
