import type { CrewProvider } from './types';
import { MockCrewProvider } from './mock';
import { CsvCrewProvider } from './csv';
import { ApiCrewProvider, type AuthMethod, type ApiSource } from './api';
import { getIntegrationConfig, configHash } from '../config-store';

/**
 * Provider selection priority — matches the fuel-price + MEL resolvers:
 *   1. integration_configs row for `crew` (admin UI)
 *   2. env vars (CREW_PROVIDER, …)
 *   3. mock
 */

export interface BuildArgs {
  provider: string;
  config: Record<string, unknown>;
  cacheTtlSec?: number;
}

export function buildCrewProvider({ provider, config, cacheTtlSec }: BuildArgs): CrewProvider {
  switch (provider) {
    case 'mock':
      return new MockCrewProvider();
    case 'csv':
    case 's3_csv': {
      const rosterUri = String(config.rosterUri ?? '');
      const assignmentsUri = String(config.assignmentsUri ?? '');
      if (!rosterUri || !assignmentsUri) {
        throw new Error(`provider=${provider} requires config.rosterUri and config.assignmentsUri`);
      }
      return new CsvCrewProvider({
        rosterUri,
        assignmentsUri,
        cacheTtlSec,
        authorization: config.authorization ? String(config.authorization) : undefined,
        region:        config.region ? String(config.region) : process.env.AWS_REGION,
      });
    }
    case 'api':
    case 'api_sabre':
    case 'api_jeppesen':
    case 'api_aims': {
      const rosterUrl      = String(config.rosterUrl ?? '');
      const assignmentsUrl = String(config.assignmentsUrl ?? '');
      const tokenRef       = String(config.tokenRef ?? '');
      if (!rosterUrl || !assignmentsUrl || !tokenRef) {
        throw new Error('api_* requires config.rosterUrl, config.assignmentsUrl, config.tokenRef');
      }
      const am = String(config.authMethod ?? 'bearer').toLowerCase();
      if (am !== 'bearer' && am !== 'basic' && am !== 'header') throw new Error(`unknown authMethod: ${am}`);
      const source: ApiSource | undefined =
        provider === 'api_sabre'    ? 'api_sabre'    :
        provider === 'api_jeppesen' ? 'api_jeppesen' :
        provider === 'api_aims'     ? 'api_aims'     : undefined;
      return new ApiCrewProvider({
        rosterUrl,
        assignmentsUrl,
        authMethod:  am as AuthMethod,
        tokenRef,
        tokenHeader: config.tokenHeader ? String(config.tokenHeader) : undefined,
        cacheTtlSec,
        region:      config.region ? String(config.region) : process.env.AWS_REGION,
        source,
      });
    }
    default:
      throw new Error(`unknown crew provider: ${provider}`);
  }
}

function envConfig(): { provider: string; config: Record<string, unknown> } {
  const which = (process.env.CREW_PROVIDER ?? 'mock').toLowerCase();
  switch (which) {
    case 'csv':
    case 's3_csv':
      return { provider: which, config: {
        rosterUri:      process.env.CREW_ROSTER_URI ?? '',
        assignmentsUri: process.env.CREW_ASSIGNMENTS_URI ?? '',
        authorization:  process.env.CREW_CSV_AUTH,
      } };
    case 'api':
    case 'api_sabre':
    case 'api_jeppesen':
    case 'api_aims':
      return { provider: which, config: {
        rosterUrl:      process.env.CREW_API_ROSTER_URL ?? '',
        assignmentsUrl: process.env.CREW_API_ASSIGNMENTS_URL ?? '',
        authMethod:     process.env.CREW_API_AUTH_METHOD ?? 'bearer',
        tokenRef:       process.env.CREW_API_TOKEN ?? '',
        tokenHeader:    process.env.CREW_API_TOKEN_HEADER,
      } };
    default:
      return { provider: 'mock', config: {} };
  }
}

let cached: { provider: CrewProvider; hash: string } | null = null;

export function resetCrewProvider(): void {
  cached = null;
}

export function getCrewProvider(): CrewProvider {
  const stored = getIntegrationConfig('crew');
  const effective = stored && stored.enabled ? { provider: stored.provider, config: stored.config } : envConfig();
  const hash = configHash(effective);

  if (cached && cached.hash === hash) return cached.provider;

  const ttlRaw = parseInt(process.env.CREW_CACHE_TTL ?? '', 10);
  const cacheTtlSec = Number.isFinite(ttlRaw) ? ttlRaw : 60;
  const provider = buildCrewProvider({ ...effective, cacheTtlSec });
  cached = { provider, hash };
  return provider;
}
