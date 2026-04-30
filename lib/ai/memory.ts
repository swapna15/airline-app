/**
 * Per-tenant agent memory — accumulated facts about how a specific airline
 * dispatches, learned from approved/rejected briefings over time.
 *
 * Distinct from the rejection-comment retrieval (which surfaces verbatim
 * planner objections). Memory captures higher-order patterns:
 *   - "this operator avoids RNP-AR approaches at LSGS due to crew comfort"
 *   - "tankering threshold raised to USD 400 after Q3 fuel-price volatility"
 *   - "always note volcanic ash risk near KZAK in summer per operations
 *      bulletin 2025-08"
 *
 * These are written by:
 *   - explicit user input via /admin/ai/memory (operator opt-in)
 *   - automated extraction post-release (a future "MemoryAgent" that
 *     watches approved/rejected pairs and proposes new memory entries
 *     for human approval — not built in this PR)
 *
 * They're stored in the same vector_documents table (kind='memory') so
 * the same RAG layer retrieves them. This file just wraps the store with
 * a typed API tuned for memory's fact-shape.
 */

import { getVectorStore, type VectorDocument } from './vector-store';

export interface AgentMemoryFact {
  id: string;
  tenantId: string;
  /** What domain this fact applies to — gates retrieval. */
  scope: 'fuel' | 'route' | 'crew' | 'aircraft' | 'brief' | 'release' | 'general';
  /** Short title — used in the audit panel. */
  title: string;
  /** Body — the fact itself, in the operator's words. */
  body: string;
  /** When/why this was added. */
  source: 'manual' | 'extracted' | 'imported';
  /** Free-form tags for richer filter (e.g., 'oceanic', 'b77w', 'winter'). */
  tags?: string[];
  createdAt: string;
  /** Last time the fact was retrieved during planning — for usefulness audit. */
  lastUsedAt?: string;
}

const SCOPE_TO_PHASE: Record<AgentMemoryFact['scope'], string | undefined> = {
  fuel:     'fuel',
  route:    'route',
  crew:     'crew',
  aircraft: 'aircraft',
  brief:    'brief',
  release:  'release',
  general:  undefined,           // matches every phase
};

export async function rememberFact(input: Omit<AgentMemoryFact, 'createdAt'> & { createdAt?: string }): Promise<AgentMemoryFact> {
  const store = getVectorStore();
  const phase = SCOPE_TO_PHASE[input.scope];
  const text = `${input.title}\n\n${input.body}`;
  const doc = await store.upsert({
    id: input.id,
    tenantId: input.tenantId,
    kind: 'memory',
    phase,
    text,
    source: input.source,
    tags: input.tags,
    createdAt: input.createdAt,
  });
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    scope: input.scope,
    title: input.title,
    body: input.body,
    source: input.source,
    tags: input.tags,
    createdAt: doc.createdAt,
  };
}

export async function listFacts(opts: { tenantId: string; scope?: AgentMemoryFact['scope']; limit?: number }): Promise<AgentMemoryFact[]> {
  const store = getVectorStore();
  const docs = await store.list({ tenantId: opts.tenantId, kind: 'memory', limit: opts.limit });
  return docs
    .filter((d) => !opts.scope || mapPhaseToScope(d.phase) === opts.scope)
    .map(toFact);
}

export async function deleteFact(tenantId: string, id: string): Promise<boolean> {
  const store = getVectorStore();
  return store.delete(tenantId, id);
}

function mapPhaseToScope(phase: string | undefined): AgentMemoryFact['scope'] {
  if (!phase) return 'general';
  return (phase as AgentMemoryFact['scope']);
}

function toFact(doc: VectorDocument): AgentMemoryFact {
  const [titleLine = '', ...bodyLines] = doc.text.split('\n\n');
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    scope: mapPhaseToScope(doc.phase),
    title: titleLine,
    body: bodyLines.join('\n\n'),
    source: (doc.source as AgentMemoryFact['source']) ?? 'manual',
    tags: doc.tags,
    createdAt: doc.createdAt,
  };
}
