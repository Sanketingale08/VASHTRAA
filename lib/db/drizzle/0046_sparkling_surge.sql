CREATE TYPE "public"."payment_method_type" AS ENUM('card', 'upi');--> statement-breakpoint
CREATE TABLE "admin_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_recovery_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_login_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device" text,
	"os" text,
	"browser" text,
	"location" text,
	"two_factor_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text DEFAULT 'Super Admin' NOT NULL,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"details" jsonb,
	"ip_address" text,
	"status" text DEFAULT 'success' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"response" jsonb,
	"lease_expires_at" timestamp,
	"lease_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"order_id" text,
	"vendor_id" text,
	"type" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"next_retry_at" timestamp DEFAULT now() NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hero_banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_url" text NOT NULL,
	"title" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"slide_interval_ms" integer DEFAULT 6000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"vendor_id" uuid,
	"delta" integer NOT NULL,
	"previous_stock" integer NOT NULL,
	"new_stock" integer NOT NULL,
	"source" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_id" text,
	"order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"vendor_id" uuid,
	"user_id" text NOT NULL,
	"customer_name" text DEFAULT 'Customer' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"message" text NOT NULL,
	"seller_reply" text,
	"seller_replied_at" timestamp,
	"status" text DEFAULT 'Open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"vendor_id" uuid,
	"order_id" text,
	"user_id" text NOT NULL,
	"customer_name" text DEFAULT 'Customer' NOT NULL,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"seller_reply" text,
	"seller_replied_at" timestamp,
	"reported" boolean DEFAULT false NOT NULL,
	"report_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"category" text,
	"vendor_id" uuid,
	"rate" real NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp,
	"effective_to" timestamp,
	"supersedes_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type" text NOT NULL,
	"frequency" text NOT NULL,
	"recipient_email" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"transaction_id" text,
	"note" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"order_id" text,
	"product_amount" integer,
	"commission" integer,
	"commission_rate" real,
	"shipping_charge" integer,
	"settlement_tax" integer,
	"net_payout" integer,
	"paid_at" timestamp,
	"utr_number" text,
	"payout_reference" text,
	"seller_base_price" integer,
	"platform_commission" integer,
	"shipping_fee" integer,
	"taxable_amount" integer,
	"gst_rate_bps" integer,
	"gst_amount" integer,
	"cgst" integer,
	"sgst" integer,
	"igst" integer,
	"customer_pays" integer,
	"gst_on_commission" integer,
	"tcs_deduction" integer,
	"seller_settlement" integer,
	"commission_bps" integer,
	"commission_gst_bps" integer,
	"tcs_bps" integer
);
--> statement-breakpoint
CREATE TABLE "seller_registration_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"step" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"nudge_sent_at" timestamp,
	CONSTRAINT "seller_registration_drafts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid,
	"type" text DEFAULT 'custom' NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"seller_id" text,
	"seller_name" text,
	"cover_image" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "saved_payment_methods" (
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
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "wishlists" ALTER COLUMN "product_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cart_items" ALTER COLUMN "product_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ALTER COLUMN "order_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "referrals" ALTER COLUMN "first_order_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reward_points_log" ALTER COLUMN "order_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "kyc_resubmission_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pan_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "gst_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "mobile" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pan_number" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pan_card_url" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "gst_cert_url" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_holder" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_account" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "shop_street" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "shop_city" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "shop_state" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "shop_pincode" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "shop_address_line2" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "shop_landmark" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "shop_country" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_location_name" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_address_line1" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_address_line2" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_landmark" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_city" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_state" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_pincode" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_country" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_same_as_shop" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_location_name" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_address_line1" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_address_line2" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_landmark" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_city" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_state" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_pincode" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_country" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "rto_same_as_pickup" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "terms_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "vendor_id" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "reactivation_welcome_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "subcategory" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "design_pattern" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "videos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "specifications" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "delivery_info" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "return_policy" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "low_stock_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "approval_remark" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "featured_order" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "featured_until" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vendor_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vendor_acceptances" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_reference" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "display_id" text;--> statement-breakpoint
ALTER TABLE "saved_addresses" ADD COLUMN "landmark" text;--> statement-breakpoint
ALTER TABLE "saved_addresses" ADD COLUMN "country" text DEFAULT 'India' NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_addresses" ADD COLUMN "address_type" text DEFAULT 'home' NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_addresses" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_order_updates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_marketing_updates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_offer_updates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_stock_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "user_type" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "priority" text DEFAULT 'Medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "assigned_to" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "assigned_admin" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "order_id" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "order_item_id" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "is_dispute" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "dispute_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "escalated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "escalated_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "escalated_reason" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "sla_due_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "bulk_import_batches" ADD CONSTRAINT "bulk_import_batches_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_queries" ADD CONSTRAINT "product_queries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_queries" ADD CONSTRAINT "product_queries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_otp_challenges_type_unique" ON "admin_otp_challenges" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "bulk_import_batches_vendor_key_uniq" ON "bulk_import_batches" USING btree ("vendor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_at_idx" ON "email_outbox" USING btree ("status","created_at");