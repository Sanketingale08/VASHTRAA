CREATE TABLE IF NOT EXISTS "seller_registration_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "data" jsonb DEFAULT '{}' NOT NULL,
  "step" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seller_registration_drafts_user_id_unique" UNIQUE("user_id")
);
