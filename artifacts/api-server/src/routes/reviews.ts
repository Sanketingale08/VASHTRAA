import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { productsTable, productReviewsTable, productQueriesTable, ordersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};

router.get("/products/:productId/reviews", async (req: any, res: any) => {
  const { productId } = req.params;
  try {
    const reviews = await db
      .select()
      .from(productReviewsTable)
      .where(eq(productReviewsTable.productId, productId))
      .orderBy(desc(productReviewsTable.createdAt));
    res.json({ reviews });
  } catch (err: any) {
    req.log?.error({ err }, "GET product reviews failed");
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

router.post("/products/:productId/reviews", requireAuth, async (req: any, res: any) => {
  const { productId } = req.params;
  const { rating, comment, orderId, customerName } = req.body;

  const parsedRating = parseInt(rating);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ error: "rating must be an integer between 1 and 5" });
  }

  try {
    const [product] = await db
      .select({ id: productsTable.id, vendorId: productsTable.vendorId, reviewCount: productsTable.reviewCount, rating: productsTable.rating })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const [review] = await db
      .insert(productReviewsTable)
      .values({
        productId,
        vendorId: product.vendorId,
        orderId: orderId ?? null,
        userId: req.userId,
        customerName: customerName?.trim() || "Customer",
        rating: parsedRating,
        comment: comment?.trim() ?? "",
      })
      .returning();

    const newCount = product.reviewCount + 1;
    const newAvg = (product.rating * product.reviewCount + parsedRating) / newCount;
    await db
      .update(productsTable)
      .set({ reviewCount: newCount, rating: Math.round(newAvg * 10) / 10 })
      .where(eq(productsTable.id, productId));

    res.status(201).json(review);
  } catch (err: any) {
    req.log?.error({ err }, "POST product review failed");
    res.status(500).json({ error: "Failed to submit review" });
  }
});

router.post("/products/:productId/queries", requireAuth, async (req: any, res: any) => {
  const { productId } = req.params;
  const { subject, message, customerName } = req.body;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const [product] = await db
      .select({ id: productsTable.id, vendorId: productsTable.vendorId })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const [query] = await db
      .insert(productQueriesTable)
      .values({
        productId,
        vendorId: product.vendorId,
        userId: req.userId,
        customerName: customerName?.trim() || "Customer",
        subject: subject?.trim() ?? "",
        message: String(message).trim(),
      })
      .returning();

    res.status(201).json(query);
  } catch (err: any) {
    req.log?.error({ err }, "POST product query failed");
    res.status(500).json({ error: "Failed to submit query" });
  }
});

router.get("/products/:productId/queries", async (req: any, res: any) => {
  const { productId } = req.params;
  try {
    const queries = await db
      .select()
      .from(productQueriesTable)
      .where(eq(productQueriesTable.productId, productId))
      .orderBy(desc(productQueriesTable.createdAt));
    res.json({ queries });
  } catch (err: any) {
    req.log?.error({ err }, "GET product queries failed");
    res.status(500).json({ error: "Failed to load queries" });
  }
});

export default router;
