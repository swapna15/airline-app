import { NextRequest, NextResponse } from 'next/server';
import {
  ALL_KINDS, setIntegrationConfig, deleteIntegrationConfig,
  type IntegrationKind,
} from '@/lib/integrations/config-store';
import { resetFuelPriceProvider } from '@/lib/integrations/fuelprices/resolver';
import { resetMelProvider }       from '@/lib/integrations/mel/resolver';
import { resetCrewProvider }      from '@/lib/integrations/crew/resolver';

export const maxDuration = 30;

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

  const saved = setIntegrationConfig({
    kind:     params.kind,
    provider: body.provider,
    config:   body.config,
    enabled:  body.enabled ?? true,
  });
  // Bust the cached resolver instance so the next request picks up the change.
  resetCacheFor(params.kind);
  return NextResponse.json(saved);
}

export async function DELETE(_req: NextRequest, { params }: { params: { kind: string } }) {
  if (!isValidKind(params.kind)) {
    return NextResponse.json({ error: `unknown integration kind: ${params.kind}` }, { status: 400 });
  }
  const removed = deleteIntegrationConfig(params.kind);
  resetCacheFor(params.kind);
  return NextResponse.json({ removed });
}
