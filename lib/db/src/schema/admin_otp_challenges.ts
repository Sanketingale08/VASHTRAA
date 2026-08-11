import { pgTable, text, timestamp, uuid, integer, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Stores short-lived OTP challenges used during the admin 2FA setup flow.
 * At most ONE row per challenge type ("email" or "sms") — enforced by unique index.
 * Rows are deleted on success or exceeded-attempts and expire after 5 minutes.
 */
export const adminOtpChallengesTable = pgTable("admin_otp_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** "email" or "sms" — at most one active challenge per type */
  type: text("type").notNull(),
  /** SHA-256 of the plain OTP — never store the plain code */
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  typeUnique: uniqueIndex("admin_otp_challenges_type_unique").on(table.type),
}));
