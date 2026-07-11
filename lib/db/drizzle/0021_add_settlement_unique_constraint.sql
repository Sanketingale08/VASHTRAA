CREATE UNIQUE INDEX IF NOT EXISTS "vendor_settlements_order_vendor_type_uidx"
  ON "vendor_settlements" ("order_id", "vendor_id", "type")
  WHERE "order_id" IS NOT NULL;
