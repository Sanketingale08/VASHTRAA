-- 0035_add_vendor_id.sql
-- Add a permanent, unique, human-readable Vendor ID to the vendors table

-- Sequence for generating sequential vendor IDs (TDV000001, TDV000002, ...)
CREATE SEQUENCE IF NOT EXISTS vendor_id_seq START 1;

-- Nullable so existing vendors don't need an ID immediately;
-- unique constraint prevents duplicates; never regenerated once set.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vendor_id text;

CREATE UNIQUE INDEX IF NOT EXISTS vendors_vendor_id_unique
  ON vendors (vendor_id)
  WHERE vendor_id IS NOT NULL;
