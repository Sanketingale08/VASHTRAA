-- 0041_add_vendor_address_fields.sql
-- Add extended shop address fields and pickup address columns to vendors table

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "shop_address_line2" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "shop_landmark" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "shop_country" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_location_name" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_address_line1" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_address_line2" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_landmark" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_city" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_state" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_pincode" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_country" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_same_as_shop" boolean NOT NULL DEFAULT false;
