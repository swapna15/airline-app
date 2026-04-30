import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';
import { fetchNotams } from '@/lib/notams';
import { classifyAll, type ClassifiedNotam } from '@/lib/notam-classifier';
import { lookupAirport } from '@/lib/icao';
import type { OwnFlight } from '@shared/schema/flight';

export const maxDuration = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface AirportSummary {
  icao: string;
  iata: string;
  flights: string[];      // flight numbers ('BA1000') that touch this airport
  notams: ClassifiedNotam[];
}

export interface NotamBoardResponse {
  generatedAt: string;
  source: 'faa-api' | 'mock';
  airports: AirportSummary[];
  totals: {
    notams: number;
    critical: number;
    warn: number;
    info: number;
  };
}

async function loadFlights(req: NextRequest): Promise<OwnFlight[]> {
  // Forward to /api/flights/own which knows whether to hit the deployed
  // Lambda or fall back to local mocks. Keeps the rotation source in one
  // place rather than re-implementing the logic here.
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('host') ?? 'localhost:3000';
  const cookie = req.headers.get('cookie') ?? '';
  const res = await fetch(`${proto}://${host}/api/flights/own`, {
    headers: { cookie },
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { flights?: OwnFlight[] };
  return j.flights ?? [];
}

export async function GET(req: NextRequest) {
  // Require auth so anonymous viewers can't burn FAA quota.
  if (API_URL) {
    const token = await getApiBearer(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const flights = await loadFlights(req);

  // Collect every origin + destination airport touched today, mapped to the
  // flights that fly there. Need ICAO for the FAA call.
  const byIcao = new Map<string, AirportSummary>();
  for (const f of flights) {
    for (const code of [f.origin, f.destination]) {
      const a = lookupAirport(code);
      if (!a) continue;
      const cur = byIcao.get(a.icao) ?? { icao: a.icao, iata: a.iata, flights: [], notams: [] };
      const flightNo = `${f.carrier}${f.flightNumber}`;
      if (!cur.flights.includes(flightNo)) cur.flights.push(flightNo);
      byIcao.set(a.icao, cur);
    }
  }

  if (byIcao.size === 0) {
    const empty: NotamBoardResponse = {
      generatedAt: new Date().toISOString(),
      source: 'mock',
      airports: [],
      totals: { notams: 0, critical: 0, warn: 0, info: 0 },
    };
    return NextResponse.json(empty);
  }

  const icaos = Array.from(byIcao.keys());
  const { items, source } = await fetchNotams(icaos);
  const classified = classifyAll(items);
  for (const n of classified) {
    const summary = byIcao.get(n.location);
    if (summary) summary.notams.push(n);
  }

  // Per-airport: sort runway > taxiway > navaid > airspace > procedure > other,
  // then by severity within each category.
  const ORDER: Record<ClassifiedNotam['category'], number> = {
    runway: 0, taxiway: 1, navaid: 2, airspace: 3, procedure: 4, other: 5,
  };
  const SEV: Record<ClassifiedNotam['severity'], number> = { critical: 0, warn: 1, info: 2 };
  const airports = Array.from(byIcao.values()).sort((a, b) => a.icao.localeCompare(b.icao));
  for (const a of airports) {
    a.notams.sort(
      (x: ClassifiedNotam, y: ClassifiedNotam) =>
        ORDER[x.category] - ORDER[y.category] || SEV[x.severity] - SEV[y.severity],
    );
  }

  let critical = 0, warn = 0, info = 0;
  for (const a of airports) for (const n of a.notams) {
    if (n.severity === 'critical') critical++;
    else if (n.severity === 'warn') warn++;
    else info++;
  }

  const body: NotamBoardResponse = {
    generatedAt: new Date().toISOString(),
    source,
    airports,
    totals: { notams: critical + warn + info, critical, warn, info },
  };
  return NextResponse.json(body);
}
