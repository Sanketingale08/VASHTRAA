CREATE TABLE "coupons" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"code" text NOT NULL,
"type" text NOT NULL,
"value" integer NOT NULL,
"description" text DEFAULT '' NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"expires_at" timestamp,
"created_at" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
