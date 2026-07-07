ALTER TABLE "coupons" ADD COLUMN "max_uses" integer;
ALTER TABLE "coupons" ADD COLUMN "used_count" integer DEFAULT 0 NOT NULL;

CREATE TABLE "coupon_redemptions" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"coupon_id" uuid NOT NULL REFERENCES "coupons"("id"),
"user_id" text NOT NULL,
"order_id" uuid NOT NULL,
"redeemed_at" timestamp DEFAULT now() NOT NULL
);
