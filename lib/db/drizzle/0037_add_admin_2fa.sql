-- 0037_add_admin_2fa.sql
-- Adds TOTP-based two-factor authentication support for the Super Admin.
-- 1. Adds two_factor_verified column to admin_login_sessions (default false).
-- 2. Creates the admin_recovery_codes table for single-use backup codes.

ALTER TABLE admin_login_sessions
  ADD COLUMN IF NOT EXISTS two_factor_verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash   text        NOT NULL UNIQUE,
  used        boolean     NOT NULL DEFAULT false,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
