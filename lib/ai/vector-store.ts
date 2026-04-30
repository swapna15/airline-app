/**
 * Pluggable vector store for the GAAS retrieval layer.
 *
 * Two backends:
 *   1. pgvector (production) — uses the airline_app Aurora cluster with the
 *      pgvector extension installed by migration 012. Tenant-isolated by
 *      tenant_id column + RLS, the same pattern flight_plans uses.
 *   2. in-memory (default for local dev) — globalThis-attached Map, HMR-safe,
 *      same convention as lib/planner-store.ts. Lets the multi-agent system
 *      run end-to-end without a database.
 *
 * Selection: when NEXT_PUBLIC_API_URL is set we forward to the planning
 * Lambda's vector endpoints; otherwise the in-memory store services the
 * request locally.
 *
 * The Document shape mirrors what RAG retrieval needs: text + metadata for
 * filter (kind, phase, source) + the embedding vector.
 */

import { cosineSimilarity, getEmbeddingProvider } from './embeddings';

export interface VectorDocument {
  id: string;
  tenantId: string;
  /** What kind of corpus item — gates retrieval by phase. */
  kind: 'rejection' | 'opsspec' | 'sop' | 'regulation' | 'memory' | 'incident';
  /** Optional per-phase scoping — e.g., 'brief' rejections shouldn't show on 'fuel'. */
  phase?: string;
  /** Original text — what the agent sees when this doc is retrieved. */
  text: string;
  /** Provenance for the OFP audit trail (URL, doc id, comment-id, etc.). */
  source?: string;
  /** Tags for additional filtering — e.g., ['oceanic', 'b77w']. */
  tags?: string[];
  /** Embedding — set by the store at write time, read at search time. */
  embedding?: number[];
  createdAt: string;
}

export interface SearchResult {
  doc: VectorDocument;
  score: number;
}

export interface VectorStore {
  upsert(doc: Omit<VectorDocument, 'embedding' | 'createdAt'> & { createdAt?: string }): Promise<VectorDocument>;
  search(opts: {
    tenantId: string;
    query: string;
    limit?: number;
    kind?: VectorDocument['kind'] | VectorDocument['kind'][];
    phase?: string;
    minScore?: number;
  }): Promise<SearchResult[]>;
  list(opts: { tenantId: string; kind?: VectorDocument['kind']; limit?: number }): Promise<VectorDocument[]>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

// ── In-memory backend ─────────────────────────────────────────────────────

/**
 * HMR-safe globalThis attachment. Same convention as lib/planner-store.ts —
 * Next.js dev recompiles drop module-level state otherwise, which would
 * surprise the operator mid-session.
 */
const G = globalThis as typeof globalThis & {
  __airlineAppVectorStore?: Map<string, VectorDocument>;
};
const memstore: Map<string, VectorDocument> =
  G.__airlineAppVectorStore ?? (G.__airlineAppVectorStore = new Map());

class InMemoryVectorStore implements VectorStore {
  async upsert(doc: Omit<VectorDocument, 'embedding' | 'createdAt'> & { createdAt?: string }): Promise<VectorDocument> {
    const provider = getEmbeddingProvider();
    const [embedding] = await provider.embed([doc.text]);
    const stored: VectorDocument = {
      ...doc,
      embedding,
      createdAt: doc.createdAt ?? new Date().toISOString(),
    };
    memstore.set(this.key(doc.tenantId, doc.id), stored);
    return stored;
  }

  async search(opts: {
    tenantId: string;
    query: string;
    limit?: number;
    kind?: VectorDocument['kind'] | VectorDocument['kind'][];
    phase?: string;
    minScore?: number;
  }): Promise<SearchResult[]> {
    const provider = getEmbeddingProvider();
    const [qEmbedding] = await provider.embed([opts.query]);
    const kindSet = opts.kind
      ? new Set(Array.isArray(opts.kind) ? opts.kind : [opts.kind])
      : null;

    const matches: SearchResult[] = [];
    for (const doc of Array.from(memstore.values())) {
      if (doc.tenantId !== opts.tenantId) continue;
      if (kindSet && !kindSet.has(doc.kind)) continue;
      if (opts.phase && doc.phase && doc.phase !== opts.phase) continue;
      if (!doc.embedding) continue;
      const score = cosineSimilarity(qEmbedding, doc.embedding);
      if (opts.minScore !== undefined && score < opts.minScore) continue;
      matches.push({ doc, score });
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, opts.limit ?? 5);
  }

  async list(opts: { tenantId: string; kind?: VectorDocument['kind']; limit?: number }): Promise<VectorDocument[]> {
    const out: VectorDocument[] = [];
    for (const doc of Array.from(memstore.values())) {
      if (doc.tenantId !== opts.tenantId) continue;
      if (opts.kind && doc.kind !== opts.kind) continue;
      out.push(doc);
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out.slice(0, opts.limit ?? 100);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    return memstore.delete(this.key(tenantId, id));
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}::${id}`;
  }
}

// ── HTTP-bridged backend (forwards to planning Lambda) ────────────────────

class RemoteVectorStore implements VectorStore {
  constructor(private apiBase: string, private getToken: () => Promise<string | null>) {}

  async upsert(doc: Omit<VectorDocument, 'embedding' | 'createdAt'> & { createdAt?: string }): Promise<VectorDocument> {
    const token = await this.getToken();
    const res = await fetch(`${this.apiBase}/planning/vector/docs`, {
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify(doc),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`vector upsert ${res.status}`);
    return await res.json() as VectorDocument;
  }

  async search(opts: {
    tenantId: string;
    query: string;
    limit?: number;
    kind?: VectorDocument['kind'] | VectorDocument['kind'][];
    phase?: string;
    minScore?: number;
  }): Promise<SearchResult[]> {
    const token = await this.getToken();
    const res = await fetch(`${this.apiBase}/planning/vector/search`, {
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify(opts),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`vector search ${res.status}`);
    return await res.json() as SearchResult[];
  }

  async list(opts: { tenantId: string; kind?: VectorDocument['kind']; limit?: number }): Promise<VectorDocument[]> {
    const token = await this.getToken();
    const params = new URLSearchParams();
    if (opts.kind)  params.set('kind', opts.kind);
    if (opts.limit) params.set('limit', String(opts.limit));
    const res = await fetch(`${this.apiBase}/planning/vector/docs?${params}`, {
      headers: this.headers(token),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`vector list ${res.status}`);
    return await res.json() as VectorDocument[];
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const token = await this.getToken();
    const res = await fetch(`${this.apiBase}/planning/vector/docs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(token),
    });
    return res.ok;
  }

  private headers(token: string | null): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }
}

// ── Resolver ──────────────────────────────────────────────────────────────

let inMem: InMemoryVectorStore | null = null;

export function getVectorStore(): VectorStore {
  // For now, both modes use the in-memory store. The remote bridge ships
  // when migration 012 + the Lambda endpoints are deployed. Resolver lives
  // here so consumers don't change.
  if (!inMem) inMem = new InMemoryVectorStore();
  return inMem;
}

/** Constructor exposed for tests + the future remote-bridge wiring. */
export function buildRemoteVectorStore(apiBase: string, getToken: () => Promise<string | null>): VectorStore {
  return new RemoteVectorStore(apiBase, getToken);
}
