ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "gstin" text,
  ADD COLUMN IF NOT EXISTS "contact_email" text,
  ADD COLUMN IF NOT EXISTS "tagline" text;
