import { pgTable, text, integer, real, boolean, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const CATEGORIES = ["paithani", "designer"] as const;
export const FABRICS = ["silk", "cotton", "georgette", "net", "chiffon", "tissue"] as const;
export const OCCASIONS = ["bridal", "festival", "casual", "party", "formal"] as const;
export const COLORS = ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint"] as const;

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
  id: uuid("id").primaryKey().defaultRandom(),
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
  rating: real("rating").notNull().default(4.5),
  reviewCount: integer("review_count").notNull().default(0),
  stock: integer("stock").notNull().default(10),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  active: boolean("active").notNull().default(true),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
