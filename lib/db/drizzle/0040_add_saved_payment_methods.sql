DO $$ BEGIN
 CREATE TYPE "public"."payment_method_type" AS ENUM('card', 'upi');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_payment_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "type" "payment_method_type" NOT NULL,
  "card_brand" text,
  "last4" text,
  "cardholder_name" text,
  "expiry_month" integer,
  "expiry_year" integer,
  "upi_id" text,
  "upi_handle" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
-- At most one default per user enforced at DB level
CREATE UNIQUE INDEX IF NOT EXISTS "spm_user_default_unique"
  ON "saved_payment_methods" ("user_id")
  WHERE "is_default" = true;

--> statement-breakpoint
-- Prevent duplicate cards (same user + last4 + brand + expiry)
CREATE UNIQUE INDEX IF NOT EXISTS "spm_card_dedup"
  ON "saved_payment_methods" ("user_id", "last4", "card_brand", "expiry_month", "expiry_year")
  WHERE "type" = 'card';

--> statement-breakpoint
-- Prevent duplicate UPI IDs per user
CREATE UNIQUE INDEX IF NOT EXISTS "spm_upi_dedup"
  ON "saved_payment_methods" ("user_id", "upi_id")
  WHERE "type" = 'upi';
