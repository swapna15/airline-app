-- 011_pbn_oceanic_defaults.sql
--
-- Backfill RNP-4 + RNP-10 onto existing tenants' OpsSpec PBN authorizations.
--
-- Migration 010 seeded ['RNP-2','RNP-AR'] which is incomplete — every modern
-- long-haul operator that flies the NAT HLA / PAC OTS needs RNP-4
-- (and RNP-10 as the legacy fallback for some tracks). Without these the
-- new route-phase PBN check (lib/pbn.ts) hard-rejects every oceanic flight.
--
-- Idempotent: only adds the missing levels, doesn't touch tenants who've
-- already customized their pbn_authorizations.

UPDATE ops_specs
SET pbn_authorizations = jsonb_set(
  pbn_authorizations,
  '{rnpLevels}',
  to_jsonb(
    -- Append the missing levels only.
    array(
      SELECT DISTINCT level
      FROM unnest(
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(pbn_authorizations->'rnpLevels')),
          ARRAY[]::text[]
        ) || ARRAY['RNP-4','RNP-10']
      ) AS level
    )
  )
)
WHERE
  -- Only update rows that don't already have RNP-4 in their list.
  NOT (pbn_authorizations->'rnpLevels' ? 'RNP-4');
