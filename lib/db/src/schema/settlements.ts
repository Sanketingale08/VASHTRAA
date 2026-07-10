import { pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export const VENDOR_SETTLEMENT_TYPES = ["release", "payout"] as const;
export const VENDOR_SETTLEMENT_STATUSES = ["completed", "failed"] as const;

export const vendorSettlementsTable = pgTable("vendor_settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  vendorId: uuid("vendor_id").notNull().references(() => vendorsTable.id),
  amount: integer("amount").notNull().default(0),
  type: text("type").$type<typeof VENDOR_SETTLEMENT_TYPES[number]>().notNull(),
  status: text("status").$type<typeof VENDOR_SETTLEMENT_STATUSES[number]>().notNull().default("completed"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type VendorSettlement = typeof vendorSettlementsTable.$inferSelect;
