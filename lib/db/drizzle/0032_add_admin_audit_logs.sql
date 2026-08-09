CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor" text NOT NULL DEFAULT 'Super Admin',
  "action" text NOT NULL,
  "module" text NOT NULL,
  "details" jsonb,
  "ip_address" text,
  "status" text NOT NULL DEFAULT 'success',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
