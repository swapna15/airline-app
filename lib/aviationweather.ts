/**
 * Client for aviationweather.gov data API.
 * No auth required; rate-limited but generous for our volume.
 * Docs: https://aviationweather.gov/data/api/
 */

const BASE = 'https://aviationweather.gov/api/data';

export interface MetarReport {
  icaoId: string;
  rawOb: string;
  reportTime: string;
  temp?: number;
  dewp?: number;
  wdir?: number;
  wspd?: number;
  visib?: string | number;
  altim?: number;
  fltCat?: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
}

export interface TafReport {
  icaoId: string;
  rawTAF: string;
  issueTime: string;
  validTimeFrom?: string;
  validTimeTo?: string;
}

export interface SigmetReport {
  airSigmetType?: string;
  hazard?: string;     // 'TURB' | 'ICE' | 'IFR' | 'MTN' | 'VA' | 'TS' | …
  rawSigmet?: string;
  validTimeFrom?: string;
  validTimeTo?: string;
  /** Issuing FIR / area control center, e.g. 'KZNY', 'EGTT'. */
  firId?: string;
  /** Altitude range in hundreds of feet (FL). */
  minFL?: number;
  maxFL?: number;
  /** Polygon vertices the AviationWeather isigmet API returns under `coords`.
   *  Each point is `{ lat, lon }` in degrees; first/last are the same vertex. */
  coords?: Array<{ lat: number; lon: number }>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // Cache 60s — METAR refreshes hourly, TAF every 6h. 60s avoids hammering during dev.
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`aviationweather ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** Fetch most recent METAR for one or more ICAO codes. */
export async function fetchMetars(icaoIds: string[]): Promise<MetarReport[]> {
  const ids = icaoIds.join(',');
  const url = `${BASE}/metar?ids=${encodeURIComponent(ids)}&format=json&hours=2`;
  return getJson<MetarReport[]>(url);
}

/** Fetch current TAF for one or more ICAO codes. */
export async function fetchTafs(icaoIds: string[]): Promise<TafReport[]> {
  const ids = icaoIds.join(',');
  const url = `${BASE}/taf?ids=${encodeURIComponent(ids)}&format=json`;
  return getJson<TafReport[]>(url);
}

/**
 * International SIGMETs along the route. We pull the global feed and let
 * the agent summarize relevance — proper polygon-vs-route filtering is a
 * Phase C enhancement.
 */
export async function fetchSigmets(): Promise<SigmetReport[]> {
  const url = `${BASE}/isigmet?format=json`;
  return getJson<SigmetReport[]>(url);
}

/**
 * Coarse METAR ceiling/vis extraction for the OpsSpec C055 alternate-minima
 * check. Real dispatch uses a TAF parser windowed at ETA ±1hr; this is a
 * first-pass that lets the divert advisor compare current conditions against
 * a numeric ceiling/vis floor instead of just bucketing by fltCat.
 *
 *   ceilingFt = lowest BKN/OVC layer in the raw METAR (null = no ceiling)
 *   visSm     = visib field if numeric, else parsed from raw ("P6SM",
 *               "10SM", "1 1/2SM", "1/2SM", or 4-digit meters)
 */
export interface MetarMinimaParsed {
  ceilingFt: number | null;
  visSm: number | null;
}

export function parseMetarMinima(report: MetarReport): MetarMinimaParsed {
  return {
    ceilingFt: parseCeilingFt(report.rawOb),
    visSm:     parseVisSm(report.rawOb, report.visib),
  };
}

function parseCeilingFt(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(?:BKN|OVC)(\d{3})/g);
  if (!m) return null;
  return Math.min(...m.map((t) => parseInt(t.slice(3), 10))) * 100;
}

function parseVisSm(raw: string | undefined, visib: string | number | undefined): number | null {
  if (typeof visib === 'number') return visib;
  if (typeof visib === 'string') {
    const parsed = parseVisToken(visib);
    if (parsed !== null) return parsed;
  }
  if (raw) {
    // Fallback — find a vis token in the raw observation.
    const m = raw.match(/\b(P?\d+(?:\s+\d+\/\d+)?|P?\d+\/\d+)SM\b/);
    if (m) return parseVisToken(m[1] + 'SM');
    // ICAO meters: a 4-digit token between wind and weather, e.g. "9999" or "1500".
    const meters = raw.match(/\s(\d{4})\s/);
    if (meters) return parseInt(meters[1], 10) / 1609;
  }
  return null;
}

function parseVisToken(input: string): number | null {
  const v = input.trim().toUpperCase();
  // "P6SM" or "10+" — at-or-above the number
  if (v.startsWith('P') || v.endsWith('+')) {
    const num = v.replace(/[^\d.]/g, '');
    return num ? parseFloat(num) : null;
  }
  // "1 1/2SM"
  const mixed = v.match(/^(\d+)\s+(\d+)\/(\d+)SM$/);
  if (mixed) return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
  // "1/2SM"
  const frac = v.match(/^(\d+)\/(\d+)SM$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  // "10SM", "10.5SM"
  const direct = v.match(/^([\d.]+)SM$/);
  if (direct) return parseFloat(direct[1]);
  // bare number — treated as SM
  const bare = v.match(/^([\d.]+)$/);
  if (bare) return parseFloat(bare[1]);
  return null;
}
