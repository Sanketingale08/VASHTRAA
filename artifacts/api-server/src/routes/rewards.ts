import { Router } from "express";
import { isCustomer } from "../middlewares/isCustomer";
import { db } from "@workspace/db";
import { userProfilesTable, rewardPointsLogTable, referralsTable, ordersTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";

const router = Router();


function computeTier(totalPoints: number): "silver" | "gold" | "platinum" {
  if (totalPoints >= 5000) return "platinum";
  if (totalPoints >= 1000) return "gold";
  return "silver";
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getOrCreateProfile(userId: string) {
  const existing = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  let referralCode = generateReferralCode();
  let attempts = 0;
  while (attempts < 10) {
    const conflict = await db
      .select({ userId: userProfilesTable.userId })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.referralCode, referralCode))
      .limit(1);
    if (conflict.length === 0) break;
    referralCode = generateReferralCode();
    attempts++;
  }

  const [profile] = await db
    .insert(userProfilesTable)
    .values({ userId, referralCode })
    .onConflictDoNothing()
    .returning();

  if (profile) return profile;

  const [refetched] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  return refetched;
}

router.get("/rewards/summary", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const profile = await getOrCreateProfile(req.userId);

    const referralCountResult = await db
      .select({ cnt: count() })
      .from(referralsTable)
      .where(eq(referralsTable.referrerUserId, profile.userId));

    const referralCount = Number(referralCountResult[0]?.cnt ?? 0);

    res.json({
      balance: profile.totalPoints,
      tier: profile.loyaltyTier,
      lifetimeEarned: profile.lifetimePoints,
      referralCode: profile.referralCode,
      referralCount,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch rewards summary");
    res.status(500).json({ error: "Failed to fetch rewards summary" });
  }
});

router.get("/rewards/history", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(rewardPointsLogTable)
      .where(eq(rewardPointsLogTable.userId, req.userId))
      .orderBy(desc(rewardPointsLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ cnt: count() })
      .from(rewardPointsLogTable)
      .where(eq(rewardPointsLogTable.userId, req.userId));

    const total = Number(totalResult[0]?.cnt ?? 0);

    res.json({ history: rows, page, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch rewards history");
    res.status(500).json({ error: "Failed to fetch rewards history" });
  }
});

router.post("/rewards/referral/apply", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const { referralCode } = req.body;
    if (!referralCode || typeof referralCode !== "string") {
      res.status(400).json({ error: "referralCode is required" });
      return;
    }

    const code = referralCode.trim().toUpperCase();

    // Server-side check: referee must have placed exactly their first order
    const orderCountResult = await db
      .select({ cnt: count() })
      .from(ordersTable)
      .where(eq(ordersTable.userId, req.userId));

    const orderCount = Number(orderCountResult[0]?.cnt ?? 0);
    if (orderCount === 0) {
      res.status(400).json({ error: "Complete your first order before applying a referral code" });
      return;
    }
    if (orderCount > 1) {
      res.status(400).json({ error: "Referral codes can only be applied on your first order" });
      return;
    }

    // Durable idempotency check: one referral per referee (unique constraint on referrals.referred_user_id)
    const existingReferral = await db
      .select({ id: referralsTable.id })
      .from(referralsTable)
      .where(eq(referralsTable.referredUserId, req.userId))
      .limit(1);

    if (existingReferral.length > 0) {
      res.status(409).json({ error: "You have already used a referral code" });
      return;
    }

    const referrerRows = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.referralCode, code))
      .limit(1);

    if (referrerRows.length === 0) {
      res.status(404).json({ error: "Invalid referral code" });
      return;
    }

    const referrer = referrerRows[0];

    if (referrer.userId === req.userId) {
      res.status(400).json({ error: "You cannot use your own referral code" });
      return;
    }

    // Fetch the referee's first order for attribution record
    const [firstOrder] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.userId, req.userId))
      .orderBy(ordersTable.createdAt)
      .limit(1);

    await db.transaction(async (tx) => {
      // Write durable referral attribution record (unique constraint prevents duplicates)
      await tx.insert(referralsTable).values({
        referrerUserId: referrer.userId,
        referredUserId: req.userId,
        firstOrderId: firstOrder?.id ?? null,
      });

      // Credit 200 bonus points to referrer
      await tx.insert(rewardPointsLogTable).values({
        userId: referrer.userId,
        points: 200,
        type: "bonus",
        description: `Referral bonus: friend joined`,
      });

      // Atomic SQL increment — no read-then-write race
      const [updatedRef] = await tx
        .update(userProfilesTable)
        .set({
          totalPoints: sql`${userProfilesTable.totalPoints} + 200`,
          lifetimePoints: sql`${userProfilesTable.lifetimePoints} + 200`,
          updatedAt: new Date(),
        })
        .where(eq(userProfilesTable.userId, referrer.userId))
        .returning({ totalPoints: userProfilesTable.totalPoints });

      await tx
        .update(userProfilesTable)
        .set({ loyaltyTier: computeTier(updatedRef?.totalPoints ?? 0) })
        .where(eq(userProfilesTable.userId, referrer.userId));
    });

    res.json({ success: true, message: "Referral applied — 200 bonus points credited to referrer" });
  } catch (err: any) {
    // Unique constraint violation (race condition) — treat as already applied
    if (err?.code === "23505") {
      res.status(409).json({ error: "You have already used a referral code" });
      return;
    }
    req.log.error({ err }, "Failed to apply referral");
    res.status(500).json({ error: "Failed to apply referral" });
  }
});

export { getOrCreateProfile, computeTier };
export default router;
