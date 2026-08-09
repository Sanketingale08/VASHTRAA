ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "email_offer_updates" boolean DEFAULT true NOT NULL;
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "email_stock_alerts" boolean DEFAULT true NOT NULL;
