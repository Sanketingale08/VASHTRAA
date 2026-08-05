import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const couponsTable = pgTable("coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").$type<"percent" | "flat">().notNull(),
  value: integer("value").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const couponRedemptionsTable = pgTable("coupon_redemptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  couponId: uuid("coupon_id").notNull().references(() => couponsTable.id),
  userId: text("user_id").notNull(),
  orderId: text("order_id").notNull(),
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
});

export type Coupon = typeof couponsTable.$inferSelect;
export type CouponRedemption = typeof couponRedemptionsTable.$inferSelect;
