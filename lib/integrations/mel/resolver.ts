import type { MelProvider } from './types';
import { MockMelProvider } from './mock';
import { CsvMelProvider } from './csv';
import { ApiMelProvider, type AuthMethod, type ApiSource } from './api';

/**
 * Provider selection from env vars.
 *
 *   MEL_PROVIDER     = 'mock' (default) | 'csv' | 'api_amos' | 'api_trax' | 'api_camo'
 *
 * For `csv`:
 *   MEL_CSV_URI       = s3://… | file://… | https://…
 *   MEL_CSV_AUTH      = 'Bearer …' | 'Basic …'                (https only, optional)
 *
 * For `api_*`:
 *   MEL_API_URL          = full bulk endpoint URL
 *   MEL_API_AUTH_METHOD  = 'bearer' (default) | 'basic' | 'header'
 *   MEL_API_TOKEN        = env://VAR | secretsmanager:arn:… | <verbatim>
 *   MEL_API_TOKEN_HEADER = 'X-API-Key' (only when AUTH_METHOD=header)
 *
 * Common:
 *   MEL_CACHE_TTL    = 60 (optional, seconds)
 */

let cached: MelProvider | null = null;

export function resetMelProvider(): void {
  cached = null;
}

export function getMelProvider(): MelProvider {
  if (cached) return cached;

  const which = (process.env.MEL_PROVIDER ?? 'mock').toLowerCase();
  const ttlRaw = parseInt(process.env.MEL_CACHE_TTL ?? '', 10);
  const cacheTtlSec = Number.isFinite(ttlRaw) ? ttlRaw : 60;

  switch (which) {
    case 'csv':
    case 's3_csv': {
      const uri = process.env.MEL_CSV_URI;
      if (!uri) throw new Error(`MEL_PROVIDER=${which} requires MEL_CSV_URI`);
      cached = new CsvMelProvider({
        uri,
        cacheTtlSec,
        authorization: process.env.MEL_CSV_AUTH,
        region:        process.env.AWS_REGION,
      });
      return cached;
    }
    case 'api':
    case 'api_amos':
    case 'api_trax':
    case 'api_camo': {
      const url = process.env.MEL_API_URL;
      const tokenRef = process.env.MEL_API_TOKEN;
      if (!url || !tokenRef) {
        throw new Error('MEL_PROVIDER=api_* requires MEL_API_URL and MEL_API_TOKEN');
      }
      const authMethodRaw = (process.env.MEL_API_AUTH_METHOD ?? 'bearer').toLowerCase();
      if (authMethodRaw !== 'bearer' && authMethodRaw !== 'basic' && authMethodRaw !== 'header') {
        throw new Error(`unknown MEL_API_AUTH_METHOD: ${authMethodRaw}`);
      }
      const source: ApiSource | undefined =
        which === 'api_amos' ? 'api_amos' :
        which === 'api_trax' ? 'api_trax' :
        which === 'api_camo' ? 'api_camo' :
        undefined;
      cached = new ApiMelProvider({
        url,
        authMethod:  authMethodRaw as AuthMethod,
        tokenRef,
        tokenHeader: process.env.MEL_API_TOKEN_HEADER,
        cacheTtlSec,
        region:      process.env.AWS_REGION,
        source,
      });
      return cached;
    }
    case 'mock':
    default:
      cached = new MockMelProvider();
      return cached;
  }
}
