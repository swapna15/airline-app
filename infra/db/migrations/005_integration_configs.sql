-- 005_integration_configs.sql
-- Per-tenant integration configuration: which provider (mock / csv / api_*)
-- and what config (URI, URL, auth method, secret reference) the planner
-- should use for fuel prices, MEL deferrals, and crew roster + assignments.
--
-- One row per (tenant, kind). Secrets are NEVER stored in `config` directly —
-- the column should hold either an `env://VAR` reference or a
-- `secretsmanager:arn:…` ARN. Plain tokens are accepted but discouraged.

CREATE TABLE integration_configs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Which integration this row configures.
  kind         TEXT        NOT NULL CHECK (kind IN ('fuel_price','mel','crew')),

  -- Provider selector: 'mock' | 'csv' | 's3_csv' | 'api_*' (per-domain)
  provider     TEXT        NOT NULL,

  -- Provider-specific config: URIs, URLs, auth method, token reference, etc.
  config       JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Disabled rows fall back to env vars / mock — same as deleting the row,
  -- but preserved for audit / quick re-enable.
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Last known healthCheck() result. Populated by `POST /admin/integrations/{kind}/test?save=true`.
  last_health  JSONB,

  updated_by   UUID        REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, kind)
);

CREATE INDEX idx_integration_configs_tenant ON integration_configs (tenant_id);

-- RLS: align with the multi-tenant policy from 003_multi_tenant.sql.
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_configs
  USING (tenant_id::text = current_setting('app.tenant_id', true));
