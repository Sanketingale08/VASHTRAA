import { pgTable, text, integer, real, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorsTable = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  rating: real("rating").notNull().default(4.5),
  sareesCount: integer("sarees_count").notNull().default(0),
  avatar: text("avatar").notNull().default("/images/artisan-1.png"),
  bio: text("bio"),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
