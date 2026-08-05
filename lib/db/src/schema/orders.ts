import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";


export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  items: jsonb("items").notNull(),
  address: jsonb("address").notNull(),
  deliveryMethod: text("delivery_method").notNull(),
  paymentMethod: text("payment_method").notNull(),
  couponCode: text("coupon_code"),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull().default(0),
  shipping: integer("shipping").notNull(),
  tax: integer("tax").notNull(),
  total: integer("total").notNull(),
  status: text("status").notNull().default("confirmed"),
  statusHistory: jsonb("status_history").notNull().default([]),
  cancelReason: text("cancel_reason"),
  vendorRejectionReason: text("vendor_rejection_reason"),
  vendorAcceptances: jsonb("vendor_acceptances").notNull().default({}),
  returnReason: text("return_reason"),
  refundStatus: text("refund_status"),
  refundMethod: text("refund_method"),
  refundProcessedAt: timestamp("refund_processed_at"),
  refundReference: text("refund_reference"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Order = typeof ordersTable.$inferSelect;
