CREATE TABLE "user_profiles" (
"user_id" text PRIMARY KEY NOT NULL,
"referral_code" text NOT NULL UNIQUE,
"total_points" integer DEFAULT 0 NOT NULL,
"lifetime_points" integer DEFAULT 0 NOT NULL,
"loyalty_tier" text DEFAULT 'silver' NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "reward_points_log" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"user_id" text NOT NULL,
"points" integer NOT NULL,
"type" text NOT NULL,
"description" text NOT NULL,
"order_id" uuid,
"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "referrals" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"referrer_user_id" text NOT NULL REFERENCES "user_profiles"("user_id"),
"referred_user_id" text NOT NULL UNIQUE,
"first_order_id" uuid,
"created_at" timestamp DEFAULT now() NOT NULL
);
