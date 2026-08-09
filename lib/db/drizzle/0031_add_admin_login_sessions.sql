CREATE TABLE IF NOT EXISTS "admin_login_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_token_hash" text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "device" text,
  "os" text,
  "browser" text,
  "location" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_active" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz
);
