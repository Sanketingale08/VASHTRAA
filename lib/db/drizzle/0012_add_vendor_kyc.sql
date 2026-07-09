ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "kyc_verified" boolean NOT NULL DEFAULT false;
