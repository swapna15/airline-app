-- 004_flight_plans.sql
-- Flight planning packets — one row per flight, owned by the planner who released it.
-- Each phase column is JSONB so we can evolve the shape per source (mock → AviationWeather/FAA/SimBrief)
-- without further migrations.

CREATE TABLE flight_plans (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  flight_id       UUID        NOT NULL REFERENCES flights(id) ON DELETE CASCADE,

  -- Lifecycle: draft → in_review → released → flown | cancelled
  status          TEXT        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','in_review','released','flown','cancelled')),

  -- Per-phase payloads. Each holds { data, summary, source, generated_at, approved_by?, approved_at?, comment? }
  brief           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  aircraft        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  route           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  fuel            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  weight_balance  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  crew            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  slot_atc        JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Release record
  released_by     UUID        REFERENCES users(id),
  released_at     TIMESTAMPTZ,

  -- Free-form planner notes — also feeds the Phase D feedback retrieval index
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, flight_id)
);

CREATE INDEX idx_flight_plans_tenant       ON flight_plans (tenant_id);
CREATE INDEX idx_flight_plans_flight       ON flight_plans (flight_id);
CREATE INDEX idx_flight_plans_status       ON flight_plans (tenant_id, status);

-- Audit trail of every approve/reject action across all phases.
-- Phase D learning loop reads from this table — never delete rows.
CREATE TABLE flight_plan_reviews (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_plan_id  UUID        NOT NULL REFERENCES flight_plans(id) ON DELETE CASCADE,
  phase           TEXT        NOT NULL
                  CHECK (phase IN ('brief','aircraft','route','fuel','weight_balance','crew','slot_atc','release')),
  action          TEXT        NOT NULL CHECK (action IN ('approve','reject','edit')),
  comment         TEXT,
  reviewer_id     UUID        NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flight_plan_reviews_plan  ON flight_plan_reviews (flight_plan_id);
CREATE INDEX idx_flight_plan_reviews_phase ON flight_plan_reviews (phase, action);

-- RLS: align with the multi-tenant policy from 003_multi_tenant.sql
ALTER TABLE flight_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON flight_plans
  USING (tenant_id::text = current_setting('app.tenant_id', true));
