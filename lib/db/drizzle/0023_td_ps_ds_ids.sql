-- 0023_td_ps_ds_ids.sql
-- Give orders a TD prefix and products category-based PS/DS prefixes

-- ── 1. Sequences ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_id_seq  START 100001;
CREATE SEQUENCE IF NOT EXISTS product_id_seq START 100001;

-- ── 2. Orders: uuid → text (no FK constraints reference orders.id) ───────────
ALTER TABLE orders ALTER COLUMN id TYPE text;

-- Related orderId columns (denormalised, no FK constraints — just type change)
ALTER TABLE coupon_redemptions ALTER COLUMN order_id    TYPE text;
ALTER TABLE reward_points_log  ALTER COLUMN order_id    TYPE text;
ALTER TABLE stock_history      ALTER COLUMN order_id    TYPE text;
ALTER TABLE referrals          ALTER COLUMN first_order_id TYPE text;
ALTER TABLE product_reviews    ALTER COLUMN order_id    TYPE text;
ALTER TABLE support_tickets    ALTER COLUMN order_id    TYPE text;

-- ── 3. Products: uuid → text (FK constraints must be dropped first) ──────────
-- Dynamically drop every FK that references products(id)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass::text AS tbl
    FROM   pg_constraint
    WHERE  confrelid = 'products'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END;
$$;

-- Change products.id to text
ALTER TABLE products ALTER COLUMN id TYPE text;

-- Change every product_id FK column to text
ALTER TABLE cart_items      ALTER COLUMN product_id TYPE text;
ALTER TABLE wishlists       ALTER COLUMN product_id TYPE text;
ALTER TABLE stock_history   ALTER COLUMN product_id TYPE text;
ALTER TABLE product_reviews ALTER COLUMN product_id TYPE text;
ALTER TABLE product_queries ALTER COLUMN product_id TYPE text;

-- Re-add FK constraints
ALTER TABLE cart_items      ADD CONSTRAINT cart_items_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE wishlists       ADD CONSTRAINT wishlists_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE stock_history   ADD CONSTRAINT stock_history_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE product_queries ADD CONSTRAINT product_queries_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
