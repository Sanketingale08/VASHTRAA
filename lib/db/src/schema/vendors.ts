import { pgTable, text, integer, real, uuid, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const VENDOR_STATUSES = ["pending", "approved", "suspended"] as const;

export const vendorsTable = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  rating: real("rating").notNull().default(4.5),
  sareesCount: integer("sarees_count").notNull().default(0),
  avatar: text("avatar").notNull().default("/images/artisan-1.png"),
  bio: text("bio"),
  ownerId: text("owner_id"),
  status: text("status").$type<typeof VENDOR_STATUSES[number]>().notNull().default("approved"),
  gstin: text("gstin"),
  contactEmail: text("contact_email"),
  tagline: text("tagline"),
  kycVerified: boolean("kyc_verified").notNull().default(false),
  kycResubmissionRequested: boolean("kyc_resubmission_requested").notNull().default(false),
  mobile: text("mobile"),
  panNumber: text("pan_number"),
  panCardUrl: text("pan_card_url"),
  gstCertUrl: text("gst_cert_url"),
  bankHolder: text("bank_holder"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  bankIfsc: text("bank_ifsc"),
  shopStreet: text("shop_street"),
  shopCity: text("shop_city"),
  shopState: text("shop_state"),
  shopPincode: text("shop_pincode"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
