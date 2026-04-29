import { NextRequest, NextResponse } from 'next/server';
import { ALL_KINDS, setLastHealth, type IntegrationKind } from '@/lib/integrations/config-store';
import { buildFuelPriceProvider } from '@/lib/integrations/fuelprices/resolver';
import { buildMelProvider }       from '@/lib/integrations/mel/resolver';
import { buildCrewProvider }      from '@/lib/integrations/crew/resolver';
import type { Provider } from '@/lib/integrations/types';

export const maxDuration = 30;

/**
 * Run a health check against an arbitrary provider configuration without
 * persisting it. The admin UI calls this on the "Test connection" button so
 * users can validate credentials/URLs before committing.
 *
 * If `?save=true` is passed and the test succeeds, the result is also
 * persisted onto the existing config row (`lastHealth`).
 */

function isValidKind(s: string): s is IntegrationKind {
  return (ALL_KINDS as string[]).includes(s);
}

function build(kind: IntegrationKind, provider: string, config: Record<string, unknown>): Provider {
  switch (kind) {
    case 'fuel_price': return buildFuelPriceProvider({ provider, config });
    case 'mel':        return buildMelProvider({ provider, config });
    case 'crew':       return buildCrewProvider({ provider, config });
  }
}

interface TestBody {
  provider: string;
  config: Record<string, unknown>;
}

export async function POST(req: NextRequest, { params }: { params: { kind: string } }) {
  if (!isValidKind(params.kind)) {
    return NextResponse.json({ error: `unknown integration kind: ${params.kind}` }, { status: 400 });
  }
  const body = (await req.json()) as TestBody;
  if (!body.provider || typeof body.config !== 'object' || body.config === null) {
    return NextResponse.json({ error: 'provider and config are required' }, { status: 400 });
  }

  let provider: Provider;
  try {
    provider = build(params.kind, body.provider, body.config);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      checkedAt: new Date().toISOString(),
    });
  }

  const result = await provider.healthCheck();
  if (req.nextUrl.searchParams.get('save') === 'true' && result.ok) {
    setLastHealth(params.kind, result);
  }
  return NextResponse.json(result);
}
