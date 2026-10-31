import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { db, mongoSupport, mongoGeneric, mongoProducts } from "@workspace/db";
import {
  ordersTable,
  productsTable,
  productReviewsTable,
  productQueriesTable,
  supportTicketsTable,
  ticketMessagesTable,
  notificationsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";

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

async function getVendorProductIds(vendorId: string, candidateVendorIds: string[] = []): Promise<Set<string>> {
  const allVendorIds = Array.from(new Set([vendorId, ...candidateVendorIds].filter(Boolean)));
  try {
    const prods = await mongoProducts.find({ vendorId: { $in: allVendorIds } });
    if (prods && prods.length > 0) {
      return new Set(prods.map((p: any) => String(p._id || p.id)));
    }
  } catch {}
  const products = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(inArray(productsTable.vendorId, allVendorIds))
    .catch(() => []);
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
          c.phone.toLowerCase().includes(search) ||
          c.city.toLowerCase().includes(search) ||
          c.state.toLowerCase().includes(search)
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

    let reviews: any[] = [];
    try {
      const col = mongoGeneric.getCollection("product_reviews");
      reviews = await col.find({ userId, vendorId }).sort({ createdAt: -1 }).toArray();
    } catch {
      reviews = await db
        .select()
        .from(productReviewsTable)
        .where(and(eq(productReviewsTable.userId, userId), eq(productReviewsTable.vendorId, vendorId)))
        .orderBy(desc(productReviewsTable.createdAt))
        .catch(() => []);
    }

    let queries: any[] = [];
    try {
      const col = mongoGeneric.getCollection("product_queries");
      queries = await col.find({ userId, vendorId }).sort({ createdAt: -1 }).toArray();
    } catch {
      queries = await db
        .select()
        .from(productQueriesTable)
        .where(and(eq(productQueriesTable.userId, userId), eq(productQueriesTable.vendorId, vendorId)))
        .orderBy(desc(productQueriesTable.createdAt))
        .catch(() => []);
    }

    let tickets: any[] = [];
    try {
      tickets = await mongoSupport.findTickets({ userId, vendorId }, { sort: { createdAt: -1 } });
    } catch {
      tickets = await db
        .select()
        .from(supportTicketsTable)
        .where(and(eq(supportTicketsTable.userId, userId), eq(supportTicketsTable.vendorId, vendorId)))
        .orderBy(desc(supportTicketsTable.createdAt))
        .catch(() => []);
    }

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
    let rawReviews: any[] = [];
    try {
      const col = mongoGeneric.getCollection("product_reviews");
      rawReviews = await col.find({ vendorId }).sort({ createdAt: -1 }).toArray();
    } catch {}

    if (rawReviews.length === 0) {
      const rows = await db
        .select({
          review: productReviewsTable,
          productName: productsTable.name,
          productImages: productsTable.images,
        })
        .from(productReviewsTable)
        .leftJoin(productsTable, eq(productReviewsTable.productId, productsTable.id))
        .where(eq(productReviewsTable.vendorId, vendorId))
        .orderBy(desc(productReviewsTable.createdAt))
        .catch(() => []);

      rawReviews = rows.map((r) => ({
        ...r.review,
        productName: r.productName ?? "Product",
        productImage: (Array.isArray(r.productImages) ? r.productImages[0] : null) ?? null,
      }));
    } else {
      const productIds = Array.from(new Set(rawReviews.map((r) => r.productId).filter(Boolean)));
      const productMap = new Map<string, any>();
      await Promise.all(
        productIds.map(async (pid) => {
          try {
            const p = await mongoProducts.findById(pid);
            if (p) productMap.set(pid, p);
          } catch {}
        })
      );
      rawReviews = rawReviews.map((r) => {
        const prod = productMap.get(r.productId);
        return {
          ...r,
          id: r.id || r._id,
          productName: prod?.name || r.productName || "Product",
          productImage: (Array.isArray(prod?.images) ? prod.images[0] : prod?.image) || null,
        };
      });
    }

    let reviews = rawReviews;
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
    let review: any = null;
    let col: any = null;
    try {
      col = mongoGeneric.getCollection("product_reviews");
      review = await col.findOne({ $or: [{ id }, { _id: id }] });
    } catch {}

    if (!review) {
      const [r] = await db.select().from(productReviewsTable).where(eq(productReviewsTable.id, id)).limit(1).catch(() => []);
      review = r;
    }

    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.vendorId && review.vendorId !== vendorId) return res.status(403).json({ error: "Forbidden" });

    const updateData = { sellerReply: String(reply).trim(), sellerRepliedAt: new Date() };

    let updated: any = null;
    if (col) {
      await col.updateOne({ $or: [{ id }, { _id: id }] }, { $set: updateData });
      updated = { ...review, ...updateData };
    }

    try {
      const [pgUpdated] = await db
        .update(productReviewsTable)
        .set(updateData)
        .where(eq(productReviewsTable.id, id))
        .returning()
        .catch(() => []);
      if (pgUpdated) updated = pgUpdated;
    } catch {}

    res.json(updated || { id, ...updateData });
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
    let review: any = null;
    let col: any = null;
    try {
      col = mongoGeneric.getCollection("product_reviews");
      review = await col.findOne({ $or: [{ id }, { _id: id }] });
    } catch {}

    if (!review) {
      const [r] = await db.select().from(productReviewsTable).where(eq(productReviewsTable.id, id)).limit(1).catch(() => []);
      review = r;
    }

    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.vendorId && review.vendorId !== vendorId) return res.status(403).json({ error: "Forbidden" });

    const updateData = { reported: true, reportReason: reason ? String(reason).trim() : "Reported by seller" };

    let updated: any = null;
    if (col) {
      await col.updateOne({ $or: [{ id }, { _id: id }] }, { $set: updateData });
      updated = { ...review, ...updateData };
    }

    try {
      const [pgUpdated] = await db
        .update(productReviewsTable)
        .set(updateData)
        .where(eq(productReviewsTable.id, id))
        .returning()
        .catch(() => []);
      if (pgUpdated) updated = pgUpdated;
    } catch {}

    res.json(updated || { id, ...updateData });
  } catch (err: any) {
    req.log?.error({ err }, "seller/reviews/report failed");
    res.status(500).json({ error: "Failed to report review" });
  }
});

