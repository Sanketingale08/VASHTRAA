-- Fence processing workers so an expired worker cannot complete or clean up a
-- batch after another request has reclaimed its lease.
ALTER TABLE "bulk_import_batches"
  ADD COLUMN IF NOT EXISTS "lease_token" text;

--> statement-breakpoint
-- Give processing rows created before fencing a grace period instead of
-- treating their NULL lease as immediately reclaimable during deployment.
UPDATE "bulk_import_batches"
SET
  "lease_token" = COALESCE("lease_token", gen_random_uuid()::text),
  "lease_expires_at" = COALESCE("lease_expires_at", now() + interval '30 minutes')
WHERE "status" = 'processing';