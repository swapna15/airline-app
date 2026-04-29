import type { DeferredItem, MelProvider } from './types';
import type { ProviderHealthResult } from '../types';
import { fetchText, type FetchOptions } from '../fetcher';
import { parseCsv, type CsvRow } from '../csv';
import { ttlCached, invalidate } from '../cache';

/**
 * Reads MEL deferrals from a CSV at any URI scheme the fetcher supports.
 * Schema is the typical MIS export — extras tolerated, missing optional
 * columns OK.
 *
 * Required columns: tail, mel_id, deferred_at
 * Optional columns: description, due_at, airframe_hours_at_open,
 *                   airframe_cycles_at_open, parts_on_order,
 *                   placard_installed, released_by
 */

export interface CsvProviderConfig {
  uri: string;
  cacheTtlSec?: number;
  authorization?: string;
  region?: string;
}

function parseFloatSafe(s: string | undefined): number | undefined {
  if (s === undefined || s === '') return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolSafe(s: string | undefined): boolean | undefined {
  if (s === undefined || s === '') return undefined;
  const v = s.toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'n') return false;
  return undefined;
}

function rowToDeferral(r: CsvRow, source: 'csv' | 's3_csv', today: number): DeferredItem | null {
  const tail  = (r.tail ?? '').toUpperCase().trim();
  const melId = (r.mel_id ?? '').trim();
  const deferredAt = r.deferred_at ?? '';
  if (!tail || !melId || !deferredAt) return null;

  const deferredMs = new Date(deferredAt).getTime();
  if (!Number.isFinite(deferredMs)) return null;

  return {
    tail,
    melId,
    deferredAt,
    daysDeferred: Math.floor((today - deferredMs) / 86400 / 1000),
    description:           r.description || undefined,
    dueAt:                 r.due_at || undefined,
    airframeHoursAtOpen:   parseFloatSafe(r.airframe_hours_at_open),
    airframeCyclesAtOpen:  parseFloatSafe(r.airframe_cycles_at_open),
    partsOnOrder:          parseBoolSafe(r.parts_on_order),
    placardInstalled:      parseBoolSafe(r.placard_installed),
    releasedBy:            r.released_by || undefined,
    source,
  };
}

export class CsvMelProvider implements MelProvider {
  readonly name: 'csv' | 's3_csv';
  private readonly cacheKey: string;

  constructor(private readonly config: CsvProviderConfig) {
    this.name = config.uri.startsWith('s3://') ? 's3_csv' : 'csv';
    this.cacheKey = `mel:${config.uri}`;
  }

  private async loadAll(): Promise<DeferredItem[]> {
    return ttlCached(this.cacheKey, this.config.cacheTtlSec ?? 60, async () => {
      const opts: FetchOptions = { authorization: this.config.authorization, region: this.config.region };
      const text = await fetchText(this.config.uri, opts);
      const rows = parseCsv(text);
      const today = Date.now();
      const out: DeferredItem[] = [];
      for (const r of rows) {
        const d = rowToDeferral(r, this.name, today);
        if (d) out.push(d);
      }
      return out;
    });
  }

  async getDeferredItems(tail: string): Promise<DeferredItem[]> {
    const all = await this.loadAll();
    const t = tail.toUpperCase();
    return all.filter((d) => d.tail === t);
  }

  async listAllDeferrals(): Promise<DeferredItem[]> {
    return this.loadAll();
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
        recordCount: all.length,
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
