CREATE TABLE "email_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "order_id" text NOT NULL,
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
