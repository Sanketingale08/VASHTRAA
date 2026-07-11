import { pgTable, text, timestamp, integer, boolean, uuid } from "drizzle-orm/pg-core";

export const heroBannersTable = pgTable("hero_banners", {
  id: uuid("id").primaryKey().defaultRandom(),
  imageUrl: text("image_url").notNull(),
  title: text("title"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  slideIntervalMs: integer("slide_interval_ms").notNull().default(6000),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
