import type { FuelPrice, FuelPriceProvider } from './types';
import type { ProviderHealthResult } from '../types';
import { resolveSecret } from '../secrets';
import { ttlCached, invalidate } from '../cache';
import { fuelPriceSchema } from '@shared/schema/fuel-price';

/**
 * Reads jet-fuel prices from a REST endpoint with token auth.
 *
 * Auth methods:
 *   bearer   — `Authorization: Bearer <token>`         (JWT or static)
 *   basic    — `Authorization: Basic <token>`           (caller already base64'd)
 *   header   — `<headerName>: <token>`                  (e.g. X-API-Key)
 *
 * The token is resolved via `lib/integrations/secrets.ts`, so it can be:
 *   env://FMS_TOKEN
 *   secretsmanager:arn:aws:secretsmanager:us-east-1:123:secret:fms-prod-Ab12Cd
 *   eyJhbGciOi...                                       (verbatim, not recommended)
 *
 * Response shape: a JSON array of records matching the FMS schema, OR an
 * object enveloping the array under `data` / `results` / `prices`. Each
 * record is mapped to `FuelPrice` — extra fields are ignored.
 */

export type AuthMethod = 'bearer' | 'basic' | 'header';

export interface ApiProviderConfig {
  /** Bulk endpoint that returns all stations. */
  url: string;
  authMethod: AuthMethod;
  /** Secret reference (env://, secretsmanager:, or verbatim). */
  tokenRef: string;
  /** Header name when authMethod=header. Default `X-API-Key`. */
  tokenHeader?: string;
  /** Extra static headers to send with every request. */
  headers?: Record<string, string>;
  /** TTL for the parsed records and the resolved token. Default 60s. */
  cacheTtlSec?: number;
  /** Override AWS region for `secretsmanager:` token refs. */
  region?: string;
}

interface ApiRecord {
  icao?: string;
  totalPerUSG?: number;
  total_usd_usg?: number; // tolerate snake_case (matches the CSV schema)
  currency?: string;
  components?: { base: number; differential: number; intoPlane: number; tax: number };
  base_usd_usg?: number; diff_usd_usg?: number; into_plane_usd_usg?: number; tax_usd_usg?: number;
  totalLocal?: number;   total_local?: number;
  supplier?: string;
  contractRef?: string;  contract_ref?: string;
  asOf?: string;         as_of_utc?: string;
  validUntil?: string;   valid_until_utc?: string;
}

function num(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
    if (typeof c === 'string' && c !== '') {
      const n = parseFloat(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function str(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c !== '') return c;
  }
  return undefined;
}

function recordToFuelPrice(r: ApiRecord): FuelPrice | null {
  const icao = (r.icao ?? '').toUpperCase().trim();
  const total = num(r.totalPerUSG, r.total_usd_usg);
  const asOf  = str(r.asOf, r.as_of_utc);
  if (!icao || total === undefined || !asOf) return null;

  let components = r.components;
  if (!components) {
    const base = num(r.base_usd_usg);
    const diff = num(r.diff_usd_usg);
    const intoPlane = num(r.into_plane_usd_usg);
    const tax = num(r.tax_usd_usg);
    if (base !== undefined && diff !== undefined && intoPlane !== undefined && tax !== undefined) {
      components = { base, differential: diff, intoPlane, tax };
    }
  }

  return {
    icao,
    totalPerUSG: total,
    currency:    r.currency ?? 'USD',
    components,
    totalLocal:  num(r.totalLocal, r.total_local),
    supplier:    str(r.supplier),
    contractRef: str(r.contractRef, r.contract_ref),
    asOf,
    validUntil:  str(r.validUntil, r.valid_until_utc),
    source:      'api_fms',
  };
}

function unwrapArray(payload: unknown): ApiRecord[] {
  if (Array.isArray(payload)) return payload as ApiRecord[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['data', 'results', 'prices', 'items']) {
      if (Array.isArray(o[k])) return o[k] as ApiRecord[];
    }
  }
  throw new Error('expected an array or {data|results|prices|items: [...]} envelope');
}

export class ApiFuelPriceProvider implements FuelPriceProvider {
  readonly name = 'api_fms';
  private readonly cacheKey: string;
  private readonly tokenCacheKey: string;

  constructor(private readonly config: ApiProviderConfig) {
    this.cacheKey = `fuelprices:api:${config.url}`;
    this.tokenCacheKey = `fuelprices:api:${config.url}:token`;
  }

  private async resolveTokenCached(): Promise<string> {
    return ttlCached(this.tokenCacheKey, this.config.cacheTtlSec ?? 60, () =>
      resolveSecret(this.config.tokenRef, this.config.region),
    );
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.resolveTokenCached();
    const extra = { ...(this.config.headers ?? {}) };
    switch (this.config.authMethod) {
      case 'bearer': return { ...extra, Authorization: `Bearer ${token}` };
      case 'basic':  return { ...extra, Authorization: `Basic ${token}` };
      case 'header': return { ...extra, [this.config.tokenHeader ?? 'X-API-Key']: token };
    }
  }

  private async loadAll(): Promise<Map<string, FuelPrice>> {
    return ttlCached(this.cacheKey, this.config.cacheTtlSec ?? 60, async () => {
      const headers = await this.authHeaders();
      const res = await fetch(this.config.url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${this.config.url}`);
      const payload = await res.json();
      const records = unwrapArray(payload);
      const out = new Map<string, FuelPrice>();
      let dropped = 0;
      for (const r of records) {
        const mapped = recordToFuelPrice(r);
        if (!mapped) { dropped++; continue; }
        // Validate the canonical-shape record. Anything that fails the schema
        // is logged and dropped — fail-soft so one bad row from a feed can't
        // take the whole load down. The error includes which fields failed.
        const parsed = fuelPriceSchema.safeParse(mapped);
        if (!parsed.success) {
          console.warn(
            `[fuel-price api] dropping invalid record for ${mapped.icao}:`,
            parsed.error.flatten().fieldErrors,
          );
          dropped++;
          continue;
        }
        out.set(parsed.data.icao, parsed.data);
      }
      if (dropped > 0) {
        console.warn(`[fuel-price api] dropped ${dropped} of ${records.length} records as invalid`);
      }
      return out;
    });
  }

  async getFuelPrice(icao: string): Promise<FuelPrice | undefined> {
    const all = await this.loadAll();
    return all.get(icao.toUpperCase());
  }

  async listFuelPrices(): Promise<FuelPrice[]> {
    const all = await this.loadAll();
    return Array.from(all.values()).sort((a, b) => a.icao.localeCompare(b.icao));
  }

  async refresh(): Promise<void> {
    invalidate(this.cacheKey);
    invalidate(this.tokenCacheKey);
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const startedAt = Date.now();
    try {
      const all = await this.loadAll();
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        recordCount: all.size,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
