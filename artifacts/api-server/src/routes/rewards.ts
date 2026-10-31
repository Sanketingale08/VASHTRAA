import { Router } from "express";
import { isCustomer } from "../middlewares/isCustomer";
import { db, mongoRewards, userProfilesTable, rewardPointsLogTable, referralsTable, ordersTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import { emitUserEvent } from "../lib/socket";

const router = Router();

function computeTier(totalPoints: number): "silver" | "gold" | "platinum" {
  return mongoRewards.computeTier(totalPoints);
}

async function getOrCreateProfile(userId: string) {
  try {
    return await mongoRewards.getOrCreateProfile(userId);
  } catch {
    const existing = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1)
      .catch(() => []);

    if (existing && existing.length > 0) return existing[0];

    const [profile] = await db
      .insert(userProfilesTable)
      .values({ userId, referralCode: "VAST" + Math.random().toString(36).slice(2, 6).toUpperCase() })
      .onConflictDoNothing()
      .returning()
      .catch(() => []);

    return (
      profile || {
        userId,
        totalPoints: 100,
        lifetimePoints: 100,
        loyaltyTier: "silver",
        referralCode: "VAST" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      }
    );
  }
}

router.get("/rewards/summary", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    try {
      const summary = await mongoRewards.getSummary(req.userId);
      res.json(summary);
      return;
    } catch {}

    const profile = await getOrCreateProfile(req.userId);
    const referralCountResult = await db
      .select({ cnt: count() })
      .from(referralsTable)
      .where(eq(referralsTable.referrerUserId, profile.userId))
      .catch(() => [{ cnt: 0 }]);

    const referralCount = Number(referralCountResult[0]?.cnt ?? 0);

    res.json({
      balance: profile.totalPoints ?? 100,
      tier: profile.loyaltyTier ?? "silver",
      lifetimeEarned: profile.lifetimePoints ?? 100,
      referralCode: profile.referralCode || "VASTREE1",
      referralCount,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch rewards summary");
    res.status(500).json({ error: "Failed to fetch rewards summary" });
  }
});

router.get("/rewards/history", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = 20;

    try {
      const result = await mongoRewards.getHistory(req.userId, page, limit);
      res.json(result);
      return;
    } catch {}

    const offset = (page - 1) * limit;
    const rows = await db
      .select()
      .from(rewardPointsLogTable)
      .where(eq(rewardPointsLogTable.userId, req.userId))
      .orderBy(desc(rewardPointsLogTable.createdAt))
      .limit(limit)
      .offset(offset)
      .catch(() => []);

    const totalResult = await db
      .select({ cnt: count() })
      .from(rewardPointsLogTable)
      .where(eq(rewardPointsLogTable.userId, req.userId))
      .catch(() => [{ cnt: 0 }]);

    const total = Number(totalResult[0]?.cnt ?? 0);

    res.json({ history: rows, page, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch rewards history");
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

    try {
      await mongoRewards.applyReferral(req.userId, referralCode);
      const summary = await mongoRewards.getSummary(req.userId);
      emitUserEvent(req.userId, "reward:updated", summary);
      res.json({ success: true, message: "Referral applied — bonus points credited" });
      return;
    } catch (err: any) {
      if (err?.code === "ALREADY_USED") {
        res.status(409).json({ error: "You have already used a referral code" });
        return;
      }
      if (err?.code === "INVALID_CODE") {
        res.status(404).json({ error: "Invalid referral code" });
        return;
      }
      if (err?.code === "SELF_REFERRAL") {
        res.status(400).json({ error: "You cannot use your own referral code" });
        return;
      }
      throw err;
    }
  } catch (err: any) {
    req.log?.error({ err }, "Failed to apply referral");
    res.status(500).json({ error: "Failed to apply referral" });
  }
});

export { getOrCreateProfile, computeTier };
export default router;
