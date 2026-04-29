import type { CrewMember, CrewAssignment, CrewProvider } from './types';
import type { ProviderHealthResult } from '../types';
import { fetchText, type FetchOptions } from '../fetcher';
import { parseCsv, type CsvRow } from '../csv';
import { ttlCached, invalidate } from '../cache';

/**
 * Reads the crew roster + flight assignments from two separate CSVs.
 * Two URIs because real systems export them on different cadences (roster
 * weekly, assignments daily/hourly) and they typically come from
 * different modules.
 *
 * Roster CSV columns:
 *   id, name, role, base, type_ratings (comma-or-pipe separated),
 *   prior_fdp_min, prior_flight_time_min, rest_min_since_last_duty
 *   [optional] license_number, medical_expires_at, line_check_expires_at, status
 *
 * Assignments CSV columns:
 *   crew_id, flight
 */

export interface CsvProviderConfig {
  rosterUri: string;
  assignmentsUri: string;
  cacheTtlSec?: number;
  authorization?: string;
  region?: string;
}

function parseFloatSafe(s: string | undefined): number {
  if (s === undefined || s === '') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function rosterRow(r: CsvRow, source: 'csv' | 's3_csv'): CrewMember | null {
  const id = (r.id ?? '').trim();
  const name = (r.name ?? '').trim();
  const role = (r.role ?? '').trim().toUpperCase();
  if (!id || !name || (role !== 'CAP' && role !== 'FO')) return null;

  const typeRatings = (r.type_ratings ?? '')
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const status = ['active', 'sick', 'reserve', 'leave'].includes((r.status ?? '').toLowerCase())
    ? (r.status.toLowerCase() as CrewMember['status'])
    : undefined;

  return {
    id,
    name,
    role: role as 'CAP' | 'FO',
    base: (r.base ?? '').toUpperCase().trim(),
    typeRatings,
    priorFdpMin:          parseFloatSafe(r.prior_fdp_min),
    priorFlightTimeMin:   parseFloatSafe(r.prior_flight_time_min),
    restMinSinceLastDuty: parseFloatSafe(r.rest_min_since_last_duty),
    licenseNumber:        r.license_number || undefined,
    medicalExpiresAt:     r.medical_expires_at || undefined,
    lineCheckExpiresAt:   r.line_check_expires_at || undefined,
    status,
    source,
  };
}

function assignmentRow(r: CsvRow): CrewAssignment | null {
  const crewId = (r.crew_id ?? '').trim();
  const flight = (r.flight ?? '').trim();
  if (!crewId || !flight) return null;
  return { crewId, flight };
}

export class CsvCrewProvider implements CrewProvider {
  readonly name: 'csv' | 's3_csv';
  private readonly rosterKey: string;
  private readonly assignmentsKey: string;

  constructor(private readonly config: CsvProviderConfig) {
    this.name = config.rosterUri.startsWith('s3://') ? 's3_csv' : 'csv';
    this.rosterKey      = `crew:roster:${config.rosterUri}`;
    this.assignmentsKey = `crew:assignments:${config.assignmentsUri}`;
  }

  async getRoster(): Promise<CrewMember[]> {
    return ttlCached(this.rosterKey, this.config.cacheTtlSec ?? 60, async () => {
      const opts: FetchOptions = { authorization: this.config.authorization, region: this.config.region };
      const text = await fetchText(this.config.rosterUri, opts);
      const rows = parseCsv(text);
      const out: CrewMember[] = [];
      for (const r of rows) {
        const m = rosterRow(r, this.name);
        if (m) out.push(m);
      }
      return out;
    });
  }

  async getAssignments(): Promise<CrewAssignment[]> {
    return ttlCached(this.assignmentsKey, this.config.cacheTtlSec ?? 60, async () => {
      const opts: FetchOptions = { authorization: this.config.authorization, region: this.config.region };
      const text = await fetchText(this.config.assignmentsUri, opts);
      const rows = parseCsv(text);
      const out: CrewAssignment[] = [];
      for (const r of rows) {
        const a = assignmentRow(r);
        if (a) out.push(a);
      }
      return out;
    });
  }

  async refresh(): Promise<void> {
    invalidate(this.rosterKey);
    invalidate(this.assignmentsKey);
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
