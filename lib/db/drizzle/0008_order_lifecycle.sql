ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancel_reason" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "return_reason" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refund_status" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refund_method" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at_trigger ON orders;
CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_orders_updated_at();
