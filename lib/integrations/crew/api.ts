import type { CrewMember, CrewAssignment, CrewProvider } from './types';
import type { ProviderHealthResult } from '../types';
import { resolveSecret } from '../secrets';
import { ttlCached, invalidate } from '../cache';

/**
 * Reads roster + assignments from a REST endpoint with token auth (Sabre,
 * Jeppesen Crew Manager, AIMS, or a CAMO middleware that fronts them).
 *
 * Two endpoints because real systems separate concerns: the roster module
 * is master data, the pairing module is operational. Same auth applies to
 * both. Each is cached independently so a roster refresh doesn't invalidate
 * the assignment cache.
 */

export type AuthMethod = 'bearer' | 'basic' | 'header';
export type ApiSource = 'api_sabre' | 'api_jeppesen' | 'api_aims';

export interface ApiProviderConfig {
  rosterUrl: string;
  assignmentsUrl: string;
  authMethod: AuthMethod;
  tokenRef: string;
  tokenHeader?: string;
  headers?: Record<string, string>;
  cacheTtlSec?: number;
  region?: string;
  source?: ApiSource;
}

interface ApiRosterRecord {
  id?: string;
  name?: string;
  role?: string;
  base?: string;
  typeRatings?: string[];        type_ratings?: string[] | string;
  priorFdpMin?: number;          prior_fdp_min?: number;
  priorFlightTimeMin?: number;   prior_flight_time_min?: number;
  restMinSinceLastDuty?: number; rest_min_since_last_duty?: number;
  licenseNumber?: string;        license_number?: string;
  medicalExpiresAt?: string;     medical_expires_at?: string;
  lineCheckExpiresAt?: string;   line_check_expires_at?: string;
  status?: string;
}

interface ApiAssignmentRecord {
  crewId?: string; crew_id?: string;
  flight?: string;
}

function num(...candidates: unknown[]): number {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
    if (typeof c === 'string' && c !== '') {
      const n = parseFloat(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function str(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c !== '') return c;
  }
  return undefined;
}

function ratings(r: ApiRosterRecord): string[] {
  if (Array.isArray(r.typeRatings)) return r.typeRatings;
  if (Array.isArray(r.type_ratings)) return r.type_ratings;
  if (typeof r.type_ratings === 'string') return r.type_ratings.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function unwrap<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of keys) if (Array.isArray(o[k])) return o[k] as T[];
  }
  throw new Error(`expected array or {${keys.join('|')}: [...]} envelope`);
}

function rosterToCrew(r: ApiRosterRecord, source: ApiSource): CrewMember | null {
  const id = str(r.id);
  const name = str(r.name);
  const role = (str(r.role) ?? '').toUpperCase();
  if (!id || !name || (role !== 'CAP' && role !== 'FO')) return null;
  const status = ['active', 'sick', 'reserve', 'leave'].includes((r.status ?? '').toLowerCase())
    ? (r.status!.toLowerCase() as CrewMember['status'])
    : undefined;
  return {
    id,
    name,
    role: role as 'CAP' | 'FO',
    base: (str(r.base) ?? '').toUpperCase(),
    typeRatings:          ratings(r),
    priorFdpMin:          num(r.priorFdpMin, r.prior_fdp_min),
    priorFlightTimeMin:   num(r.priorFlightTimeMin, r.prior_flight_time_min),
    restMinSinceLastDuty: num(r.restMinSinceLastDuty, r.rest_min_since_last_duty),
    licenseNumber:        str(r.licenseNumber, r.license_number),
    medicalExpiresAt:     str(r.medicalExpiresAt, r.medical_expires_at),
    lineCheckExpiresAt:   str(r.lineCheckExpiresAt, r.line_check_expires_at),
    status,
    source,
  };
}

export class ApiCrewProvider implements CrewProvider {
  readonly name: ApiSource;
  private readonly rosterKey: string;
  private readonly assignmentsKey: string;
  private readonly tokenKey: string;

  constructor(private readonly config: ApiProviderConfig) {
    this.name = config.source ?? 'api_sabre';
    this.rosterKey      = `crew:api:roster:${config.rosterUrl}`;
    this.assignmentsKey = `crew:api:assign:${config.assignmentsUrl}`;
    this.tokenKey       = `crew:api:token:${config.rosterUrl}`;
  }

  private async resolveTokenCached(): Promise<string> {
    return ttlCached(this.tokenKey, this.config.cacheTtlSec ?? 60, () =>
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

  async getRoster(): Promise<CrewMember[]> {
    return ttlCached(this.rosterKey, this.config.cacheTtlSec ?? 60, async () => {
      const headers = await this.authHeaders();
      const res = await fetch(this.config.rosterUrl, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${this.config.rosterUrl}`);
      const records = unwrap<ApiRosterRecord>(await res.json(), ['data', 'results', 'roster', 'items']);
      const out: CrewMember[] = [];
      for (const r of records) {
        const m = rosterToCrew(r, this.name);
        if (m) out.push(m);
      }
      return out;
    });
  }

  async getAssignments(): Promise<CrewAssignment[]> {
    return ttlCached(this.assignmentsKey, this.config.cacheTtlSec ?? 60, async () => {
      const headers = await this.authHeaders();
      const res = await fetch(this.config.assignmentsUrl, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${this.config.assignmentsUrl}`);
      const records = unwrap<ApiAssignmentRecord>(await res.json(), ['data', 'results', 'assignments', 'items']);
      const out: CrewAssignment[] = [];
      for (const r of records) {
        const crewId = str(r.crewId, r.crew_id);
        const flight = str(r.flight);
        if (crewId && flight) out.push({ crewId, flight });
      }
      return out;
    });
  }

  async refresh(): Promise<void> {
    invalidate(this.rosterKey);
    invalidate(this.assignmentsKey);
    invalidate(this.tokenKey);
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const startedAt = Date.now();
    try {
      const [r, a] = await Promise.all([this.getRoster(), this.getAssignments()]);
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        recordCount: r.length + a.length,
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
