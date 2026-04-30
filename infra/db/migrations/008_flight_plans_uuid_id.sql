-- 008_flight_plans_uuid_id.sql
-- Reverses migration 007. Now that the planner consumes real OwnFlight UUIDs
-- from the deployed flights table (instead of the old "1"/"2" string mocks),
-- restore flight_plans.flight_id as UUID with the FK to flights(id) so
-- referential integrity holds.
--
-- Pre-flight: any rows in flight_plans whose flight_id isn't a valid UUID or
-- doesn't exist in flights will be deleted. They were demo-only artifacts
-- created against the loosened schema.
--
-- Idempotent: safe to re-run. Detects current column type and only acts when
-- it's TEXT (post-007). Re-adding the FK is also conditional.

DO $$
DECLARE
  current_type TEXT;
  fk_exists    BOOLEAN;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'flight_plans' AND column_name = 'flight_id';

  IF current_type = 'text' THEN
    -- Drop rows that wouldn't survive the cast (mocks like '1', '2', or
    -- orphaned plans whose flight no longer exists).
    DELETE FROM flight_plans
    WHERE flight_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM flights f WHERE f.id::text = flight_plans.flight_id);

    ALTER TABLE flight_plans
      ALTER COLUMN flight_id TYPE UUID USING flight_id::uuid;
  END IF;

  -- Re-add the FK if it isn't already there.
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'flight_plans'::regclass
      AND contype  = 'f'
      AND pg_get_constraintdef(oid) ILIKE '%flight_id%REFERENCES%flights%'
  ) INTO fk_exists;

  IF NOT fk_exists THEN
    ALTER TABLE flight_plans
      ADD CONSTRAINT flight_plans_flight_id_fkey
      FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE;
  END IF;
END$$;