// ---------- Product Queries ----------

router.get("/seller/queries", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const status = (req.query.status as string | undefined)?.trim();

  try {
    const productIdsSet = await getVendorProductIds(req.vendorId, vendorIds);
    const productIdsList = Array.from(productIdsSet);

    let rawQueries: any[] = [];
    try {
      const col = mongoGeneric.getCollection("product_queries");
      const mongoFilter: any = {
        $or: [
          { vendorId: { $in: vendorIds } },
          ...(productIdsList.length > 0 ? [{ productId: { $in: productIdsList } }] : []),
        ],
      };
      if (status && status !== "all") {
        mongoFilter.status = status;
      }
      rawQueries = await col.find(mongoFilter).sort({ createdAt: -1 }).toArray();
    } catch {}

    if (rawQueries.length === 0) {
      const conditions: any[] = [
        or(
          inArray(productQueriesTable.vendorId, vendorIds),
          productIdsList.length > 0 ? inArray(productQueriesTable.productId, productIdsList) : sql`false`
        ),
      ];
      if (status && status !== "all") {
        conditions.push(eq(productQueriesTable.status, status as any));
      }

      const rows = await db
        .select({
          query: productQueriesTable,
          productName: productsTable.name,
          productImages: productsTable.images,
        })
        .from(productQueriesTable)
        .leftJoin(productsTable, eq(productQueriesTable.productId, productsTable.id))
        .where(and(...conditions))
        .orderBy(desc(productQueriesTable.createdAt))
        .catch(() => []);

      rawQueries = rows.map((r) => ({
        ...r.query,
        productName: r.productName ?? "Product",
        productImage: (Array.isArray(r.productImages) ? r.productImages[0] : null) ?? null,
      }));
    } else {
      const productIds = Array.from(new Set(rawQueries.map((q) => q.productId).filter(Boolean)));
      const productMap = new Map<string, any>();
      await Promise.all(
        productIds.map(async (pid) => {
          try {
            const p = await mongoProducts.findById(pid);
            if (p) productMap.set(pid, p);
          } catch {}
        })
      );
      rawQueries = rawQueries.map((q) => {
        const prod = productMap.get(q.productId);
        return {
          ...q,
          id: q.id || q._id,
          productName: prod?.name || q.productName || "Product",
          productImage: (Array.isArray(prod?.images) ? prod.images[0] : prod?.image) || null,
        };
      });
    }

    let queries = rawQueries;
    if (status && status !== "all") queries = queries.filter((q) => q.status === status);

    res.json({ queries });
  } catch (err: any) {
    req.log?.error({ err }, "seller/queries failed");
    res.status(500).json({ error: "Failed to load queries" });
  }
});

