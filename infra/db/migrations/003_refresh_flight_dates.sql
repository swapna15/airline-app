-- 003_refresh_flight_dates.sql
-- Refresh ALL seeded flights to start today, with departures spaced through
-- the day so the planner has visible "today's rotation" data.
-- Idempotent — safe to re-run as the demo DB ages.
--
-- NOT tracked in schema_migrations: this is a data refresh, not a schema
-- change, and pinning a single applied date would defeat the purpose.

DO $$
DECLARE
  base_date DATE := CURRENT_DATE;
  i INTEGER := 0;
  flt RECORD;
  dep_offset INTERVAL;
  dur INTERVAL;
BEGIN
  -- Walk every flight in deterministic order so the same flight always lands
  -- on the same offset relative to base_date. Spacing: first departure 06:00,
  -- subsequent departures every 2 hours.
  FOR flt IN
    SELECT id, departure_time, arrival_time, flight_number
    FROM flights
    ORDER BY flight_number, id
  LOOP
    dep_offset := ((6 + i * 2) || ' hours')::INTERVAL;
    dur        := flt.arrival_time - flt.departure_time;  -- preserve original duration

    UPDATE flights
    SET departure_time = (base_date + dep_offset)::TIMESTAMPTZ,
        arrival_time   = (base_date + dep_offset + dur)::TIMESTAMPTZ
    WHERE id = flt.id;

    i := i + 1;
  END LOOP;

  RAISE NOTICE 'Refreshed % flights starting %', i, base_date;
END $$;
