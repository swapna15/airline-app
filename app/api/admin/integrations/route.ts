import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import {
  ALL_KINDS, listIntegrationConfigs,
  type IntegrationKind, type IntegrationConfig,
} from '@/lib/integrations/config-store';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function authToken() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session as { accessToken?: string }).accessToken;
}

interface LambdaIntegrationRow {
  kind: IntegrationKind;
  provider: string;
  config: Record<string, unknown>;
  enabled: boolean;
  lastHealth?: IntegrationConfig['lastHealth'];
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Lists the *effective* configuration for every integration kind.
 * - if a row exists in the store, returns it
 * - otherwise returns a synthetic record showing the env-var fallback
 *   provider with a `source: 'env'` flag so the UI can show "(default)"
 */

interface EffectiveRow {
  kind: IntegrationKind;
  source: 'store' | 'env';
  provider: string;
  config: Record<string, unknown>;
  enabled: boolean;
  lastHealth?: IntegrationConfig['lastHealth'];
  updatedAt?: string;
  updatedBy?: string;
}

function envFallback(kind: IntegrationKind): EffectiveRow {
  // Mirrors the resolvers' env reading without instantiating providers.
  const e = process.env;
  switch (kind) {
    case 'fuel_price': {
      const which = (e.FUEL_PRICE_PROVIDER ?? 'mock').toLowerCase();
      return {
        kind, source: 'env', enabled: true, provider: which,
        config: which === 'csv' || which === 's3_csv'
          ? { uri: e.FUEL_PRICE_CSV_URI ?? '', authorization: redact(e.FUEL_PRICE_CSV_AUTH) }
          : which === 'api' || which === 'api_fms'
          ? { url: e.FUEL_PRICE_API_URL ?? '', authMethod: e.FUEL_PRICE_API_AUTH_METHOD ?? 'bearer',
              tokenRef: redact(e.FUEL_PRICE_API_TOKEN), tokenHeader: e.FUEL_PRICE_API_TOKEN_HEADER }
          : {},
      };
    }
    case 'mel': {
      const which = (e.MEL_PROVIDER ?? 'mock').toLowerCase();
      return {
        kind, source: 'env', enabled: true, provider: which,
        config: which.startsWith('api')
          ? { url: e.MEL_API_URL ?? '', authMethod: e.MEL_API_AUTH_METHOD ?? 'bearer',
              tokenRef: redact(e.MEL_API_TOKEN), tokenHeader: e.MEL_API_TOKEN_HEADER }
          : which === 'csv' || which === 's3_csv'
          ? { uri: e.MEL_CSV_URI ?? '', authorization: redact(e.MEL_CSV_AUTH) }
          : {},
      };
    }
    case 'crew': {
      const which = (e.CREW_PROVIDER ?? 'mock').toLowerCase();
      return {
        kind, source: 'env', enabled: true, provider: which,
        config: which.startsWith('api')
          ? { rosterUrl: e.CREW_API_ROSTER_URL ?? '', assignmentsUrl: e.CREW_API_ASSIGNMENTS_URL ?? '',
              authMethod: e.CREW_API_AUTH_METHOD ?? 'bearer', tokenRef: redact(e.CREW_API_TOKEN),
              tokenHeader: e.CREW_API_TOKEN_HEADER }
          : which === 'csv' || which === 's3_csv'
          ? { rosterUri: e.CREW_ROSTER_URI ?? '', assignmentsUri: e.CREW_ASSIGNMENTS_URI ?? '',
              authorization: redact(e.CREW_CSV_AUTH) }
          : {},
      };
    }
  }
}

/**
 * Token refs that look like raw tokens are redacted before display. `env://`
 * and `secretsmanager:` refs are safe to show — they're indirection only.
 */
function redact(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (v.startsWith('env://') || v.startsWith('secretsmanager:')) return v;
  return '••••••' + v.slice(-4);
}

function buildEffective(stored: Map<IntegrationKind, { kind: IntegrationKind; provider: string; config: Record<string, unknown>; enabled: boolean; lastHealth?: IntegrationConfig['lastHealth']; updatedAt?: string; updatedBy?: string }>): EffectiveRow[] {
  return ALL_KINDS.map((k) => {
    const s = stored.get(k);
    if (s && s.enabled) {
      return {
        kind: s.kind, source: 'store', provider: s.provider,
        config: redactConfig(s.config),
        enabled: s.enabled, lastHealth: s.lastHealth,
        updatedAt: s.updatedAt, updatedBy: s.updatedBy,
      };
    }
    return envFallback(k);
  });
}

export async function GET() {
  if (API_URL) {
    const token = await authToken();
    if (token) {
      try {
        const res = await fetch(`${API_URL}/admin/integrations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { integrations: lambdaRows = [] } = (await res.json()) as { integrations?: LambdaIntegrationRow[] };
          const byKind = new Map(lambdaRows.map((r) => [r.kind, r]));
          return NextResponse.json({ integrations: buildEffective(byKind) });
        }
        // Upstream returned a non-2xx — fall through to env-only listing so the UI
        // still renders. The reason is surfaced via the 'env' source flag.
      } catch {
        // network error — same fallback
      }
    }
    // No session token or upstream failed: show env defaults so the page never
    // dead-ends. Saves require a working upstream and will surface the error then.
    return NextResponse.json({ integrations: buildEffective(new Map()) });
  }

  const stored = new Map(listIntegrationConfigs().map((c) => [c.kind, c]));
  return NextResponse.json({ integrations: buildEffective(stored) });
}

function redactConfig(c: Record<string, unknown>): Record<string, unknown> {
  const out = { ...c };
  for (const k of ['tokenRef', 'authorization']) {
    if (typeof out[k] === 'string') out[k] = redact(out[k] as string);
  }
  return out;
}
