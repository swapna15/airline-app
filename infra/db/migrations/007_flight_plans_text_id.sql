-- 007_flight_plans_text_id.sql
-- Relax flight_plans.flight_id from UUID to TEXT so the planner can save
-- against arbitrary identifiers (mock flights use "1", "2", ... — these
-- aren't UUIDs and Postgres rejects them with
-- "invalid input syntax for type uuid").
--
-- Drops the FK to flights(id) since flights.id stays UUID. We can re-add a
-- proper FK later if we ever start using real flight UUIDs end-to-end.
--
-- Idempotent: safe to re-run.

ALTER TABLE flight_plans
  DROP CONSTRAINT IF EXISTS flight_plans_flight_id_fkey;

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'flight_plans' AND column_name = 'flight_id';
  IF current_type = 'uuid' THEN
    ALTER TABLE flight_plans ALTER COLUMN flight_id TYPE TEXT USING flight_id::text;
  END IF;
END$$;
