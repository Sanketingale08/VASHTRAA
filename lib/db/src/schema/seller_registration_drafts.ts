import { pgTable, uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const sellerRegistrationDraftsTable = pgTable("seller_registration_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().unique(),
  data: jsonb("data").notNull().default({}),
  step: integer("step").notNull().default(2),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SellerRegistrationDraft = typeof sellerRegistrationDraftsTable.$inferSelect;
export type NewSellerRegistrationDraft = typeof sellerRegistrationDraftsTable.$inferInsert;
