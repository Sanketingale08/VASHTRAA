import { pgTable, text, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { vendorsTable } from "./vendors";

export const productReviewsTable = pgTable("product_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  vendorId: uuid("vendor_id").references(() => vendorsTable.id),
  orderId: uuid("order_id"),
  userId: text("user_id").notNull(),
  customerName: text("customer_name").notNull().default("Customer"),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull().default(""),
  sellerReply: text("seller_reply"),
  sellerRepliedAt: timestamp("seller_replied_at"),
  reported: boolean("reported").notNull().default(false),
  reportReason: text("report_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const PRODUCT_QUERY_STATUSES = ["Open", "In Progress", "Resolved"] as const;

export const productQueriesTable = pgTable("product_queries", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  vendorId: uuid("vendor_id").references(() => vendorsTable.id),
  userId: text("user_id").notNull(),
  customerName: text("customer_name").notNull().default("Customer"),
  subject: text("subject").notNull().default(""),
  message: text("message").notNull(),
  sellerReply: text("seller_reply"),
  sellerRepliedAt: timestamp("seller_replied_at"),
  status: text("status").$type<typeof PRODUCT_QUERY_STATUSES[number]>().notNull().default("Open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProductReview = typeof productReviewsTable.$inferSelect;
export type ProductQuery = typeof productQueriesTable.$inferSelect;