router.post("/seller/queries/:id/reply", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const { id } = req.params;
  const { reply, status } = req.body;
  if (!reply || !String(reply).trim()) return res.status(400).json({ error: "reply is required" });

  try {
    let query: any = null;
    let col: any = null;
    try {
      col = mongoGeneric.getCollection("product_queries");
      query = await col.findOne({ $or: [{ id }, { _id: id }] });
    } catch {}

    if (!query) {
      const [q] = await db.select().from(productQueriesTable).where(eq(productQueriesTable.id, id)).limit(1).catch(() => []);
      query = q;
    }

    if (!query) return res.status(404).json({ error: "Query not found" });
    const productIdsSet = await getVendorProductIds(req.vendorId, vendorIds);
    const isOwner = !query.vendorId || vendorIds.includes(query.vendorId) || (query.productId && productIdsSet.has(query.productId));
    if (!isOwner) return res.status(403).json({ error: "Forbidden" });

    const nextStatus = status && ["Open", "In Progress", "Resolved"].includes(status) ? status : "Resolved";
    const updateData = {
      sellerReply: String(reply).trim(),
      sellerRepliedAt: new Date(),
      status: nextStatus,
      updatedAt: new Date(),
    };

    let updated: any = null;
    if (col) {
      await col.updateOne({ $or: [{ id }, { _id: id }] }, { $set: updateData });
      updated = { ...query, ...updateData };
    }

    try {
      const [pgUpdated] = await db
        .update(productQueriesTable)
        .set(updateData)
        .where(eq(productQueriesTable.id, id))
        .returning()
        .catch(() => []);
      if (pgUpdated) updated = pgUpdated;
    } catch {}

    res.json(updated || { id, ...updateData });
  } catch (err: any) {
    req.log?.error({ err }, "seller/queries/reply failed");
    res.status(500).json({ error: "Failed to reply to query" });
  }
});

router.patch("/seller/queries/:id/status", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const { id } = req.params;
  const { status } = req.body;
  if (!["Open", "In Progress", "Resolved"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    let query: any = null;
    let col: any = null;
    try {
      col = mongoGeneric.getCollection("product_queries");
      query = await col.findOne({ $or: [{ id }, { _id: id }] });
    } catch {}

    if (!query) {
      const [q] = await db.select().from(productQueriesTable).where(eq(productQueriesTable.id, id)).limit(1).catch(() => []);
      query = q;
    }

    if (!query) return res.status(404).json({ error: "Query not found" });
    const productIdsSet = await getVendorProductIds(req.vendorId, vendorIds);
    const isOwner = !query.vendorId || vendorIds.includes(query.vendorId) || (query.productId && productIdsSet.has(query.productId));
    if (!isOwner) return res.status(403).json({ error: "Forbidden" });

    const updateData = { status, updatedAt: new Date() };

    let updated: any = null;
    if (col) {
      await col.updateOne({ $or: [{ id }, { _id: id }] }, { $set: updateData });
      updated = { ...query, ...updateData };
    }

    try {
      const [pgUpdated] = await db
        .update(productQueriesTable)
        .set(updateData)
        .where(eq(productQueriesTable.id, id))
        .returning()
        .catch(() => []);
      if (pgUpdated) updated = pgUpdated;
    } catch {}

    res.json(updated || { id, ...updateData });
  } catch (err: any) {
    req.log?.error({ err }, "seller/queries/status failed");
    res.status(500).json({ error: "Failed to update query status" });
  }
});

// ---------- Support Tickets (vendor-scoped) ----------

