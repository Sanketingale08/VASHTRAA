import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { userProfilesTable, rewardPointsLogTable, ordersTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";

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

router.get("/rewards/summary", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const profile = await getOrCreateProfile(req.userId);

    const referralCountResult = await db
      .select({ cnt: count() })
      .from(rewardPointsLogTable)
      .where(
        sql`${rewardPointsLogTable.userId} = ${req.userId} AND ${rewardPointsLogTable.type} = 'bonus' AND ${rewardPointsLogTable.description} like 'Referral bonus%'`
      );

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

router.get("/rewards/history", requireAuth, async (req: any, res: any): Promise<void> => {
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

router.post("/rewards/referral/apply", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const { referralCode } = req.body;
    if (!referralCode || typeof referralCode !== "string") {
      res.status(400).json({ error: "referralCode is required" });
      return;
    }

    const code = referralCode.trim().toUpperCase();

    // Validate: referee must have placed exactly their first order
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

    const alreadyApplied = await db
      .select({ id: rewardPointsLogTable.id })
      .from(rewardPointsLogTable)
      .where(
        sql`${rewardPointsLogTable.userId} = ${referrer.userId} AND ${rewardPointsLogTable.type} = 'bonus' AND ${rewardPointsLogTable.description} = ${"Referral bonus: " + req.userId}`
      )
      .limit(1);

    if (alreadyApplied.length > 0) {
      res.status(409).json({ error: "This referral has already been applied" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.insert(rewardPointsLogTable).values({
        userId: referrer.userId,
        points: 200,
        type: "bonus",
        description: `Referral bonus: ${req.userId}`,
      });

      const newTotal = referrer.totalPoints + 200;
      const newLifetime = referrer.lifetimePoints + 200;
      await tx
        .update(userProfilesTable)
        .set({
          totalPoints: newTotal,
          lifetimePoints: newLifetime,
          loyaltyTier: computeTier(newTotal),
          updatedAt: new Date(),
        })
        .where(eq(userProfilesTable.userId, referrer.userId));
    });

    res.json({ success: true, message: "Referral applied — 200 bonus points credited to referrer" });
  } catch (err) {
    req.log.error({ err }, "Failed to apply referral");
    res.status(500).json({ error: "Failed to apply referral" });
  }
});

export { getOrCreateProfile, computeTier };
export default router;
