/**
 * FAA NOTAM client.
 *
 * The FAA NOTAM Search API requires a client_id / client_secret obtained
 * via the FAA developer portal — not unauthenticated like AviationWeather.
 * Until those creds exist in the env, we return a structured mock so the
 * downstream agent + UI don't crash. Same envelope either way.
 *
 * Docs: https://api.faa.gov/s/  (NOTAM Search API v1)
 *   GET https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=KJFK
 *   Headers: client_id, client_secret
 */

export interface NotamItem {
  number: string;
  classification: string;
  text: string;
  effectiveStart?: string;
  effectiveEnd?: string;
  location: string;
}

export interface NotamFetchResult {
  items: NotamItem[];
  source: 'faa-api' | 'mock';
}

const BASE = 'https://external-api.faa.gov/notamapi/v1';

export async function fetchNotams(icaoCodes: string[]): Promise<NotamFetchResult> {
  const clientId     = process.env.FAA_CLIENT_ID;
  const clientSecret = process.env.FAA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { items: mockNotams(icaoCodes), source: 'mock' };
  }

  const items: NotamItem[] = [];
  for (const icao of icaoCodes) {
    const url = `${BASE}/notams?icaoLocation=${encodeURIComponent(icao)}&pageSize=20`;
    const res = await fetch(url, {
      headers: { client_id: clientId, client_secret: clientSecret, Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) continue;
    const body = await res.json() as { items?: Array<{ properties?: { coreNOTAMData?: { notam?: NotamItem } } }> };
    for (const it of body.items ?? []) {
      const n = it.properties?.coreNOTAMData?.notam;
      if (n) items.push(n);
    }
  }
  return { items, source: 'faa-api' };
}

function mockNotams(icaoCodes: string[]): NotamItem[] {
  return icaoCodes.flatMap((icao) => [
    {
      number: `${icao}/A0${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`,
      classification: 'INTL',
      text: `RWY 09L/27R CLSD FOR MAINTENANCE 2200-0400Z DLY`,
      location: icao,
    },
    {
      number: `${icao}/A0${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`,
      classification: 'INTL',
      text: `TWY B BTN A4 AND A6 CLSD`,
      location: icao,
    },
  ]);
}
