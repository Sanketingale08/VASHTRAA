import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";

export const savedAddressesTable = pgTable("saved_addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  landmark: text("landmark"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  pincode: text("pincode").notNull(),
  country: text("country").notNull().default("India"),
  addressType: text("address_type").$type<"home" | "work" | "other">().notNull().default("home"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SavedAddress = typeof savedAddressesTable.$inferSelect;

