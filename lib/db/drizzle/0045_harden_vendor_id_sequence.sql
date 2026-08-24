-- Keep vendor_id_seq ahead of every existing TDV identifier without changing
-- any historical vendor records. The shared advisory lock is also taken by the
-- approval statement so reseeding cannot race a live ID allocation.
CREATE SEQUENCE IF NOT EXISTS vendor_id_seq START WITH 1;

--> statement-breakpoint
SELECT pg_advisory_lock(764204853);

--> statement-breakpoint
DO $$
DECLARE
  highest_vendor_number bigint;
  sequence_last_value bigint;
  sequence_is_called boolean;
  next_vendor_number bigint;
BEGIN
  SELECT MAX((substring(vendor_id FROM '^TDV([0-9]+)$'))::bigint)
    INTO highest_vendor_number
    FROM vendors
   WHERE vendor_id ~ '^TDV[0-9]+$';

  SELECT last_value, is_called
    INTO sequence_last_value, sequence_is_called
    FROM vendor_id_seq;

  next_vendor_number := CASE
    WHEN sequence_is_called THEN sequence_last_value + 1
    ELSE sequence_last_value
  END;

  -- Never move a sequence backwards: gaps are safe, reuse is not. Advance only
  -- when an existing ID would otherwise collide with the next allocation.
  IF highest_vendor_number IS NOT NULL AND highest_vendor_number >= next_vendor_number THEN
    PERFORM setval('vendor_id_seq', highest_vendor_number, true);
  END IF;
END $$;

--> statement-breakpoint
SELECT pg_advisory_unlock(764204853);