import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

/**
 * Vendor-scoped idempotency records for POST /seller/products/bulk-import.
 *
 * Each uploaded file carries a client-generated Idempotency-Key. The first
 * request for a (vendorId, idempotencyKey) pair creates a row in the "processing"
 * state BEFORE any product inserts run. Once the batch completes, the exact
 * {results, summary} response JSON is persisted atomically with the product
 * inserts and the row flips to "completed". A retry that arrives after a lost
 * response finds the completed row and returns the stored response verbatim
 * instead of re-inserting products (which would surface duplicate-name errors).
 *
 * The unique (vendorId, idempotencyKey) index lets the DB reject a second
 * concurrent insert, so racing retry clicks cannot create two batches.
 */
export const BULK_IMPORT_BATCH_STATUSES = ["processing", "completed"] as const;

export const bulkImportBatchesTable = pgTable(
  "bulk_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id").notNull().references(() => vendorsTable.id),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").$type<typeof BULK_IMPORT_BATCH_STATUSES[number]>().notNull().default("processing"),
    /** Exact { results, summary } response JSON persisted on completion. */
    response: jsonb("response").$type<unknown>(),
    /** Processing claims may be reclaimed after this lease expires. */
    leaseExpiresAt: timestamp("lease_expires_at"),
    /** Fencing token proving which worker currently owns the processing lease. */
    leaseToken: text("lease_token"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    vendorKeyUnique: uniqueIndex("bulk_import_batches_vendor_key_uniq").on(
      table.vendorId,
      table.idempotencyKey,
    ),
  }),
);

export const insertBulkImportBatchSchema = createInsertSchema(bulkImportBatchesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBulkImportBatch = z.infer<typeof insertBulkImportBatchSchema>;
export type BulkImportBatch = typeof bulkImportBatchesTable.$inferSelect;
