import { pgTable, text, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const userProfilesTable = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  referralCode: text("referral_code").notNull().unique(),
  totalPoints: integer("total_points").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  loyaltyTier: text("loyalty_tier").$type<"silver" | "gold" | "platinum">().notNull().default("silver"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rewardPointsLogTable = pgTable("reward_points_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  points: integer("points").notNull(),
  type: text("type").$type<"earned" | "bonus" | "redeemed">().notNull(),
  description: text("description").notNull(),
  orderId: text("order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const referralsTable = pgTable("referrals", {
  id: uuid("id").defaultRandom().primaryKey(),
  referrerUserId: text("referrer_user_id").notNull().references(() => userProfilesTable.userId),
  referredUserId: text("referred_user_id").notNull().unique(),
  firstOrderId: text("first_order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type UserProfile = typeof userProfilesTable.$inferSelect;
export type RewardPointsLog = typeof rewardPointsLogTable.$inferSelect;
export type Referral = typeof referralsTable.$inferSelect;