router.get("/seller/tickets", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const status = (req.query.status as string | undefined)?.trim();
  const priority = (req.query.priority as string | undefined)?.trim();

  try {
    let tickets: any[] = [];
    try {
      const filter: any = {
        $or: [
          { vendorId: { $in: vendorIds } },
          { userId: req.userId },
        ],
      };
      if (status && status !== "all") filter.status = status;
      if (priority && priority !== "all") filter.priority = priority;
      tickets = await mongoSupport.findTickets(filter, { sort: { updatedAt: -1 } });
    } catch {
      // Fallback
    }

    if (tickets.length === 0) {
      const conditions: any[] = [
        or(
          inArray(supportTicketsTable.vendorId, vendorIds),
          eq(supportTicketsTable.userId, req.userId)
        ),
      ];
      if (status && status !== "all") tickets = tickets.filter((t: any) => t.status === status);
      if (priority && priority !== "all") tickets = tickets.filter((t: any) => t.priority === priority);

      tickets = await db
        .select()
        .from(supportTicketsTable)
        .where(and(...conditions))
        .orderBy(desc(supportTicketsTable.updatedAt))
        .catch(() => []);
    }

    res.json({ tickets });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/tickets failed");
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

router.get("/seller/tickets/:id", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const { id } = req.params;

  try {
    let ticket: any = null;
    let messages: any[] = [];

    try {
      ticket = await mongoSupport.findTicketById(id);
      const isOwner = ticket && (vendorIds.includes(ticket.vendorId) || ticket.userId === req.userId);
      if (ticket && isOwner) {
        messages = await mongoSupport.findTicketMessages(id);
      } else if (ticket && !isOwner) {
        return res.status(404).json({ error: "Ticket not found" });
      }
    } catch {
      // Fallback
    }

    if (!ticket) {
      const [t] = await db
        .select()
        .from(supportTicketsTable)
        .where(and(eq(supportTicketsTable.id, id), or(inArray(supportTicketsTable.vendorId, vendorIds), eq(supportTicketsTable.userId, req.userId))))
        .limit(1)
        .catch(() => []);
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

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json({ ...ticket, messages });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/tickets/:id failed");
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

router.post("/seller/tickets/:id/messages", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const { id } = req.params;
  const { body, internal } = req.body;
  if (!body || !String(body).trim()) return res.status(400).json({ error: "body is required" });

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
        .limit(1)
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || (!vendorIds.includes(ticket.vendorId) && ticket.userId !== req.userId)) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    let msg: any = null;
    try {
      msg = await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: req.userId,
        vendorId: req.vendorId,
        body: String(body).trim(),
        isStaff: true,
        internal: Boolean(internal),
      });
      await mongoSupport.updateTicket(id, { updatedAt: new Date() });
    } catch {
      const [m] = await db
        .insert(ticketMessagesTable)
        .values({ ticketId: id, userId: req.userId, body: String(body).trim(), isStaff: true, internal: Boolean(internal) })
        .returning()
        .catch(() => []);
      msg = m;
      await db.update(supportTicketsTable).set({ updatedAt: new Date() }).where(eq(supportTicketsTable.id, id)).catch(() => {});
    }

    res.status(201).json(msg || { ticketId: id, userId: req.userId, body: String(body).trim(), createdAt: new Date() });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/tickets/:id/messages failed");
    res.status(500).json({ error: "Failed to add message" });
  }
});

router.post("/seller/tickets/:id/escalate", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
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
        .where(and(eq(supportTicketsTable.id, id), or(inArray(supportTicketsTable.vendorId, vendorIds), eq(supportTicketsTable.userId, req.userId))))
        .limit(1)
        .catch(() => []);
      ticket = t;
    }

    if (!ticket || (!vendorIds.includes(ticket.vendorId) && ticket.userId !== req.userId)) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const updates = { isDispute: true, disputeStatus: "needs_admin", updatedAt: new Date() };
    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, updates);
      await mongoSupport.insertTicketMessage({
        ticketId: id,
        userId: req.userId,
        body: reason && String(reason).trim() ? `Escalated to admin: ${String(reason).trim()}` : "Escalated to admin for dispute resolution.",
        isStaff: true,
        internal: true,
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
        userId: req.userId,
        body: reason && String(reason).trim() ? `Escalated to admin: ${String(reason).trim()}` : "Escalated to admin for dispute resolution.",
        isStaff: true,
        internal: true,
      }).catch(() => {});
    }

    res.json(updated || { ...ticket, ...updates });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/tickets/:id/escalate failed");
    res.status(500).json({ error: "Failed to escalate ticket" });
  }
});

