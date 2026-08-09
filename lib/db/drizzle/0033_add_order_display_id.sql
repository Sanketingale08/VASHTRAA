-- 0033_add_order_display_id.sql
-- Add display_id to orders so UUID-keyed legacy orders show a consistent TD reference in the UI

ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_id text;

-- For new TD-prefixed orders, display_id mirrors the primary key
UPDATE orders SET display_id = id WHERE id LIKE 'TD%';

-- For old UUID orders, assign TD1, TD2, TD3 … in chronological order.
-- The order_id_seq starts at 100001, so TD1–TD9999 will never collide.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM orders
  WHERE id NOT LIKE 'TD%'
)
UPDATE orders o
SET display_id = 'TD' || r.rn
FROM ranked r
WHERE o.id = r.id;
