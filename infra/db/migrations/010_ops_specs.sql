-- 010_ops_specs.sql
-- Per-tenant Operations Specifications — the airline's FAA-approved (or
-- equivalent) operating authorities. Source of truth for fuel policy,
-- alternate weather minima, ETOPS approval, PBN authorizations, and the
-- authorized airport list. One row per tenant.
--
-- Maps to the doc's named OpsSpec paragraphs:
--
--   A030/A032 — authorized airports (regular / alternate / refueling)
--   B036/C063 — RNAV/RNP / PBN specifications
--   B044      — ETOPS approval (max minutes, authorized types)
--   C055      — alternate weather minima
--
-- Concrete numeric fields stay in JSONB so the schema doesn't need a
-- migration every time an airline policy adds a new knob. The shape is
-- documented in lib/ops-specs.ts on the Next.js side.

CREATE TABLE ops_specs (
  tenant_id            UUID         PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  /* ── Fuel policy (airline adders on top of regulatory minima) ─────────── */
  /* { contingencyPct, alternateMinutes, finalReserveMinutes, taxiKg,
   *   captainsFuelMinutes, tankeringEnabled } */
  fuel_policy          JSONB        NOT NULL DEFAULT '{}'::jsonb,

  /* ── C055 alternate weather minima ────────────────────────────────────── */
  /* { destinationCeilingFt, destinationVisSm, alternateCeilingFt,
   *   alternateVisSm } */
  alternate_minima     JSONB        NOT NULL DEFAULT '{}'::jsonb,

  /* ── B044 ETOPS approval ──────────────────────────────────────────────── */
  /* { maxMinutes: 0|60|120|138|180|207|240|330|370,
   *   authorizedTypes: [icaoTypeCode] } */
  etops_approval       JSONB        NOT NULL DEFAULT '{}'::jsonb,

  /* ── B036/C063 PBN authorizations ─────────────────────────────────────── */
  /* { rnavLevels: ['RNAV-1','RNAV-2','RNAV-5'], rnpLevels: ['RNP-2','RNP-4','RNP-10','RNP-AR'] } */
  pbn_authorizations   JSONB        NOT NULL DEFAULT '{}'::jsonb,

  /* ── Cost index (per type, falling back to default) ───────────────────── */
  /* { default: 30, byType: { 'B77W': 25, 'A388': 40 } } */
  cost_index           JSONB        NOT NULL DEFAULT '{}'::jsonb,

  /* ── A030/A032 authorized airports list (ICAO codes) ──────────────────── */
  authorized_airports  TEXT[]       NOT NULL DEFAULT '{}',

  notes                TEXT,
  updated_by           UUID         REFERENCES users(id),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed defaults for existing tenants. Numbers chosen to match the current
-- hardcoded values in lib/perf.ts so behavior is identical until an admin
-- edits the row.
INSERT INTO ops_specs (tenant_id, fuel_policy, alternate_minima, etops_approval, pbn_authorizations, cost_index)
SELECT
  t.id,
  '{
     "contingencyPct": 5,
     "alternateMinutes": 45,
     "finalReserveMinutes": 30,
     "taxiKg": 600,
     "captainsFuelMinutes": 0,
     "tankeringEnabled": true
   }'::jsonb,
  '{
     "destinationCeilingFt": 2000,
     "destinationVisSm": 3,
     "alternateCeilingFt": 600,
     "alternateVisSm": 2
   }'::jsonb,
  '{
     "maxMinutes": 180,
     "authorizedTypes": ["B77W","B789","A333","A359"]
   }'::jsonb,
  '{
     "rnavLevels": ["RNAV-1","RNAV-2","RNAV-5"],
     "rnpLevels":  ["RNP-2","RNP-4","RNP-10","RNP-AR"]
   }'::jsonb,
  '{ "default": 30, "byType": {} }'::jsonb
FROM tenants t
ON CONFLICT (tenant_id) DO NOTHING;
