-- Add idempotency key column to orders table so the refund/process endpoint
-- can detect and safely ignore duplicate POST requests (e.g. from network retries).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_idempotency_key text;

-- Unique constraint so the DB itself enforces no two rows can share the same key.
CREATE UNIQUE INDEX IF NOT EXISTS orders_refund_idempotency_key_uniq
  ON orders (refund_idempotency_key)
  WHERE refund_idempotency_key IS NOT NULL;
