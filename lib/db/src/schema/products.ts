import { pgTable, text, integer, real, boolean, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const CATEGORIES = ["paithani", "designer", "bridal", "party"] as const;
export const FABRICS = ["silk", "cotton", "georgette", "net", "chiffon", "tissue"] as const;
export const OCCASIONS = ["bridal", "festival", "casual", "party", "formal"] as const;
export const COLORS = ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint"] as const;

/** Category → product ID prefix */
export const CATEGORY_PREFIX: Record<typeof CATEGORIES[number], string> = {
  paithani: "PS",
  designer: "DS",
  bridal: "BS",
  party: "PW",
};

export type ProductVariant = {
  size?: string;
  color?: string;
  stock?: number;
  price?: number;
  sku?: string;
};

export type ProductSpecification = {
  key: string;
  value: string;
};

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull(),
  originalPrice: integer("original_price"),
  category: text("category").$type<typeof CATEGORIES[number]>().notNull(),
  subcategory: text("subcategory"),
  brand: text("brand"),
  designPattern: text("design_pattern"),
  fabric: text("fabric").$type<typeof FABRICS[number]>().notNull().default("silk"),
  color: text("color").$type<typeof COLORS[number]>().notNull().default("red"),
  occasion: text("occasion").$type<typeof OCCASIONS[number]>().notNull().default("festival"),
  vendorId: uuid("vendor_id").references(() => vendorsTable.id),
  vendorName: text("vendor_name").notNull().default(""),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  videos: jsonb("videos").$type<string[]>().notNull().default([]),
  variants: jsonb("variants").$type<ProductVariant[]>().notNull().default([]),
  specifications: jsonb("specifications").$type<ProductSpecification[]>().notNull().default([]),
  deliveryInfo: text("delivery_info").notNull().default(""),
  returnPolicy: text("return_policy").notNull().default(""),
  isBestSeller: boolean("is_best_seller").notNull().default(false),
  isNewArrival: boolean("is_new_arrival").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  rating: real("rating").notNull().default(4.5),
  reviewCount: integer("review_count").notNull().default(0),
  stock: integer("stock").notNull().default(10),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  active: boolean("active").notNull().default(true),
  viewCount: integer("view_count").notNull().default(0),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("approved"),
  rejectionReason: text("rejection_reason"),
  approvalRemark: text("approval_remark"),
  featuredOrder: integer("featured_order"),
  featuredUntil: timestamp("featured_until"),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

export const searchQueriesTable = pgTable("search_queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  term: text("term").notNull(),
  resultCount: integer("result_count").notNull().default(0),
  userId: text("user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SearchQuery = typeof searchQueriesTable.$inferSelect;
