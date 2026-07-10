ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "kyc_resubmission_requested" boolean NOT NULL DEFAULT false;
