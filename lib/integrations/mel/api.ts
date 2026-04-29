import type { DeferredItem, MelProvider } from './types';
import type { ProviderHealthResult } from '../types';
import { resolveSecret } from '../secrets';
import { ttlCached, invalidate } from '../cache';

/**
 * Reads MEL deferrals from a REST endpoint with token auth (AMOS, TRAX, or
 * a CAMO middleware that fronts them). Same auth + caching shape as the
 * fuel-price API provider — see `lib/integrations/fuelprices/api.ts`.
 *
 * Bulk endpoint: returns all open deferrals across the fleet. Per-tail
 * filtering happens client-side after the cached load.
 */

export type AuthMethod = 'bearer' | 'basic' | 'header';
export type ApiSource = 'api_amos' | 'api_trax' | 'api_camo';

export interface ApiProviderConfig {
  url: string;
  authMethod: AuthMethod;
  tokenRef: string;
  tokenHeader?: string;
  headers?: Record<string, string>;
  cacheTtlSec?: number;
  region?: string;
  /** Provenance tag for the records this provider produces. */
  source?: ApiSource;
}

interface ApiRecord {
  tail?: string;
  melId?: string;       mel_id?: string;
  deferredAt?: string;  deferred_at?: string;
  description?: string;
  dueAt?: string;       due_at?: string;
  airframeHoursAtOpen?: number;  airframe_hours_at_open?: number;
  airframeCyclesAtOpen?: number; airframe_cycles_at_open?: number;
  partsOnOrder?: boolean;        parts_on_order?: boolean;
  placardInstalled?: boolean;    placard_installed?: boolean;
  releasedBy?: string;           released_by?: string;
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

function bool(...candidates: unknown[]): boolean | undefined {
  for (const c of candidates) {
    if (typeof c === 'boolean') return c;
  }
  return undefined;
}

function str(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c !== '') return c;
  }
  return undefined;
}

function recordToDeferral(r: ApiRecord, source: ApiSource, today: number): DeferredItem | null {
  const tail = (r.tail ?? '').toUpperCase().trim();
  const melId = str(r.melId, r.mel_id);
  const deferredAt = str(r.deferredAt, r.deferred_at);
  if (!tail || !melId || !deferredAt) return null;

  const deferredMs = new Date(deferredAt).getTime();
  if (!Number.isFinite(deferredMs)) return null;

  return {
    tail,
    melId,
    deferredAt,
    daysDeferred:         Math.floor((today - deferredMs) / 86400 / 1000),
    description:          str(r.description),
    dueAt:                str(r.dueAt, r.due_at),
    airframeHoursAtOpen:  num(r.airframeHoursAtOpen, r.airframe_hours_at_open),
    airframeCyclesAtOpen: num(r.airframeCyclesAtOpen, r.airframe_cycles_at_open),
    partsOnOrder:         bool(r.partsOnOrder, r.parts_on_order),
    placardInstalled:     bool(r.placardInstalled, r.placard_installed),
    releasedBy:           str(r.releasedBy, r.released_by),
    source,
  };
}

function unwrapArray(payload: unknown): ApiRecord[] {
  if (Array.isArray(payload)) return payload as ApiRecord[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['data', 'results', 'deferrals', 'items']) {
      if (Array.isArray(o[k])) return o[k] as ApiRecord[];
    }
  }
  throw new Error('expected an array or {data|results|deferrals|items: [...]} envelope');
}

export class ApiMelProvider implements MelProvider {
  readonly name: ApiSource;
  private readonly cacheKey: string;
  private readonly tokenCacheKey: string;

  constructor(private readonly config: ApiProviderConfig) {
    this.name = config.source ?? 'api_amos';
    this.cacheKey = `mel:api:${config.url}`;
    this.tokenCacheKey = `mel:api:${config.url}:token`;
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

  private async loadAll(): Promise<DeferredItem[]> {
    return ttlCached(this.cacheKey, this.config.cacheTtlSec ?? 60, async () => {
      const headers = await this.authHeaders();
      const res = await fetch(this.config.url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${this.config.url}`);
      const payload = await res.json();
      const records = unwrapArray(payload);
      const today = Date.now();
      const out: DeferredItem[] = [];
      for (const r of records) {
        const d = recordToDeferral(r, this.name, today);
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
    invalidate(this.tokenCacheKey);
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