router.post("/seller/tickets/:id/evidence", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const { id } = req.params;
  const { url } = req.body;
  if (!url || !String(url).trim()) return res.status(400).json({ error: "url is required" });

  try {
    let ticket: any = null;
    try {
      ticket = await mongoSupport.findTicketById(id);
    } catch {}
    if (!ticket) {
      const [t] = await db
        .select()
        .from(supportTicketsTable)
        .where(and(eq(supportTicketsTable.id, id), or(inArray(supportTicketsTable.vendorId, vendorIds), eq(supportTicketsTable.userId, req.userId))))
        .limit(1)
        .catch(() => []);
      ticket = t;
    }
    if (!ticket || (!vendorIds.includes(ticket.vendorId) && ticket.userId !== req.userId)) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const nextEvidence = [...(ticket.evidenceUrls ?? []), String(url).trim()];

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, { evidenceUrls: nextEvidence, updatedAt: new Date() });
    } catch {
      const [u] = await db
        .update(supportTicketsTable)
        .set({ evidenceUrls: nextEvidence, updatedAt: new Date() })
        .where(eq(supportTicketsTable.id, id))
        .returning()
        .catch(() => []);
      updated = u;
    }

    res.json(updated || { ...ticket, evidenceUrls: nextEvidence });
  } catch (err: any) {
    req.log?.error({ err }, "seller/tickets/:id/evidence failed");
    res.status(500).json({ error: "Failed to add evidence" });
  }
});

