CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"items" jsonb NOT NULL,
	"address" jsonb NOT NULL,
	"delivery_method" text NOT NULL,
	"payment_method" text NOT NULL,
	"coupon_code" text,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"shipping" integer NOT NULL,
	"tax" integer NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
