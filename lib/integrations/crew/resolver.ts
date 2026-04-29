import type { CrewProvider } from './types';
import { MockCrewProvider } from './mock';
import { CsvCrewProvider } from './csv';
import { ApiCrewProvider, type AuthMethod, type ApiSource } from './api';

/**
 * Provider selection from env vars.
 *
 *   CREW_PROVIDER     = 'mock' (default) | 'csv' | 'api_sabre' | 'api_jeppesen' | 'api_aims'
 *
 * For `csv` (two URIs because real systems export roster + pairings separately):
 *   CREW_ROSTER_URI       = s3://… | file://… | https://…
 *   CREW_ASSIGNMENTS_URI  = s3://… | file://… | https://…
 *   CREW_CSV_AUTH         = 'Bearer …' | 'Basic …'    (optional, https only)
 *
 * For `api_*`:
 *   CREW_API_ROSTER_URL       = …/roster
 *   CREW_API_ASSIGNMENTS_URL  = …/pairings
 *   CREW_API_AUTH_METHOD      = 'bearer' (default) | 'basic' | 'header'
 *   CREW_API_TOKEN            = env://VAR | secretsmanager:arn:… | <verbatim>
 *   CREW_API_TOKEN_HEADER     = 'X-API-Key' (only when AUTH_METHOD=header)
 *
 * Common:
 *   CREW_CACHE_TTL    = 60 (optional, seconds)
 */

let cached: CrewProvider | null = null;

export function resetCrewProvider(): void {
  cached = null;
}

export function getCrewProvider(): CrewProvider {
  if (cached) return cached;

  const which = (process.env.CREW_PROVIDER ?? 'mock').toLowerCase();
  const ttlRaw = parseInt(process.env.CREW_CACHE_TTL ?? '', 10);
  const cacheTtlSec = Number.isFinite(ttlRaw) ? ttlRaw : 60;

  switch (which) {
    case 'csv':
    case 's3_csv': {
      const rosterUri = process.env.CREW_ROSTER_URI;
      const assignmentsUri = process.env.CREW_ASSIGNMENTS_URI;
      if (!rosterUri || !assignmentsUri) {
        throw new Error(`CREW_PROVIDER=${which} requires CREW_ROSTER_URI and CREW_ASSIGNMENTS_URI`);
      }
      cached = new CsvCrewProvider({
        rosterUri,
        assignmentsUri,
        cacheTtlSec,
        authorization: process.env.CREW_CSV_AUTH,
        region:        process.env.AWS_REGION,
      });
      return cached;
    }
    case 'api':
    case 'api_sabre':
    case 'api_jeppesen':
    case 'api_aims': {
      const rosterUrl      = process.env.CREW_API_ROSTER_URL;
      const assignmentsUrl = process.env.CREW_API_ASSIGNMENTS_URL;
      const tokenRef       = process.env.CREW_API_TOKEN;
      if (!rosterUrl || !assignmentsUrl || !tokenRef) {
        throw new Error('CREW_PROVIDER=api_* requires CREW_API_ROSTER_URL, CREW_API_ASSIGNMENTS_URL, CREW_API_TOKEN');
      }
      const authMethodRaw = (process.env.CREW_API_AUTH_METHOD ?? 'bearer').toLowerCase();
      if (authMethodRaw !== 'bearer' && authMethodRaw !== 'basic' && authMethodRaw !== 'header') {
        throw new Error(`unknown CREW_API_AUTH_METHOD: ${authMethodRaw}`);
      }
      const source: ApiSource | undefined =
        which === 'api_sabre'    ? 'api_sabre'    :
        which === 'api_jeppesen' ? 'api_jeppesen' :
        which === 'api_aims'     ? 'api_aims'     :
        undefined;
      cached = new ApiCrewProvider({
        rosterUrl,
        assignmentsUrl,
        authMethod:  authMethodRaw as AuthMethod,
        tokenRef,
        tokenHeader: process.env.CREW_API_TOKEN_HEADER,
        cacheTtlSec,
        region:      process.env.AWS_REGION,
        source,
      });
      return cached;
    }
    case 'mock':
    default:
      cached = new MockCrewProvider();
      return cached;
  }
}
