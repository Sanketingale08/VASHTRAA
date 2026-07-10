import { pgTable, text, uuid, boolean, timestamp } from "drizzle-orm/pg-core";

export const supportTicketsTable = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  subject: text("subject").notNull(),
  category: text("category")
    .$type<"Order Issue" | "Payment Issue" | "Return/Refund" | "Product Query" | "Other">()
    .notNull(),
  status: text("status")
    .$type<"Open" | "In Progress" | "Resolved" | "Closed" | "Waiting for Customer">()
    .notNull()
    .default("Open"),
  priority: text("priority")
    .$type<"Low" | "Medium" | "High" | "Urgent">()
    .notNull()
    .default("Medium"),
  vendorId: uuid("vendor_id"),
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
  isStaff: boolean("is_staff").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type TicketMessage = typeof ticketMessagesTable.$inferSelect;
