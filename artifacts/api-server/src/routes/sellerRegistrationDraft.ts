import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { sellerRegistrationDraftsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};

router.get("/seller/registration-draft", requireAuth, async (req: any, res: any) => {
  try {
    const [draft] = await db
      .select()
      .from(sellerRegistrationDraftsTable)
      .where(eq(sellerRegistrationDraftsTable.userId, req.userId))
      .limit(1);

    if (!draft) {
      return res.status(404).json({ error: "No draft found" });
    }

    res.json({ data: draft.data, step: draft.step, updatedAt: draft.updatedAt });
  } catch (err: any) {
    req.log?.error({ err }, "seller/registration-draft GET failed");
    res.status(500).json({ error: "Failed to load draft" });
  }
});

router.put("/seller/registration-draft", requireAuth, async (req: any, res: any) => {
  const { data, step } = req.body;

  if (typeof step !== "number" || step < 2) {
    return res.status(400).json({ error: "step must be a number >= 2" });
  }
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "data must be an object" });
  }

  try {
    await db
      .insert(sellerRegistrationDraftsTable)
      .values({ userId: req.userId, data, step, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: sellerRegistrationDraftsTable.userId,
        set: { data, step, updatedAt: new Date() },
      });

    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/registration-draft PUT failed");
    res.status(500).json({ error: "Failed to save draft" });
  }
});

router.delete("/seller/registration-draft", requireAuth, async (req: any, res: any) => {
  try {
    await db
      .delete(sellerRegistrationDraftsTable)
      .where(eq(sellerRegistrationDraftsTable.userId, req.userId));
    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error({ err }, "seller/registration-draft DELETE failed");
    res.status(500).json({ error: "Failed to delete draft" });
  }
});

export default router;
