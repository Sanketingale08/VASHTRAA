-- Migration: add status_history column to orders table
-- Adds a jsonb array to track the full history of status transitions.
-- Existing rows get an empty array; the application back-fills the first
-- entry lazily (confirmed timestamp derived from createdAt) on next read,
-- or via the /api/orders/:id/status endpoint.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "status_history" jsonb NOT NULL DEFAULT '[]'::jsonb;
