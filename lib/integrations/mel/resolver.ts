import type { MelProvider } from './types';
import { MockMelProvider } from './mock';
import { CsvMelProvider } from './csv';
import { ApiMelProvider, type AuthMethod, type ApiSource } from './api';
import { getIntegrationConfig, configHash } from '../config-store';

/**
 * Provider selection priority — matches the fuel-price resolver:
 *   1. integration_configs row for `mel` (admin UI)
 *   2. env vars (MEL_PROVIDER, …)
 *   3. mock
 */

export interface BuildArgs {
  provider: string;
  config: Record<string, unknown>;
  cacheTtlSec?: number;
}

export function buildMelProvider({ provider, config, cacheTtlSec }: BuildArgs): MelProvider {
  switch (provider) {
    case 'mock':
      return new MockMelProvider();
    case 'csv':
    case 's3_csv': {
      const uri = String(config.uri ?? '');
      if (!uri) throw new Error(`provider=${provider} requires config.uri`);
      return new CsvMelProvider({
        uri,
        cacheTtlSec,
        authorization: config.authorization ? String(config.authorization) : undefined,
        region:        config.region ? String(config.region) : process.env.AWS_REGION,
      });
    }
    case 'api':
    case 'api_amos':
    case 'api_trax':
    case 'api_camo': {
      const url = String(config.url ?? '');
      const tokenRef = String(config.tokenRef ?? '');
      if (!url || !tokenRef) throw new Error('api_* requires config.url and config.tokenRef');
      const am = String(config.authMethod ?? 'bearer').toLowerCase();
      if (am !== 'bearer' && am !== 'basic' && am !== 'header') throw new Error(`unknown authMethod: ${am}`);
      const source: ApiSource | undefined =
        provider === 'api_amos' ? 'api_amos' :
        provider === 'api_trax' ? 'api_trax' :
        provider === 'api_camo' ? 'api_camo' : undefined;
      return new ApiMelProvider({
        url,
        authMethod:  am as AuthMethod,
        tokenRef,
        tokenHeader: config.tokenHeader ? String(config.tokenHeader) : undefined,
        cacheTtlSec,
        region:      config.region ? String(config.region) : process.env.AWS_REGION,
        source,
      });
    }
    default:
      throw new Error(`unknown mel provider: ${provider}`);
  }
}

function envConfig(): { provider: string; config: Record<string, unknown> } {
  const which = (process.env.MEL_PROVIDER ?? 'mock').toLowerCase();
  switch (which) {
    case 'csv':
    case 's3_csv':
      return { provider: which, config: { uri: process.env.MEL_CSV_URI ?? '', authorization: process.env.MEL_CSV_AUTH } };
    case 'api':
    case 'api_amos':
    case 'api_trax':
    case 'api_camo':
      return { provider: which, config: {
        url:         process.env.MEL_API_URL ?? '',
        authMethod:  process.env.MEL_API_AUTH_METHOD ?? 'bearer',
        tokenRef:    process.env.MEL_API_TOKEN ?? '',
        tokenHeader: process.env.MEL_API_TOKEN_HEADER,
      } };
    default:
      return { provider: 'mock', config: {} };
  }
}

let cached: { provider: MelProvider; hash: string } | null = null;

export function resetMelProvider(): void {
  cached = null;
}

export function getMelProvider(): MelProvider {
  const stored = getIntegrationConfig('mel');
  const effective = stored && stored.enabled ? { provider: stored.provider, config: stored.config } : envConfig();
  const hash = configHash(effective);

  if (cached && cached.hash === hash) return cached.provider;

  const ttlRaw = parseInt(process.env.MEL_CACHE_TTL ?? '', 10);
  const cacheTtlSec = Number.isFinite(ttlRaw) ? ttlRaw : 60;
  const provider = buildMelProvider({ ...effective, cacheTtlSec });
  cached = { provider, hash };
  return provider;
}
