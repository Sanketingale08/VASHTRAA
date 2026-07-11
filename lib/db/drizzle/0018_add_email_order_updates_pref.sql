ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "email_order_updates" boolean DEFAULT true NOT NULL;
