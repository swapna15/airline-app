import type { FuelPriceProvider } from './types';
import { MockFuelPriceProvider } from './mock';
import { CsvFuelPriceProvider } from './csv';
import { ApiFuelPriceProvider, type AuthMethod } from './api';
import { getIntegrationConfig, configHash } from '../config-store';

/**
 * Provider selection priority:
 *   1. integration_configs row for `fuel_price` (set via admin UI)
 *   2. env vars (FUEL_PRICE_PROVIDER, …)
 *   3. mock
 *
 * `buildFuelPriceProvider({ provider, config })` is exported separately so
 * the admin "Test connection" path can instantiate a provider from
 * unsaved config and run its health check before persisting.
 */

export interface BuildArgs {
  provider: string;
  config: Record<string, unknown>;
  cacheTtlSec?: number;
}

export function buildFuelPriceProvider({ provider, config, cacheTtlSec }: BuildArgs): FuelPriceProvider {
  switch (provider) {
    case 'mock':
      return new MockFuelPriceProvider();
    case 'csv':
    case 's3_csv': {
      const uri = String(config.uri ?? '');
      if (!uri) throw new Error(`provider=${provider} requires config.uri`);
      return new CsvFuelPriceProvider({
        uri,
        cacheTtlSec,
        authorization: config.authorization ? String(config.authorization) : undefined,
        region:        config.region ? String(config.region) : process.env.AWS_REGION,
      });
    }
    case 'api_fms':
    case 'api': {
      const url = String(config.url ?? '');
      const tokenRef = String(config.tokenRef ?? '');
      if (!url || !tokenRef) throw new Error('api_fms requires config.url and config.tokenRef');
      const am = String(config.authMethod ?? 'bearer').toLowerCase();
      if (am !== 'bearer' && am !== 'basic' && am !== 'header') throw new Error(`unknown authMethod: ${am}`);
      return new ApiFuelPriceProvider({
        url,
        authMethod:  am as AuthMethod,
        tokenRef,
        tokenHeader: config.tokenHeader ? String(config.tokenHeader) : undefined,
        cacheTtlSec,
        region:      config.region ? String(config.region) : process.env.AWS_REGION,
      });
    }
    default:
      throw new Error(`unknown fuel_price provider: ${provider}`);
  }
}

function envConfig(): { provider: string; config: Record<string, unknown> } {
  const which = (process.env.FUEL_PRICE_PROVIDER ?? 'mock').toLowerCase();
  switch (which) {
    case 'csv':
    case 's3_csv':
      return { provider: which, config: { uri: process.env.FUEL_PRICE_CSV_URI ?? '', authorization: process.env.FUEL_PRICE_CSV_AUTH } };
    case 'api':
    case 'api_fms':
      return { provider: 'api_fms', config: {
        url:         process.env.FUEL_PRICE_API_URL ?? '',
        authMethod:  process.env.FUEL_PRICE_API_AUTH_METHOD ?? 'bearer',
        tokenRef:    process.env.FUEL_PRICE_API_TOKEN ?? '',
        tokenHeader: process.env.FUEL_PRICE_API_TOKEN_HEADER,
      } };
    default:
      return { provider: 'mock', config: {} };
  }
}

let cached: { provider: FuelPriceProvider; hash: string } | null = null;

export function resetFuelPriceProvider(): void {
  cached = null;
}

export function getFuelPriceProvider(): FuelPriceProvider {
  const stored = getIntegrationConfig('fuel_price');
  const effective = stored && stored.enabled ? { provider: stored.provider, config: stored.config } : envConfig();
  const hash = configHash(effective);

  if (cached && cached.hash === hash) return cached.provider;

  const ttlRaw = parseInt(process.env.FUEL_PRICE_CACHE_TTL ?? '', 10);
  const cacheTtlSec = Number.isFinite(ttlRaw) ? ttlRaw : 60;
  const provider = buildFuelPriceProvider({ ...effective, cacheTtlSec });
  cached = { provider, hash };
  return provider;
}
