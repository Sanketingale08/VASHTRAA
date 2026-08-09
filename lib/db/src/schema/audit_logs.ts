import { pgTable, text, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";

export const adminAuditLogsTable = pgTable("admin_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull().default("Super Admin"),
  action: text("action").notNull(),
  module: text("module").notNull(),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("success"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
