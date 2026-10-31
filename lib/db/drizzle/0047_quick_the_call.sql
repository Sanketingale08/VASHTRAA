ALTER TABLE "orders" ADD COLUMN "pricing_version" text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "financials" jsonb;--> statement-breakpoint
ALTER TABLE "vendor_settlements" ADD COLUMN "pricing_version" text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_settlements" ADD COLUMN "platform_keeps" integer;