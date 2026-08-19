-- Vendor-scoped idempotency records for the seller bulk-import endpoint.
-- The first request for a (vendor_id, idempotency_key) pair inserts a row in the
-- "processing" state before any product inserts run; the completed
-- {results, summary} response JSON is stored on completion so a retry after a
-- lost response can return the original batch result instead of duplicating work.
CREATE TABLE IF NOT EXISTS "bulk_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'processing',
  "response" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);

--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bulk_import_batches"
   ADD CONSTRAINT "bulk_import_batches_vendor_id_vendors_id_fk"
   FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
   ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
-- Enforce at the DB level that a vendor cannot create two batches for the same
-- idempotency key. A second concurrent retry loses the race and is treated as
-- "processing in progress" rather than creating a duplicate batch.
CREATE UNIQUE INDEX IF NOT EXISTS "bulk_import_batches_vendor_key_uniq"
  ON "bulk_import_batches" ("vendor_id", "idempotency_key");
