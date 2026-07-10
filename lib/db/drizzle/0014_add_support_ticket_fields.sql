ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "user_type" text DEFAULT 'customer' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'Medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "assigned_to" text DEFAULT 'admin' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "assigned_admin" text;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "vendor_id" uuid;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "order_id" uuid;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "is_dispute" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "dispute_status" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "evidence_urls" jsonb DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "escalated" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "escalated_at" timestamp;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "escalated_reason" text;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "sla_due_at" timestamp;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN IF NOT EXISTS "internal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN IF NOT EXISTS "read_at" timestamp;
