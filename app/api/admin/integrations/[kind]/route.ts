import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';
import {
  ALL_KINDS, setIntegrationConfig, deleteIntegrationConfig,
  type IntegrationKind,
} from '@/lib/integrations/config-store';
import { resetFuelPriceProvider } from '@/lib/integrations/fuelprices/resolver';
import { resetMelProvider }       from '@/lib/integrations/mel/resolver';
import { resetCrewProvider }      from '@/lib/integrations/crew/resolver';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function isValidKind(s: string): s is IntegrationKind {
  return (ALL_KINDS as string[]).includes(s);
}

function resetCacheFor(kind: IntegrationKind) {
  if (kind === 'fuel_price') resetFuelPriceProvider();
  if (kind === 'mel')        resetMelProvider();
  if (kind === 'crew')       resetCrewProvider();
}

interface PutBody {
  provider: string;
  config: Record<string, unknown>;
  enabled?: boolean;
}

export async function PUT(req: NextRequest, { params }: { params: { kind: string } }) {
  if (!isValidKind(params.kind)) {
    return NextResponse.json({ error: `unknown integration kind: ${params.kind}` }, { status: 400 });
  }
  const body = (await req.json()) as PutBody;
  if (!body.provider || typeof body.config !== 'object' || body.config === null) {
    return NextResponse.json({ error: 'provider and config are required' }, { status: 400 });
  }

  if (API_URL) {
    const token = await getApiBearer(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const res = await fetch(`${API_URL}/admin/integrations/${params.kind}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    // Bust resolver cache so the next planner request picks up the change in this Next.js process.
    resetCacheFor(params.kind);
    return NextResponse.json(await res.json(), { status: res.status });
  }

  const saved = setIntegrationConfig({
    kind:     params.kind,
    provider: body.provider,
    config:   body.config,
    enabled:  body.enabled ?? true,
  });
  resetCacheFor(params.kind);
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest, { params }: { params: { kind: string } }) {
  if (!isValidKind(params.kind)) {
    return NextResponse.json({ error: `unknown integration kind: ${params.kind}` }, { status: 400 });
  }

  if (API_URL) {
    const token = await getApiBearer(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const res = await fetch(`${API_URL}/admin/integrations/${params.kind}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    resetCacheFor(params.kind);
    return NextResponse.json(await res.json(), { status: res.status });
  }

  const removed = deleteIntegrationConfig(params.kind);
  resetCacheFor(params.kind);
  return NextResponse.json({ removed });
}
