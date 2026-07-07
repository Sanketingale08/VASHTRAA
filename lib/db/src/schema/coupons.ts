import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const couponsTable = pgTable("coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").$type<"percent" | "flat">().notNull(),
  value: integer("value").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Coupon = typeof couponsTable.$inferSelect;
