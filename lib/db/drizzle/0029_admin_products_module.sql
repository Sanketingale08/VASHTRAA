-- Add product moderation and merchandising fields to products table.
-- All columns are nullable/defaulted so existing rows are unaffected.

ALTER TABLE products ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE products ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS approval_remark text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_order integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_until timestamp;

-- Managed categories catalogue (additive — does not change products.category text field).
CREATE TABLE IF NOT EXISTS product_categories (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  slug      text NOT NULL UNIQUE,
  parent_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  active    boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Managed brands catalogue (additive — does not change products.brand text field).
CREATE TABLE IF NOT EXISTS product_brands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  category_ids jsonb NOT NULL DEFAULT '[]',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamp NOT NULL DEFAULT now()
);
