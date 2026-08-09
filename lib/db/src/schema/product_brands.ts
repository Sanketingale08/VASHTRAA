import { pgTable, text, boolean, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";

export const productBrandsTable = pgTable("product_brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  categoryIds: jsonb("category_ids").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProductBrand = typeof productBrandsTable.$inferSelect;
export type InsertProductBrand = typeof productBrandsTable.$inferInsert;
