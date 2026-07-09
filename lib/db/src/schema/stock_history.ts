import { pgTable, text, integer, uuid, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const STOCK_HISTORY_SOURCES = ["order", "cancel", "return", "manual", "bulk"] as const;

export const stockHistoryTable = pgTable("stock_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => productsTable.id),
  vendorId: uuid("vendor_id"),
  delta: integer("delta").notNull(),
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  source: text("source").$type<typeof STOCK_HISTORY_SOURCES[number]>().notNull(),
  reason: text("reason").notNull().default(""),
  actorId: text("actor_id"),
  orderId: uuid("order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type StockHistoryEntry = typeof stockHistoryTable.$inferSelect;
