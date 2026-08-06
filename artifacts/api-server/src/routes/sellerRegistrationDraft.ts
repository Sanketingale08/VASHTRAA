import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { sellerRegistrationDraftsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

const router = Router();

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isDraftExpired(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > DRAFT_TTL_MS;
}

export async function deleteExpiredRegistrationDrafts(): Promise<number> {
  const cutoff = new Date(Date.now() - DRAFT_TTL_MS);
  const deleted = await db
    .delete(sellerRegistrationDraftsTable)
    .where(lt(sellerRegistrationDraftsTable.updatedAt, cutoff))
    .returning({ id: sellerRegistrationDraftsTable.id });
  return deleted.length;
}

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

    if (isDraftExpired(draft.updatedAt)) {
      // Delete the stale draft and tell the caller to start fresh
      await db
        .delete(sellerRegistrationDraftsTable)
        .where(eq(sellerRegistrationDraftsTable.userId, req.userId));
      return res.status(404).json({ error: "Draft expired" });
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
      .values({ userId: req.userId, data, step, updatedAt: new Date(), nudgeSentAt: null })
      .onConflictDoUpdate({
        target: sellerRegistrationDraftsTable.userId,
        // Reset nudgeSentAt so an in-flight claim is invalidated and the draft
        // becomes eligible again only if it goes stale a second time.
        set: { data, step, updatedAt: new Date(), nudgeSentAt: null },
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
