-- 0024_email_outbox_order_id_nullable.sql
-- Allow vendor lifecycle emails in the outbox (they have no associated order)

ALTER TABLE "email_outbox" ALTER COLUMN "order_id" DROP NOT NULL;