router.patch("/seller/tickets/:id", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
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
    let ticket: any = null;
    try {
      ticket = await mongoSupport.findTicketById(id);
    } catch {}
    if (!ticket) {
      const [t] = await db
        .select()
        .from(supportTicketsTable)
        .where(and(eq(supportTicketsTable.id, id), or(inArray(supportTicketsTable.vendorId, vendorIds), eq(supportTicketsTable.userId, req.userId))))
        .limit(1)
        .catch(() => []);
      ticket = t;
    }
    if (!ticket || (!vendorIds.includes(ticket.vendorId) && ticket.userId !== req.userId)) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const updateSet: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined) updateSet.status = status;
    if (priority !== undefined) updateSet.priority = priority;

    let updated: any = null;
    try {
      updated = await mongoSupport.updateTicket(id, updateSet);
    } catch {
      const [u] = await db
        .update(supportTicketsTable)
        .set(updateSet)
        .where(eq(supportTicketsTable.id, id))
        .returning()
        .catch(() => []);
      updated = u;
    }

    res.json(updated || { ...ticket, ...updateSet });
  } catch (err: any) {
    req.log?.error({ err }, "seller/tickets/:id patch failed");
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// ---------- Summary Dashboard ----------

router.get("/seller/customers-summary", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const vendorId = req.vendorId;

  try {
    const productIdSet = await getVendorProductIds(vendorId, vendorIds);
    const productIdsList = Array.from(productIdSet);

    let totalCustomers = 0;
    let activeCustomers = 0;
    if (productIdSet.size > 0) {
      const allOrders = await db.select().from(ordersTable).catch(() => []);
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
      .where(or(inArray(productReviewsTable.vendorId, vendorIds), eq(productReviewsTable.vendorId, vendorId)))
      .catch(() => [{ count: 0, avgRating: 0, reported: 0 }]);

    let pendingQueriesCount = 0;
    try {
      const col = mongoGeneric.getCollection("product_queries");
      pendingQueriesCount = await col.countDocuments({
        $or: [
          { vendorId: { $in: vendorIds } },
          ...(productIdsList.length > 0 ? [{ productId: { $in: productIdsList } }] : []),
        ],
        status: { $ne: "Resolved" },
      });
    } catch {
      const [pendingQueries] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(productQueriesTable)
        .where(and(inArray(productQueriesTable.vendorId, vendorIds), sql`${productQueriesTable.status} != 'Resolved'`))
        .catch(() => [{ count: 0 }]);
      pendingQueriesCount = pendingQueries?.count ?? 0;
    }

    let openTicketsCount = 0;
    try {
      openTicketsCount = await mongoSupport.countTickets({
        vendorId: { $in: vendorIds },
        status: { $in: ["Open", "In Progress", "Waiting for Customer"] },
      });
    } catch {
      const [openTickets] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(
          and(
            inArray(supportTicketsTable.vendorId, vendorIds),
            sql`${supportTicketsTable.status} IN ('Open', 'In Progress', 'Waiting for Customer')`
          )
        )
        .catch(() => [{ count: 0 }]);
      openTicketsCount = openTickets?.count ?? 0;
    }

    res.json({
      totalCustomers,
      activeCustomers,
      totalReviews: reviewStats?.count ?? 0,
      avgRating: Number(reviewStats?.avgRating ?? 0),
      reportedReviews: reviewStats?.reported ?? 0,
      pendingQueries: pendingQueriesCount,
      openTickets: openTicketsCount,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/customers-summary failed");
    res.status(500).json({ error: "Failed to load summary" });
  }
});

router.get("/seller/dashboard-summary", requireVendorAuth, async (req: any, res: any) => {
  const vendorIds = getCandidateVendorIds(req);
  const vendorId = req.vendorId;

  try {
    const productIdSet = await getVendorProductIds(vendorId, vendorIds);
    const productIdsList = Array.from(productIdSet);

    let newOrders = 0;
    let pendingReturns = 0;
    if (productIdSet.size > 0) {
      const allOrders = await db.select().from(ordersTable).catch(() => []);
      for (const order of allOrders) {
        const items = (order.items as any[]) ?? [];
        if (!items.some((i) => productIdSet.has(i.productId))) continue;
        if (order.status === "confirmed") newOrders += 1;
        if (order.status === "return_requested") pendingReturns += 1;
      }
    }

    const [unreadNotifications] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(inArray(notificationsTable.vendorId, vendorIds), eq(notificationsTable.read, false)))
      .catch(() => [{ count: 0 }]);

    const [lowStock] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productsTable)
      .where(and(inArray(productsTable.vendorId, vendorIds), sql`${productsTable.stock} <= ${productsTable.lowStockThreshold}`))
      .catch(() => [{ count: 0 }]);

    let openTicketsCount = 0;
    try {
      openTicketsCount = await mongoSupport.countTickets({
        vendorId: { $in: vendorIds },
        status: { $in: ["Open", "In Progress", "Waiting for Customer"] },
      });
    } catch {
      const [openTickets] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(
          and(
            inArray(supportTicketsTable.vendorId, vendorIds),
            sql`${supportTicketsTable.status} IN ('Open', 'In Progress', 'Waiting for Customer')`
          )
        )
        .catch(() => [{ count: 0 }]);
      openTicketsCount = openTickets?.count ?? 0;
    }

    let pendingQueriesCount = 0;
    try {
      const col = mongoGeneric.getCollection("product_queries");
      pendingQueriesCount = await col.countDocuments({
        $or: [
          { vendorId: { $in: vendorIds } },
          ...(productIdsList.length > 0 ? [{ productId: { $in: productIdsList } }] : []),
        ],
        status: { $ne: "Resolved" },
      });
    } catch {
      const [pendingQueries] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(productQueriesTable)
        .where(and(inArray(productQueriesTable.vendorId, vendorIds), sql`${productQueriesTable.status} != 'Resolved'`))
        .catch(() => [{ count: 0 }]);
      pendingQueriesCount = pendingQueries?.count ?? 0;
    }

    let activeComplaintsCount = 0;
    try {
      activeComplaintsCount = await mongoSupport.countTickets({
        vendorId: { $in: vendorIds },
        category: { $in: ["Order Issue", "Return/Refund"] },
        status: { $nin: ["Resolved", "Closed"] },
      });
    } catch {
      const [activeComplaints] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(
          and(
            inArray(supportTicketsTable.vendorId, vendorIds),
            sql`${supportTicketsTable.category} IN ('Order Issue', 'Return/Refund')`,
            sql`${supportTicketsTable.status} NOT IN ('Resolved', 'Closed')`
          )
        )
        .catch(() => [{ count: 0 }]);
      activeComplaintsCount = activeComplaints?.count ?? 0;
    }

    let activeDisputesCount = 0;
    try {
      activeDisputesCount = await mongoSupport.countTickets({
        vendorId: { $in: vendorIds },
        isDispute: true,
        disputeStatus: { $ne: "resolved" },
      });
    } catch {
      const [activeDisputes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(
          and(
            inArray(supportTicketsTable.vendorId, vendorIds),
            eq(supportTicketsTable.isDispute, true),
            sql`${supportTicketsTable.disputeStatus} != 'resolved'`
          )
        )
        .catch(() => [{ count: 0 }]);
      activeDisputesCount = activeDisputes?.count ?? 0;
    }

    res.json({
      unreadNotifications: unreadNotifications?.count ?? 0,
      newOrders,
      pendingReturns,
      lowStock: lowStock?.count ?? 0,
      openTickets: openTicketsCount,
      pendingQueries: pendingQueriesCount,
      activeComplaints: activeComplaintsCount,
      activeDisputes: activeDisputesCount,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/dashboard-summary failed");
    res.status(500).json({ error: "Failed to load dashboard summary" });
  }
});

export default router;
