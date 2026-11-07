import { pgTable, text, integer, real, boolean, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const CATEGORIES = [
  "paithani", "designer", "gadwal", "banarasi", "kanjivaram",
  "chanderi", "bandhani", "mysore-silk", "ikat", "cotton", "silk", "other-traditional",
  "Paithani Sarees", "Designer Sarees", "Gadwal Sarees", "Banarasi Sarees", "Kanjivaram Sarees",
  "Chanderi Sarees", "Bandhani Sarees", "Mysore Silk Sarees", "Ikat Sarees", "Cotton Sarees", "Silk Sarees", "Other Traditional Sarees",
  "indian-wear", "fashion-wear", "western-wear",
  "bridal", "party",
  "Indian Wear", "Fashion Wear", "Western Wear",
  "paithani-sarees", "paithani sarees", "paithani saree", "Paithani Saree",
  "designer-sarees", "designer sarees", "designer saree", "Designer Saree",
  "saree", "sarees", "Saree", "Sarees",
  "lehenga", "lehengas", "Lehenga", "Lehengas",
  "salwar", "salwars", "Salwar", "Salwars", "salwar suit", "Salwar Suit", "salwar-suits", "salwar suits", "Salwar Suits",
  "kurti", "kurtis", "Kurti", "Kurtis", "kurta", "kurtas", "Kurta", "Kurtas",
  "kurta-sets", "kurta sets", "Kurta Sets", "kurta-set", "kurta set", "Kurta Set",
  "ethnic-dresses", "ethnic dresses", "Ethnic Dresses", "ethnic-dress", "ethnic dress", "Ethnic Dress",
  "western-dresses", "western dresses", "Western Dresses", "western-dress", "western dress", "Western Dress",
  "winter-wear", "winter wear", "Winter Wear", "winterwear", "Winterwear",
  "fabric", "fabrics", "Fabric", "Fabrics",
  "dresses", "tops", "Dresses", "Tops", "dress", "Dress", "top", "Top", "anarkali", "Anarkali", "gown", "gowns", "Gown", "Gowns"
] as const;
export const FABRICS = ["silk", "cotton", "georgette", "net", "chiffon", "tissue", "pure silk", "art silk", "cotton blend", "crepe", "organza", "rayon", "satin", "linen", "velvet"] as const;
export const OCCASIONS = ["bridal", "festival", "casual", "party", "formal", "wedding", "festive", "traditional", "party wear", "daily wear"] as const;
export const COLORS = ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint", "white", "beige", "grey", "gray", "peach", "navy", "silver", "brown", "teal", "wine", "rust", "mustard"] as const;

/** Category → product ID prefix */
export const CATEGORY_PREFIX: Record<string, string> = {
  paithani: "PS",
  "paithani-sarees": "PS",
  "paithani sarees": "PS",
  "Paithani Sarees": "PS",
  "paithani saree": "PS",
  "Paithani Saree": "PS",
  designer: "DS",
  "designer-sarees": "DS",
  "designer sarees": "DS",
  "Designer Sarees": "DS",
  "designer saree": "DS",
  "Designer Saree": "DS",
  gadwal: "GS",
  "gadwal-sarees": "GS",
  "Gadwal Sarees": "GS",
  banarasi: "BN",
  "banarasi-sarees": "BN",
  "Banarasi Sarees": "BN",
  kanjivaram: "KS",
  "kanjivaram-sarees": "KS",
  "Kanjivaram Sarees": "KS",
  chanderi: "CH",
  "chanderi-sarees": "CH",
  "Chanderi Sarees": "CH",
  bandhani: "BD",
  "bandhani-sarees": "BD",
  "Bandhani Sarees": "BD",
  "mysore-silk": "MS",
  "mysore-silk-sarees": "MS",
  "Mysore Silk Sarees": "MS",
  ikat: "IK",
  "ikat-sarees": "IK",
  "Ikat Sarees": "IK",
  cotton: "CT",
  "cotton-sarees": "CT",
  "Cotton Sarees": "CT",
  silk: "SK",
  "silk-sarees": "SK",
  "Silk Sarees": "SK",
  "other-traditional": "OT",
  "other-traditional-sarees": "OT",
  "Other Traditional Sarees": "OT",
  bridal: "BS",
  party: "PW",
  saree: "SR",
  sarees: "SR",
  Saree: "SR",
  Sarees: "SR",
  lehenga: "LH",
  lehengas: "LH",
  Lehenga: "LH",
  Lehengas: "LH",
  salwar: "SL",
  salwars: "SL",
  Salwar: "SL",
  Salwars: "SL",
  "salwar suit": "SL",
  "Salwar Suit": "SL",
  "salwar suits": "SL",
  "Salwar Suits": "SL",
  kurti: "KU",
  kurtis: "KU",
  Kurti: "KU",
  Kurtis: "KU",
  kurta: "KU",
  kurtas: "KU",
  Kurta: "KU",
  Kurtas: "KU",
  anarkali: "KU",
  Anarkali: "KU",
  "kurta-sets": "KS",
  "Kurta Sets": "KS",
  "kurta sets": "KS",
  "kurta-set": "KS",
  "Kurta Set": "KS",
  "ethnic-dresses": "ED",
  "Ethnic Dresses": "ED",
  "ethnic dresses": "ED",
  "ethnic-dress": "ED",
  "Ethnic Dress": "ED",
  "western-dresses": "WD",
  "Western Dresses": "WD",
  "western dresses": "WD",
  "western-dress": "WD",
  "Western Dress": "WD",
  "winter-wear": "WW",
  "Winter Wear": "WW",
  "winter wear": "WW",
  winterwear: "WW",
  Winterwear: "WW",
  fabric: "FB",
  fabrics: "FB",
  Fabric: "FB",
  Fabrics: "FB",
  dresses: "DR",
  Dresses: "DR",
  dress: "DR",
  Dress: "DR",
  gown: "DR",
  gowns: "DR",
  Gown: "DR",
  Gowns: "DR",
  tops: "TP",
  Tops: "TP",
  top: "TP",
  Top: "TP",
};

export type ProductVariant = {
  /** New flexible attribute model — array of {name, value} pairs */
  attributes?: Array<{ name: string; value: string }>;
  /** Optional per-variant image URL */
  image?: string;
  stock?: number;
  price?: number;
  sku?: string;
  /** Legacy fields — preserved for backward compatibility */
  size?: string;
  color?: string;
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
  basePrice: integer("base_price"),
  shippingFee: integer("shipping_fee").notNull().default(100),
  gstRateBps: integer("gst_rate_bps").notNull().default(500),
  category: text("category").$type<typeof CATEGORIES[number]>().notNull(),
  subcategory: text("subcategory"),
  childCategory: text("child_category"),
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
  collection: text("collection"),
  gender: text("gender").notNull().default("Women"),
  sareeType: text("saree_type"),
  sareeStyle: text("saree_style"),
  packOf: text("pack_of").notNull().default("Pack of 1"),
  countryOfOrigin: text("country_of_origin").notNull().default("India"),
  blouseIncluded: boolean("blouse_included").notNull().default(true),
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
