import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const adminLoginSessionsTable = pgTable("admin_login_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionTokenHash: text("session_token_hash").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  device: text("device"),
  os: text("os"),
  browser: text("browser"),
  location: text("location"),
  twoFactorVerified: boolean("two_factor_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActive: timestamp("last_active", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
