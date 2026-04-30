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
