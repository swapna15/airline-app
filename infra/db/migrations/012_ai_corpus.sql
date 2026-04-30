-- 012_ai_corpus.sql
--
-- Vector store + per-tenant memory tables for the GAAS planning AI layer.
--
-- Backs the production path of lib/ai/vector-store.ts. The in-memory store
-- ships today and works for local dev; this migration prepares the schema
-- so tenants can flip NEXT_PUBLIC_API_URL and have RAG persist across
-- restarts and across operators in the same OCC.
--
-- Dimensionality: vector_documents.embedding is sized 1024 to match
-- voyage-3 (Anthropic's recommended embedding model). For OpenAI's
-- text-embedding-3-small (1536) or text-embedding-3-large (3072), tenants
-- alter the column or run a parallel column — left to per-tenant ops.

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Corpus ──────────────────────────────────────────────────────────────
-- One row per retrievable doc. kind gates which agents consume it.
CREATE TABLE IF NOT EXISTS vector_documents (
  id           TEXT         NOT NULL,
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind         TEXT         NOT NULL CHECK (kind IN ('rejection','opsspec','sop','regulation','memory','incident')),
  phase        TEXT,
  text         TEXT         NOT NULL,
  source       TEXT,
  tags         TEXT[]       NOT NULL DEFAULT '{}',
  embedding    vector(1024),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

-- IVFFlat index for cosine similarity. Lists tuned for ~10k docs/tenant;
-- bump up if a tenant's corpus grows.
CREATE INDEX IF NOT EXISTS idx_vector_documents_embedding_cosine
  ON vector_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_vector_documents_tenant_kind
  ON vector_documents (tenant_id, kind);

CREATE INDEX IF NOT EXISTS idx_vector_documents_tenant_phase
  ON vector_documents (tenant_id, phase);

-- Row-level security — same pattern flight_plans uses.
ALTER TABLE vector_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vector_documents_tenant_isolation ON vector_documents;
CREATE POLICY vector_documents_tenant_isolation ON vector_documents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Retrieval audit log ─────────────────────────────────────────────────
-- Every retrieval call writes one row so dispatchers can see exactly
-- which docs informed which release. Critical for FAA audit trail.
CREATE TABLE IF NOT EXISTS vector_retrievals (
  id           BIGSERIAL    PRIMARY KEY,
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flight_id    UUID,
  phase        TEXT         NOT NULL,
  query        TEXT         NOT NULL,
  retrieved    JSONB        NOT NULL,    -- [{id, kind, score}]
  agent        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vector_retrievals_tenant_flight
  ON vector_retrievals (tenant_id, flight_id);

ALTER TABLE vector_retrievals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vector_retrievals_tenant_isolation ON vector_retrievals;
CREATE POLICY vector_retrievals_tenant_isolation ON vector_retrievals
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Touch trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION vector_documents_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vector_documents_touch ON vector_documents;
CREATE TRIGGER trg_vector_documents_touch
  BEFORE UPDATE ON vector_documents
  FOR EACH ROW EXECUTE FUNCTION vector_documents_touch_updated_at();
