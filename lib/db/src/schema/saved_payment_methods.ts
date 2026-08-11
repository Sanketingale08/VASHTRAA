import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "card",
  "upi",
]);

export const savedPaymentMethodsTable = pgTable("saved_payment_methods", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  type: paymentMethodTypeEnum("type").notNull(),

  // Card fields (null for UPI)
  cardBrand: text("card_brand"),
  last4: text("last4"),
  cardholderName: text("cardholder_name"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),

  // UPI fields (null for card)
  upiId: text("upi_id"),
  upiHandle: text("upi_handle"), // the part after @

  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SavedPaymentMethod =
  typeof savedPaymentMethodsTable.$inferSelect;
