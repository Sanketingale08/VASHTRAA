-- A processing lease prevents a server restart from leaving an idempotency key
-- permanently stuck. NULL is treated as already expired for compatibility with
-- any processing rows created before this column existed.
ALTER TABLE "bulk_import_batches"
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp;