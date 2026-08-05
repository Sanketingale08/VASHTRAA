CREATE INDEX IF NOT EXISTS "email_outbox_status_created_at_idx"
  ON "email_outbox" ("status", "created_at");
