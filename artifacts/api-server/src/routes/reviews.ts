import { Router } from "express";
import crypto from "crypto";
import { requireAuth, isAuthenticated } from "../middlewares/isAuthenticated";
import { db, mongoProducts, mongoGeneric, mongoSupport } from "@workspace/db";
import { productsTable, productReviewsTable, productQueriesTable, ordersTable } from "@workspace/db";
import { eq, desc, and } from "@workspace/db";
import { emitProductEvent } from "../lib/socket";
import { safeClearCache, safeInvalidatePattern } from "../lib/cacheEngine";
import { computeSlaDueAt, notifyTicketEvent } from "../lib/ticketSupport";
import { reviewLimiter } from "../middlewares/rateLimiter";

const router = Router();

router.get("/products/:productId/reviews", async (req: any, res: any) => {
  const { productId } = req.params;
  try {
    let reviews: any[] = [];
    try {
      const col = mongoGeneric.getCollection("product_reviews");
      reviews = await col.find({ productId }).sort({ createdAt: -1 }).toArray();
    } catch {
      reviews = await db
        .select()
        .from(productReviewsTable)
        .where(eq(productReviewsTable.productId, productId))
        .orderBy(desc(productReviewsTable.createdAt));
    }

    const reviewCount = reviews.length;
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    const averageRating = reviewCount > 0 ? Math.round((sum / reviewCount) * 10) / 10 : 0;

    const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of reviews) {
      const rNum = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
      if (rNum >= 1 && rNum <= 5) {
        (ratingBreakdown as any)[rNum]++;
      }
    }

    res.json({
      reviews,
      reviewCount,
      averageRating,
      ratingBreakdown,
    });
  } catch (err: any) {
    req.log?.error({ err }, "GET product reviews failed");
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

router.post("/products/:productId/reviews", reviewLimiter, requireAuth, async (req: any, res: any) => {
  const { productId } = req.params;
  let { rating, comment, orderId, customerName } = req.body;

  const parsedRating = parseInt(rating);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ error: "rating must be an integer between 1 and 5" });
  }

  try {
    // Check if user already reviewed this product to prevent review stuffing
    if (req.userId) {
      let existingReview = null;
      try {
        const col = mongoGeneric.getCollection("product_reviews");
        existingReview = await col.findOne({ productId, userId: req.userId });
      } catch {}

      if (!existingReview) {
        const [r] = await db
          .select({ id: productReviewsTable.id })
          .from(productReviewsTable)
          .where(and(eq(productReviewsTable.productId, productId), eq(productReviewsTable.userId, req.userId)))
          .limit(1)
          .catch(() => []);
        existingReview = r;
      }

      if (existingReview) {
        return res.status(409).json({ error: "You have already reviewed this product." });
      }
    }

    // 1. Fetch product vendorId
    let vendorId: string | null = null;
    try {
      const product = await mongoProducts.findById(productId);
      if (product) vendorId = product.vendorId ?? null;
    } catch {}

    if (!vendorId) {
      const [p] = await db
        .select({ id: productsTable.id, vendorId: productsTable.vendorId })
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);
      if (p) vendorId = p.vendorId ?? null;
    }

    // 2. Automatically link orderId if user purchased this product and orderId wasn't passed
    if (!orderId && req.userId) {
      try {
        const userOrders = await db
          .select({ id: ordersTable.id, items: ordersTable.items })
          .from(ordersTable)
          .where(eq(ordersTable.userId, req.userId));
        for (const o of userOrders) {
          const items = Array.isArray(o.items) ? o.items : [];
          if (items.some((it: any) => it.productId === productId || it.id === productId)) {
            orderId = o.id;
            break;
          }
        }
      } catch {}
    }

    const id = crypto.randomUUID();
    const reviewDoc = {
      id,
      _id: id,
      productId,
      vendorId: vendorId ?? null,
      orderId: orderId ?? null,
      userId: req.userId,
      customerName: customerName?.trim() || "Customer",
      rating: parsedRating,
      comment: comment?.trim() ?? "",
      createdAt: new Date(),
    };

    // Save to Mongo
    try {
      const col = mongoGeneric.getCollection("product_reviews");
      await col.insertOne(reviewDoc as any);
    } catch {}

    // Save to Postgres
    try {
      await db.insert(productReviewsTable).values({
        id,
        productId,
        vendorId: vendorId ?? null,
        orderId: orderId ?? null,
        userId: req.userId,
        customerName: customerName?.trim() || "Customer",
        rating: parsedRating,
        comment: comment?.trim() ?? "",
      });
    } catch {}

    // 3. Recalculate true aggregate rating & reviewCount for this product
    let allReviews: any[] = [];
    try {
      const col = mongoGeneric.getCollection("product_reviews");
      allReviews = await col.find({ productId }).toArray();
    } catch {
      allReviews = await db
        .select()
        .from(productReviewsTable)
        .where(eq(productReviewsTable.productId, productId));
    }

    const newCount = allReviews.length;
    const newSum = allReviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    const newAvg = newCount > 0 ? Math.round((newSum / newCount) * 10) / 10 : 0;

    // Update product rating and review count in DB & Mongo
    try {
      await mongoProducts.update(productId, {
        reviewCount: newCount,
        rating: newAvg,
      });
    } catch {}

    try {
      await db
        .update(productsTable)
        .set({ reviewCount: newCount, rating: newAvg })
        .where(eq(productsTable.id, productId));
    } catch {}

    // Clear caches
    safeClearCache();
    safeInvalidatePattern(/product/);

    // Emit socket event for realtime updates across open sessions/browsers
    emitProductEvent("product:updated", { id: productId, rating: newAvg, reviewCount: newCount });
    emitProductEvent("product:review_added", { productId, reviewId: id });

    res.status(201).json(reviewDoc);
  } catch (err: any) {
    req.log?.error({ err }, "POST product review failed");
    res.status(500).json({ error: "Failed to submit review" });
  }
});

