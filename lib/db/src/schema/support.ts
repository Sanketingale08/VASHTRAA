import { pgTable, text, uuid, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const CUSTOMER_TICKET_CATEGORIES = [
  "Order Issue",
  "Delivery/Shipping Delay",
  "Product Quality Issue",
  "Wrong/Damaged Item",
  "Return/Refund",
  "Product Query",
  "Payment Issue",
  "Coupon/Discount Issue",
  "Account/Login Issue",
  "Website/App Technical Issue",
  "Seller Complaint",
  "Other",
] as const;

export const SELLER_TICKET_CATEGORIES = [
  "Payout Issue",
  "KYC/Verification Issue",
  "Listing/Inventory Tool Issue",
  "Platform Technical Issue",
  "Customer Dispute Escalation",
  "Other",
] as const;

export const TICKET_CATEGORIES = [
  ...CUSTOMER_TICKET_CATEGORIES,
  ...SELLER_TICKET_CATEGORIES.filter((c) => !(CUSTOMER_TICKET_CATEGORIES as readonly string[]).includes(c)),
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

// Categories a customer raises that should route straight to the relevant seller
export const SELLER_ROUTED_CATEGORIES: readonly string[] = [
  "Order Issue",
  "Delivery/Shipping Delay",
  "Product Quality Issue",
  "Wrong/Damaged Item",
  "Return/Refund",
  "Product Query",
];

/**
 * Determines which portal a new ticket should be routed to.
 * - Customer + seller-routed category (+ a vendorId) => "seller"
 * - Customer + everything else (platform/technical/payment/etc.) => "admin"
 * - Seller-raised tickets always => "admin"
 */
export function routeTicket(userType: "customer" | "seller", category: string, vendorId?: string | null): "seller" | "admin" {
  if (userType === "seller") return "admin";
  if (vendorId && SELLER_ROUTED_CATEGORIES.includes(category)) return "seller";
  return "admin";
}

export const supportTicketsTable = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  userType: text("user_type").$type<"customer" | "seller">().notNull().default("customer"),
  subject: text("subject").notNull(),
  category: text("category").$type<TicketCategory>().notNull(),
  status: text("status")
    .$type<"Open" | "In Progress" | "Resolved" | "Closed" | "Waiting for Customer">()
    .notNull()
    .default("Open"),
  priority: text("priority")
    .$type<"Low" | "Medium" | "High" | "Urgent">()
    .notNull()
    .default("Medium"),
  assignedTo: text("assigned_to").$type<"seller" | "admin">().notNull().default("admin"),
  assignedAdmin: text("assigned_admin"),
  vendorId: uuid("vendor_id"),
  orderId: text("order_id"),
  productId: text("product_id"),
  orderItemId: text("order_item_id"),
  isDispute: boolean("is_dispute").notNull().default(false),
  disputeStatus: text("dispute_status")
    .$type<"none" | "open" | "needs_admin" | "resolved">()
    .notNull()
    .default("none"),
  evidenceUrls: jsonb("evidence_urls").$type<string[]>().notNull().default([]),
  attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
  escalated: boolean("escalated").notNull().default(false),
  escalatedAt: timestamp("escalated_at"),
  escalatedReason: text("escalated_reason"),
  slaDueAt: timestamp("sla_due_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ticketMessagesTable = pgTable("ticket_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  body: text("body").notNull(),
  attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
  isStaff: boolean("is_staff").notNull().default(false),
  internal: boolean("internal").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type TicketMessage = typeof ticketMessagesTable.$inferSelect;
