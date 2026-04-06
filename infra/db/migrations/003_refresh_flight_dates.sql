-- Migration 003: Refresh seeded flight departure/arrival times to rolling future dates
-- Run this whenever the demo DB flights fall into the past.
-- Safe to re-run — uses deterministic offsets so times stay consistent.

DO $$
DECLARE
  base_date DATE := CURRENT_DATE + 1;
  i INTEGER := 0;
  flt RECORD;
  dep_offset INTERVAL;
  dur INTERVAL;
BEGIN
  FOR flt IN
    SELECT id, departure_time, arrival_time
    FROM flights
    WHERE origin_code = 'JFK' AND destination_code = 'LHR'
    ORDER BY departure_time
  LOOP
    dep_offset := ((6 + i * 3) || ' hours')::INTERVAL;
    dur        := flt.arrival_time - flt.departure_time;  -- preserve original duration

    UPDATE flights
    SET departure_time = (base_date + dep_offset)::TIMESTAMPTZ,
        arrival_time   = (base_date + dep_offset + dur)::TIMESTAMPTZ
    WHERE id = flt.id;

    i := i + 1;
  END LOOP;

  RAISE NOTICE 'Refreshed % JFK→LHR flights to start on %', i, base_date;
END $$;
