import type { FuelPriceProvider } from './types';
import { MockFuelPriceProvider } from './mock';
import { CsvFuelPriceProvider } from './csv';
import { ApiFuelPriceProvider, type AuthMethod } from './api';

/**
 * Provider selection from env vars.
 *
 *   FUEL_PRICE_PROVIDER     = 'mock' (default) | 'csv' | 'api_fms'
 *
 * For `csv`:
 *   FUEL_PRICE_CSV_URI      = s3://… | file://… | https://…
 *   FUEL_PRICE_CSV_AUTH     = 'Bearer …' | 'Basic …'           (optional, https only)
 *
 * For `api_fms`:
 *   FUEL_PRICE_API_URL          = full bulk endpoint URL
 *   FUEL_PRICE_API_AUTH_METHOD  = 'bearer' (default) | 'basic' | 'header'
 *   FUEL_PRICE_API_TOKEN        = env://VAR | secretsmanager:arn:… | <verbatim>
 *   FUEL_PRICE_API_TOKEN_HEADER = X-API-Key (only when AUTH_METHOD=header)
 *
 * Common:
 *   FUEL_PRICE_CACHE_TTL    = 60                               (optional, seconds)
 *
 * The next phase will read these from `integration_configs` keyed by tenant.
 * The resolver is memoised so a single Lambda warm instance reuses the cache.
 */

let cached: FuelPriceProvider | null = null;

export function resetFuelPriceProvider(): void {
  cached = null;
}

export function getFuelPriceProvider(): FuelPriceProvider {
  if (cached) return cached;

  const which = (process.env.FUEL_PRICE_PROVIDER ?? 'mock').toLowerCase();
  const ttlRaw = parseInt(process.env.FUEL_PRICE_CACHE_TTL ?? '', 10);
  const cacheTtlSec = Number.isFinite(ttlRaw) ? ttlRaw : 60;

  switch (which) {
    case 'csv':
    case 's3_csv': {
      const uri = process.env.FUEL_PRICE_CSV_URI;
      if (!uri) {
        throw new Error(`FUEL_PRICE_PROVIDER=${which} requires FUEL_PRICE_CSV_URI`);
      }
      cached = new CsvFuelPriceProvider({
        uri,
        cacheTtlSec,
        authorization: process.env.FUEL_PRICE_CSV_AUTH,
        region:        process.env.AWS_REGION,
      });
      return cached;
    }
    case 'api_fms':
    case 'api': {
      const url = process.env.FUEL_PRICE_API_URL;
      const tokenRef = process.env.FUEL_PRICE_API_TOKEN;
      if (!url || !tokenRef) {
        throw new Error('FUEL_PRICE_PROVIDER=api_fms requires FUEL_PRICE_API_URL and FUEL_PRICE_API_TOKEN');
      }
      const authMethodRaw = (process.env.FUEL_PRICE_API_AUTH_METHOD ?? 'bearer').toLowerCase();
      if (authMethodRaw !== 'bearer' && authMethodRaw !== 'basic' && authMethodRaw !== 'header') {
        throw new Error(`unknown FUEL_PRICE_API_AUTH_METHOD: ${authMethodRaw}`);
      }
      cached = new ApiFuelPriceProvider({
        url,
        authMethod:  authMethodRaw as AuthMethod,
        tokenRef,
        tokenHeader: process.env.FUEL_PRICE_API_TOKEN_HEADER,
        cacheTtlSec,
        region:      process.env.AWS_REGION,
      });
      return cached;
    }
    case 'mock':
    default:
      cached = new MockFuelPriceProvider();
      return cached;
  }
}
