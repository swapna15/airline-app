-- ============================================================
-- AirlineOS — Seed Data
-- Migration 002: Demo users, airports, airlines, flights, seats
-- NOTE: passwords are bcrypt hashes of "password"
-- ============================================================

-- ============================================================
-- AIRPORTS
-- ============================================================
INSERT INTO airports (code, name, city, country, timezone) VALUES
  ('JFK', 'John F. Kennedy International Airport', 'New York',    'USA',          'America/New_York'),
  ('LAX', 'Los Angeles International Airport',     'Los Angeles', 'USA',          'America/Los_Angeles'),
  ('LHR', 'London Heathrow Airport',               'London',      'United Kingdom','Europe/London'),
  ('CDG', 'Charles de Gaulle Airport',             'Paris',       'France',        'Europe/Paris'),
  ('NRT', 'Narita International Airport',          'Tokyo',       'Japan',         'Asia/Tokyo'),
  ('SIN', 'Singapore Changi Airport',              'Singapore',   'Singapore',     'Asia/Singapore'),
  ('DXB', 'Dubai International Airport',           'Dubai',       'UAE',           'Asia/Dubai'),
  ('SYD', 'Sydney Kingsford Smith Airport',        'Sydney',      'Australia',     'Australia/Sydney'),
  ('HKG', 'Hong Kong International Airport',       'Hong Kong',   'Hong Kong',     'Asia/Hong_Kong'),
  ('FRA', 'Frankfurt Airport',                     'Frankfurt',   'Germany',       'Europe/Berlin')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- AIRLINES
-- ============================================================
INSERT INTO airlines (code, name, logo) VALUES
  ('AA', 'American Airlines',  '🇺🇸'),
  ('UA', 'United Airlines',    '🇺🇸'),
  ('BA', 'British Airways',    '🇬🇧'),
  ('AF', 'Air France',         '🇫🇷'),
  ('JL', 'Japan Airlines',     '🇯🇵'),
  ('SQ', 'Singapore Airlines', '🇸🇬'),
  ('EK', 'Emirates',           '🇦🇪'),
  ('QF', 'Qantas',             '🇦🇺'),
  ('CX', 'Cathay Pacific',     '🇭🇰'),
  ('LH', 'Lufthansa',          '🇩🇪')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- DEMO USERS  (password = "password" for all)
-- Generate real hashes via: node -e "const b=require('bcryptjs');console.log(b.hashSync('password',10))"
-- ============================================================
INSERT INTO users (name, email, password, role) VALUES
  ('Admin User',    'admin@airline.com',       '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin'),
  ('Coordinator',   'coordinator@airline.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'coordinator'),
  ('Gate Manager',  'gate@airline.com',        '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'gate_manager'),
  ('Check-in Agent','checkin@airline.com',     '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'checkin_agent'),
  ('Jane Doe',      'jane@example.com',        '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'passenger')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- SAMPLE FLIGHTS  (JFK → LHR, next 7 days)
-- ============================================================
DO $$
DECLARE
  flight_date DATE := CURRENT_DATE + 1;
  i INTEGER;
  airlines_list CHAR(2)[] := ARRAY['BA','AA','UA','LH','EK','AF'];
  aircraft_list TEXT[]    := ARRAY['Boeing 777','Boeing 787','Airbus A380','Airbus A350','Boeing 737','Airbus A320'];
  base_prices   NUMERIC[] := ARRAY[320, 440, 560, 560, 680, 800];
  flt_id        UUID;
  r INTEGER; l CHAR(1);
  seat_letters_eco  CHAR(1)[] := ARRAY['A','B','C','D','E','F'];
  seat_letters_bus  CHAR(1)[] := ARRAY['A','C','D','F'];
  seat_letters_fst  CHAR(1)[] := ARRAY['A','B'];
BEGIN
  -- Skip if flights already exist so this block is safe to re-run
  IF EXISTS (SELECT 1 FROM flights LIMIT 1) THEN RETURN; END IF;
  FOR i IN 0..5 LOOP
    INSERT INTO flights (
      flight_number, airline_code, origin_code, destination_code,
      departure_time, arrival_time, aircraft, status,
      gate, terminal,
      price_economy, price_business, price_first
    ) VALUES (
      airlines_list[i+1] || (1000 + i * 111)::TEXT,
      airlines_list[i+1],
      'JFK', 'LHR',
      (flight_date + ((6 + i * 3) || ' hours')::INTERVAL)::TIMESTAMPTZ,
      (flight_date + ((6 + i * 3 + 7) || ' hours')::INTERVAL)::TIMESTAMPTZ,
      aircraft_list[i+1],
      'scheduled',
      chr(65 + i) || (10 + i)::TEXT,
      'T' || (i % 3 + 1)::TEXT,
      base_prices[i+1],
      ROUND(base_prices[i+1] * 2.5),
      ROUND(base_prices[i+1] * 4.0)
    ) RETURNING id INTO flt_id;

    -- Economy seats (rows 10-39, 6 letters)
    FOR r IN 10..39 LOOP
      FOREACH l IN ARRAY seat_letters_eco LOOP
        INSERT INTO seats (flight_id, row_number, letter, class, type, is_occupied, extra_fee)
        VALUES (
          flt_id, r, l, 'economy',
          CASE WHEN l IN ('A','F') THEN 'window'
               WHEN l IN ('C','D') THEN 'aisle'
               ELSE 'middle' END,
          (random() > 0.6),
          CASE WHEN l IN ('A','C','D','F') THEN 25 ELSE 0 END
        )
        ON CONFLICT (flight_id, row_number, letter) DO NOTHING;
      END LOOP;
    END LOOP;

    -- Business seats (rows 4-15, 4 letters)
    FOR r IN 4..15 LOOP
      FOREACH l IN ARRAY seat_letters_bus LOOP
        INSERT INTO seats (flight_id, row_number, letter, class, type, is_occupied, extra_fee)
        VALUES (
          flt_id, r, l, 'business',
          CASE WHEN l IN ('A','F') THEN 'window' ELSE 'aisle' END,
          (random() > 0.7), 0
        )
        ON CONFLICT (flight_id, row_number, letter) DO NOTHING;
      END LOOP;
    END LOOP;

    -- First seats (rows 1-3, 2 letters)
    FOR r IN 1..3 LOOP
      FOREACH l IN ARRAY seat_letters_fst LOOP
        INSERT INTO seats (flight_id, row_number, letter, class, type, is_occupied, extra_fee)
        VALUES (flt_id, r, l, 'first', 'window', (random() > 0.8), 0)
        ON CONFLICT (flight_id, row_number, letter) DO NOTHING;
      END LOOP;
    END LOOP;

  END LOOP;
END $$;
