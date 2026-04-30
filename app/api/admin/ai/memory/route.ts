/**
 * GAAS memory admin endpoints.
 *
 * GET    /api/admin/ai/memory               → list facts for caller's tenant
 * POST   /api/admin/ai/memory               → upsert a fact
 * DELETE /api/admin/ai/memory?id=...        → drop a fact
 *
 * Tenant scoping comes from the JWT (tenantSlug) extracted by tenantFromToken.
 * The vector store backend is selected by NEXT_PUBLIC_API_URL — in-memory
 * for local dev, pgvector via the planning Lambda when deployed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';
import { tenantFromToken } from '@/lib/ai/tenant';
import { rememberFact, listFacts, deleteFact, type AgentMemoryFact } from '@/lib/ai/memory';

export const maxDuration = 30;

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const token = await getApiBearer(req);
  if (!token) return unauthorized();
  const tenantId = tenantFromToken(token);
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') as AgentMemoryFact['scope'] | null;
  const facts = await listFacts({ tenantId, scope: scope ?? undefined });
  return NextResponse.json({ tenantId, facts });
}

export async function POST(req: NextRequest) {
  const token = await getApiBearer(req);
  if (!token) return unauthorized();
  const tenantId = tenantFromToken(token);
  const body = await req.json() as Partial<AgentMemoryFact>;
  if (!body.title || !body.body || !body.scope) {
    return NextResponse.json({ error: 'title, body, and scope are required' }, { status: 400 });
  }
  const fact = await rememberFact({
    id: body.id ?? `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    scope: body.scope,
    title: body.title,
    body: body.body,
    source: body.source ?? 'manual',
    tags: body.tags,
  });
  return NextResponse.json(fact);
}

export async function DELETE(req: NextRequest) {
  const token = await getApiBearer(req);
  if (!token) return unauthorized();
  const tenantId = tenantFromToken(token);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const ok = await deleteFact(tenantId, id);
  return NextResponse.json({ ok });
}
