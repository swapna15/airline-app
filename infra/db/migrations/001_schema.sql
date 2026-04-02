-- ============================================================
-- AirlineOS — Aurora PostgreSQL Schema
-- Migration 001: Initial schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  email       TEXT        UNIQUE NOT NULL,
  password    TEXT        NOT NULL,          -- bcrypt hash
  role        TEXT        NOT NULL DEFAULT 'passenger'
                          CHECK (role IN ('passenger','checkin_agent','gate_manager','coordinator','admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);

-- ============================================================
-- AIRPORTS
-- ============================================================
CREATE TABLE airports (
  code      CHAR(3)   PRIMARY KEY,          -- IATA code
  name      TEXT      NOT NULL,
  city      TEXT      NOT NULL,
  country   TEXT      NOT NULL,
  timezone  TEXT
);

-- ============================================================
-- AIRLINES
-- ============================================================
CREATE TABLE airlines (
  code  CHAR(2)   PRIMARY KEY,              -- IATA code
  name  TEXT      NOT NULL,
  logo  TEXT      NOT NULL DEFAULT '✈️'
);

-- ============================================================
-- FLIGHTS
-- ============================================================
CREATE TABLE flights (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_number   TEXT        NOT NULL,
  airline_code    CHAR(2)     NOT NULL REFERENCES airlines(code),
  origin_code     CHAR(3)     NOT NULL REFERENCES airports(code),
  destination_code CHAR(3)   NOT NULL REFERENCES airports(code),
  departure_time  TIMESTAMPTZ NOT NULL,
  arrival_time    TIMESTAMPTZ NOT NULL,
  aircraft        TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled','boarding','departed','delayed','cancelled')),
  delay_minutes   INTEGER     NOT NULL DEFAULT 0,
  gate            TEXT,
  terminal        TEXT,
  price_economy   NUMERIC(10,2) NOT NULL,
  price_business  NUMERIC(10,2) NOT NULL,
  price_first     NUMERIC(10,2) NOT NULL,
  baggage_carry   TEXT        NOT NULL DEFAULT '1 x 7kg',
  baggage_checked TEXT        NOT NULL DEFAULT '1 x 23kg',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flights_origin_dest_date
  ON flights (origin_code, destination_code, departure_time);
CREATE INDEX idx_flights_status ON flights (status);

-- ============================================================
-- SEATS
-- ============================================================
CREATE TABLE seats (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id   UUID    NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  row_number  INTEGER NOT NULL,
  letter      CHAR(1) NOT NULL,
  class       TEXT    NOT NULL CHECK (class IN ('economy','business','first')),
  type        TEXT    NOT NULL CHECK (type IN ('window','middle','aisle')),
  is_occupied BOOLEAN NOT NULL DEFAULT false,
  extra_fee   NUMERIC(10,2) NOT NULL DEFAULT 0,
  features    TEXT[]  NOT NULL DEFAULT '{}',
  UNIQUE (flight_id, row_number, letter)
);

CREATE INDEX idx_seats_flight ON seats (flight_id, class);

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TABLE bookings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pnr              CHAR(6)     UNIQUE NOT NULL,
  user_id          UUID        NOT NULL REFERENCES users(id),
  flight_id        UUID        NOT NULL REFERENCES flights(id),
  return_flight_id UUID        REFERENCES flights(id),
  status           TEXT        NOT NULL DEFAULT 'confirmed'
                               CHECK (status IN ('pending','confirmed','cancelled')),
  base_fare        NUMERIC(10,2) NOT NULL,
  taxes            NUMERIC(10,2) NOT NULL DEFAULT 0,
  fees             NUMERIC(10,2) NOT NULL DEFAULT 0,
  seat_fees        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(10,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_user ON bookings (user_id);
CREATE INDEX idx_bookings_flight ON bookings (flight_id);
CREATE INDEX idx_bookings_pnr ON bookings (pnr);

-- ============================================================
-- BOOKING PASSENGERS
-- ============================================================
CREATE TABLE booking_passengers (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID    NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id         UUID    REFERENCES seats(id),
  type            TEXT    NOT NULL CHECK (type IN ('adult','child','infant')),
  title           TEXT    NOT NULL,
  first_name      TEXT    NOT NULL,
  last_name       TEXT    NOT NULL,
  date_of_birth   DATE    NOT NULL,
  passport_number TEXT,
  passport_expiry DATE,
  nationality     TEXT
);

CREATE INDEX idx_booking_passengers_booking ON booking_passengers (booking_id);

-- ============================================================
-- CONTACT INFO  (one per booking)
-- ============================================================
CREATE TABLE booking_contact (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID  UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  email       TEXT  NOT NULL,
  phone       TEXT  NOT NULL,
  street      TEXT  NOT NULL,
  city        TEXT  NOT NULL,
  state       TEXT  NOT NULL,
  zip_code    TEXT  NOT NULL,
  country     TEXT  NOT NULL
);

-- ============================================================
-- CHECK-INS
-- ============================================================
CREATE TABLE checkins (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID        NOT NULL REFERENCES bookings(id),
  passenger_id    UUID        NOT NULL REFERENCES booking_passengers(id),
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  bags_checked    INTEGER     NOT NULL DEFAULT 0,
  boarding_group  CHAR(1)     NOT NULL DEFAULT 'B',
  UNIQUE (booking_id, passenger_id)
);

CREATE INDEX idx_checkins_booking ON checkins (booking_id);

-- ============================================================
-- updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
