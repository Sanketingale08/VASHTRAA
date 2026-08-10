-- 0036_add_reactivation_welcome_pending.sql
-- Tracks whether a reactivated seller still needs to see the one-time "Welcome Back!" popup.
-- Set to TRUE by the admin activate endpoint; cleared to FALSE by the seller after seeing it.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS reactivation_welcome_pending boolean NOT NULL DEFAULT false;
