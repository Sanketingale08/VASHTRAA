import { pgTable, text, boolean, uuid, timestamp } from "drizzle-orm/pg-core";

export const productCategoriesTable = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: uuid("parent_id"),
  type: text("type").notNull().default("custom"),
  createdBy: text("created_by").notNull().default("system"),
  sellerId: text("seller_id"),
  sellerName: text("seller_name"),
  coverImage: text("cover_image"),
  status: text("status").notNull().default("approved"), // 'pending' | 'approved' | 'rejected'
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProductCategory = typeof productCategoriesTable.$inferSelect;
export type InsertProductCategory = typeof productCategoriesTable.$inferInsert;

