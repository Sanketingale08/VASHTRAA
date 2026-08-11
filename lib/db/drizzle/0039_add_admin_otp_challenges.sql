-- 0039_add_admin_otp_challenges.sql
-- Stores short-lived email/SMS OTP challenges for the admin 2FA setup flow.

CREATE TABLE IF NOT EXISTS admin_otp_challenges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text        NOT NULL,
  code_hash   text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
