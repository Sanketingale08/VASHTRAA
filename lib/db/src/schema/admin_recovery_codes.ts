import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const adminRecoveryCodesTable = pgTable("admin_recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeHash: text("code_hash").notNull().unique(),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
