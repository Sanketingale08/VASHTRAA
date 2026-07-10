import { pgTable, text, uuid, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export type SellerNotificationType =
  | "new_order"
  | "payment_success"
  | "payment_failed"
  | "product_updated"
  | "product_approved"
  | "product_rejected"
  | "return_requested_seller"
  | "refund_requested_seller"
  | "low_stock"
  | "out_of_stock"
  | "promotional";

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  vendorId: uuid("vendor_id"),
  type: text("type")
    .$type<
      | "order_confirmed" | "order_shipped" | "order_delivered" | "order_cancelled" | "coupon_expiry" | "wishlist_restock" | "return_requested" | "return_approved" | "return_rejected" | "refund_requested" | "refund_approved" | "refund_rejected"
      | SellerNotificationType
    >()
    .notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationPreferencesTable = pgTable("notification_preferences", {
  userId: text("user_id").primaryKey(),
  orderUpdates: boolean("order_updates").notNull().default(true),
  offerAlerts: boolean("offer_alerts").notNull().default(true),
  stockAlerts: boolean("stock_alerts").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
export type NotificationPreferences = typeof notificationPreferencesTable.$inferSelect;
