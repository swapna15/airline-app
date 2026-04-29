import type { FuelPrice, FuelPriceProvider } from './types';
import type { ProviderHealthResult } from '../types';
import { fetchText, type FetchOptions } from '../fetcher';
import { parseCsv, type CsvRow } from '../csv';
import { ttlCached, invalidate } from '../cache';

/**
 * Reads jet-fuel prices from a CSV at any URI scheme the fetcher supports
 * (s3://, file://, https://). Schema is the FMS-style export used by most
 * airlines; missing optional columns are tolerated.
 *
 * Required columns: icao, total_usd_usg, as_of_utc
 * Optional columns: iata, supplier, jet_type, base_usd_usg, diff_usd_usg,
 *                   into_plane_usd_usg, tax_usd_usg, currency_local,
 *                   total_local, valid_until_utc, contract_ref
 */

export interface CsvProviderConfig {
  uri: string;
  /** TTL for the parsed rows. Default 60s — fuel CSVs typically refresh hourly/daily. */
  cacheTtlSec?: number;
  /** Optional auth (mostly for https:// internal endpoints). */
  authorization?: string;
  /** Override AWS region for s3:// URIs. */
  region?: string;
}

function parseFloatSafe(s: string | undefined): number | undefined {
  if (s === undefined || s === '') return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function rowToFuelPrice(r: CsvRow, source: 'csv' | 's3_csv'): FuelPrice | null {
  const icao = (r.icao ?? '').toUpperCase().trim();
  const total = parseFloatSafe(r.total_usd_usg);
  const asOf = r.as_of_utc ?? r.as_of ?? '';
  if (!icao || total === undefined || !asOf) return null;

  const base       = parseFloatSafe(r.base_usd_usg);
  const diff       = parseFloatSafe(r.diff_usd_usg);
  const intoPlane  = parseFloatSafe(r.into_plane_usd_usg);
  const tax        = parseFloatSafe(r.tax_usd_usg);
  const components = (base !== undefined && diff !== undefined && intoPlane !== undefined && tax !== undefined)
    ? { base, differential: diff, intoPlane, tax }
    : undefined;

  return {
    icao,
    totalPerUSG: total,
    currency:    'USD',
    components,
    totalLocal:  parseFloatSafe(r.total_local),
    supplier:    r.supplier || undefined,
    contractRef: r.contract_ref || undefined,
    asOf,
    validUntil:  r.valid_until_utc || undefined,
    source,
  };
}

export class CsvFuelPriceProvider implements FuelPriceProvider {
  readonly name: 'csv' | 's3_csv';
  private readonly cacheKey: string;

  constructor(private readonly config: CsvProviderConfig) {
    this.name = config.uri.startsWith('s3://') ? 's3_csv' : 'csv';
    this.cacheKey = `fuelprices:${config.uri}`;
  }

  private async loadAll(): Promise<Map<string, FuelPrice>> {
    return ttlCached(this.cacheKey, this.config.cacheTtlSec ?? 60, async () => {
      const opts: FetchOptions = { authorization: this.config.authorization, region: this.config.region };
      const text = await fetchText(this.config.uri, opts);
      const rows = parseCsv(text);
      const out = new Map<string, FuelPrice>();
      for (const r of rows) {
        const fp = rowToFuelPrice(r, this.name);
        if (fp) out.set(fp.icao, fp);
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
