-- ============================================================
-- AirlineOS — Migration 003: Multi-tenant (row-level isolation)
-- ============================================================

-- ── Tenants table (config stored as JSONB) ────────────────────
CREATE TABLE tenants (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT  UNIQUE NOT NULL,          -- 'aeromock', 'skyways', 'horizonair'
  name       TEXT  NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}'
);

-- Seed the three demo tenants
-- (config mirrors core/tenant/registry.ts — source of truth stays in code for now)
INSERT INTO tenants (id, slug, name, config) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'aeromock',
    'AeroMock',
    '{
      "brand":       { "primaryColor": "#1a56db", "logo": "✈️" },
      "aiPreferences": { "tone": "concise" },
      "policies": {
        "cancellation": { "refundTiers": [
          { "hoursThreshold": 72, "percentage": 90 },
          { "hoursThreshold": 24, "percentage": 75 },
          { "hoursThreshold": 6,  "percentage": 50 },
          { "hoursThreshold": 0,  "percentage": 25 }
        ]},
        "baggage": { "checkedFee": 35 }
      }
    }'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'skyways',
    'Skyways Premium',
    '{
      "brand":       { "primaryColor": "#1a3a8f", "logo": "🛫" },
      "aiPreferences": { "tone": "formal" },
      "policies": {
        "cancellation": { "refundTiers": [
          { "hoursThreshold": 168, "percentage": 90 },
          { "hoursThreshold": 48,  "percentage": 50 }
        ]},
        "baggage": { "checkedIncluded": true }
      }
    }'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'horizonair',
    'Horizon Air',
    '{
      "brand":       { "primaryColor": "#0d9488", "logo": "🌅" },
      "aiPreferences": { "tone": "friendly" },
      "policies": {
        "cancellation": { "refundTiers": [
          { "hoursThreshold": 72, "percentage": 80 },
          { "hoursThreshold": 24, "percentage": 50 },
          { "hoursThreshold": 0,  "percentage": 25 }
        ]},
        "baggage": { "checkedFee": 30 }
      }
    }'
  );

-- ── Add tenant_id to core tables ──────────────────────────────

ALTER TABLE users    ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE flights  ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE bookings ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Default all existing rows → aeromock
UPDATE users    SET tenant_id = '00000000-0000-0000-0000-000000000001';
UPDATE flights  SET tenant_id = '00000000-0000-0000-0000-000000000001';
UPDATE bookings SET tenant_id = '00000000-0000-0000-0000-000000000001';

-- Now enforce NOT NULL
ALTER TABLE users    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE flights  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN tenant_id SET NOT NULL;

-- ── Re-scope the users email uniqueness to (tenant_id, email) ─
-- Same email can register with multiple airlines
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS idx_users_email;
CREATE UNIQUE INDEX idx_users_tenant_email ON users (tenant_id, email);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX idx_users_tenant    ON users    (tenant_id);
CREATE INDEX idx_flights_tenant  ON flights  (tenant_id);
CREATE INDEX idx_bookings_tenant ON bookings (tenant_id);

-- ── Row Level Security (defense-in-depth) ─────────────────────
-- Application code uses explicit tenant_id filters in every query.
-- RLS is a safety net: even if a query forgets the filter, data
-- from another tenant cannot leak while app.tenant_id is set.
--
-- Usage: before running any query, execute:
--   SET LOCAL app.tenant_id = '<uuid>';
-- inside a transaction.

ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Allow superuser / migration role to bypass RLS
ALTER TABLE users    FORCE ROW LEVEL SECURITY;
ALTER TABLE flights  FORCE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;

-- Policy: rows are visible only when tenant_id matches the session variable.
-- current_setting(..., true) returns '' if not set — so unset context = no rows.
CREATE POLICY tenant_isolation ON users
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON flights
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON bookings
  USING (tenant_id::text = current_setting('app.tenant_id', true));
