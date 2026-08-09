import { pgTable, text, uuid, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export type SellerNotificationType =
  | "new_order"
  | "payment_success"
  | "payment_failed"
  | "product_updated"
  | "product_approved"
  | "product_rejected"
  | "product_pending_approval"
  | "return_requested_seller"
  | "refund_requested_seller"
  | "low_stock"
  | "out_of_stock"
  | "promotional"
  | "order_cancelled_seller"
  | "settlement_released"
  | "payout_successful"
  | "new_customer_query"
  | "kyc_verified"
  | "kyc_resubmission_requested"
  | "store_approved";

export type AdminNotificationType =
  | "new_seller_registration"
  | "kyc_submitted"
  | "product_pending_approval"
  | "high_value_order"
  | "customer_complaint"
  | "system_error_alert"
  | "payout_failed"
  | "payment_gateway_issue"
  | "seller_support_request"
  | "email_delivery_failed";

export type TicketNotificationType =
  | "ticket_created"
  | "ticket_assigned"
  | "ticket_replied"
  | "ticket_status_changed"
  | "ticket_resolved"
  | "ticket_escalated";

export const ADMIN_NOTIFICATION_USER_ID = "admin";

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  vendorId: uuid("vendor_id"),
  type: text("type")
    .$type<
      | "order_confirmed" | "new_order_placed" | "order_shipped" | "order_delivered" | "order_cancelled" | "coupon_expiry" | "wishlist_restock" | "return_requested" | "return_approved" | "return_rejected" | "refund_requested" | "refund_approved" | "refund_rejected"
      | "payment_successful" | "order_packed" | "out_for_delivery" | "price_drop" | "flash_sale"
      | "vendor_item_rejected"
      | SellerNotificationType
      | TicketNotificationType
      | AdminNotificationType
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
  emailOrderUpdates: boolean("email_order_updates").notNull().default(true),
  emailMarketingUpdates: boolean("email_marketing_updates").notNull().default(true),
  emailOfferUpdates: boolean("email_offer_updates").notNull().default(true),
  emailStockAlerts: boolean("email_stock_alerts").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
export type NotificationPreferences = typeof notificationPreferencesTable.$inferSelect;