router.post("/products/:productId/queries", async (req: any, res: any) => {
  try {
    await new Promise<void>((resolve) => {
      isAuthenticated(req, res, () => resolve());
    });
  } catch {}

  if (!req.userId) {
    const rawGuest = (req.headers["x-user-id"] as string) || req.body?.email || req.body?.customerEmail;
    if (rawGuest && typeof rawGuest === "string" && rawGuest.trim()) {
      req.userId = rawGuest.startsWith("guest_")
        ? rawGuest.trim()
        : `guest_${rawGuest.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    } else {
      req.userId = `guest_${crypto.randomUUID().slice(0, 8)}`;
    }
    req.userRole = "customer";
  }

  const { productId } = req.params;
  const { subject, message, customerName, name, email, customerEmail } = req.body;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    let product: any = null;
    try {
      product = await mongoProducts.findById(productId);
    } catch {}

    if (!product) {
      const [p] = await db
        .select({ id: productsTable.id, name: productsTable.name, vendorId: productsTable.vendorId })
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1)
        .catch(() => []);
      product = p;
    }

    if (!product) return res.status(404).json({ error: "Product not found" });

    const now = new Date();
    const id = crypto.randomUUID();
    const effectiveName = customerName?.trim() || name?.trim() || req.user?.name || "Customer";
    const effectiveEmail = customerEmail?.trim() || email?.trim() || req.user?.email || null;
    const cleanSubject = subject?.trim() || `Inquiry regarding ${product.name || "Product"}`;
    const cleanMessage = String(message).trim();
    const vendorId = product.vendorId || null;

    const queryDoc = {
      id,
      _id: id,
      productId,
      productName: product.name || "Product",
      vendorId,
      userId: req.userId,
      customerName: effectiveName,
      customerEmail: effectiveEmail,
      subject: cleanSubject,
      message: cleanMessage,
      status: "Open",
      createdAt: now,
      updatedAt: now,
    };

    try {
      await mongoGeneric.getCollection("product_queries").insertOne(queryDoc as any);
    } catch {
      await db
        .insert(productQueriesTable)
        .values({
          productId,
          vendorId,
          userId: req.userId,
          customerName: effectiveName,
          subject: cleanSubject,
          message: cleanMessage,
          status: "Open",
        })
        .catch(() => {});
    }

    // Auto-create corresponding Support Ticket under category "Product Query"
    const ticketId = `TCK_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const ticketData = {
      id: ticketId,
      userId: req.userId,
      userType: "customer",
      customerName: effectiveName,
      customerEmail: effectiveEmail,
      subject: cleanSubject,
      category: "Product Query",
      assignedTo: vendorId ? "seller" : "admin",
      vendorId,
      productId,
      attachments: [],
      slaDueAt: vendorId ? computeSlaDueAt(now) : null,
      status: "Open",
      createdAt: now,
      updatedAt: now,
      queryId: id,
    };

    try {
      await mongoSupport.insertTicket(ticketData);
      await mongoSupport.insertTicketMessage({
        ticketId,
        userId: req.userId,
        body: cleanMessage,
        attachments: [],
        isStaff: false,
        internal: false,
        createdAt: now,
      });
      await mongoSupport.insertTicketMessage({
        ticketId,
        userId: "system",
        body: vendorId
          ? "Your query has been submitted successfully and delivered to both the Seller and Admin."
          : "Your query has been submitted successfully. Our support team will respond within 24 hours.",
        attachments: [],
        isStaff: true,
        internal: false,
        createdAt: new Date(now.getTime() + 100),
      });
    } catch {}

    // Dispatch real-time notifications to Seller and Admin
    await notifyTicketEvent(
      ticketData,
      "new_customer_query",
      "New Product Query",
      `${effectiveName} inquired about "${product.name || "Product"}": ${cleanMessage.slice(0, 80)}`,
      { notifySeller: !!vendorId, notifyAdmin: true }
    ).catch(() => {});

    emitProductEvent("product:query_added", { productId, queryId: id });

    res.status(201).json(queryDoc);
  } catch (err: any) {
    req.log?.error({ err }, "POST product query failed");
    res.status(500).json({ error: "Failed to submit query" });
  }
});

export default router;
