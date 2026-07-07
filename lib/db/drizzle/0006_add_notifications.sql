CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "read" boolean NOT NULL DEFAULT false,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
  "user_id" text PRIMARY KEY NOT NULL,
  "order_updates" boolean NOT NULL DEFAULT true,
  "offer_alerts" boolean NOT NULL DEFAULT true,
  "stock_alerts" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" ("user_id");
--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" ("user_id", "read");
