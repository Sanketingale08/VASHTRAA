import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export type EmailOutboxStatus = "pending" | "sent" | "failed" | "dead" | "skipped";

export const emailOutboxTable = pgTable(
  "email_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    orderId: text("order_id"),
    vendorId: text("vendor_id"),
    type: text("type").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    status: text("status").$type<EmailOutboxStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at"),
    nextRetryAt: timestamp("next_retry_at").notNull().defaultNow(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("email_outbox_status_created_at_idx").on(table.status, table.createdAt),
  ]
);

export type EmailOutboxEntry = typeof emailOutboxTable.$inferSelect;
export type NewEmailOutboxEntry = typeof emailOutboxTable.$inferInsert;
