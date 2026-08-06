-- Prevent double-crediting vendors: enforce at most one settlement row
-- per (order_id, vendor_id, type) combination when order_id is present.
--
-- Before adding the constraint we must eliminate any historical duplicate rows
-- that would cause PostgreSQL to reject the CREATE UNIQUE INDEX. The cleanup
-- covers every row matched by the index predicate (order_id IS NOT NULL),
-- regardless of type — this includes 'order_settlement', 'release', and
-- 'payout' rows alike. Policy: keep the oldest row in each duplicate group
-- (smallest created_at, then smallest id as a tiebreaker) and delete the rest.

WITH duplicate_groups AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id, vendor_id, type
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM vendor_settlements
  WHERE order_id IS NOT NULL   -- matches the index predicate exactly
)
DELETE FROM vendor_settlements
WHERE id IN (
  SELECT id FROM duplicate_groups WHERE rn > 1
);

-- Partial unique index: only covers rows that carry an order_id so that
-- free-standing payout/release rows (order_id IS NULL) remain unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_settlements_order_vendor_type_uniq
  ON vendor_settlements (order_id, vendor_id, type)
  WHERE order_id IS NOT NULL;
