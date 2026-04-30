import { NextRequest, NextResponse } from 'next/server';
import { getFuelPrice, type FuelPrice } from '@/lib/fuelprices';
import { lookupAirport } from '@/lib/icao';
import { fuelEstimate } from '@/lib/perf';
import type { OwnFlight } from '@shared/schema/flight';

export const maxDuration = 30;

const KG_PER_USG = 3.05;       // jet-A, approximate
const TANKER_BURN_PENALTY = 0.035; // 3.5% extra burn per hour of carry-time

export interface AirportPrice {
  icao: string;
  iata: string;
  price?: FuelPrice;
  /** % above fleet-wide avg. Negative if below. */
  vsAvgPct?: number;
  /** 'red' (>30% above), 'amber' (>15%), undefined otherwise. */
  flag?: 'amber' | 'red';
}

export interface TankeringOpportunity {
  flight: string;        // 'BA1000'
  origin: string;        // IATA
  destination: string;
  originPriceUSG: number;
  destPriceUSG: number;
  /** Net savings in USD assuming we tanker the trip fuel from origin. */
  savingsUSD: number;
  tripFuelUSG: number;
  blockTimeHours: number;
}

export interface FuelDashboardResponse {
  generatedAt: string;
  source: FuelPrice['source'] | 'mixed' | 'mock';
  fleetAvgUSG?: number;
  airports: AirportPrice[];
  tankering: TankeringOpportunity[];
}

async function loadFlights(req: NextRequest): Promise<OwnFlight[]> {
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host  = req.headers.get('host') ?? 'localhost:3000';
  const cookie = req.headers.get('cookie') ?? '';
  const res = await fetch(`${proto}://${host}/api/flights/own`, { headers: { cookie } });
  if (!res.ok) return [];
  const j = (await res.json()) as { flights?: OwnFlight[] };
  return j.flights ?? [];
}

export async function GET(req: NextRequest) {
  const flights = await loadFlights(req);

  // Unique airports + their IATA mapping.
  const byIcao = new Map<string, { icao: string; iata: string }>();
  for (const f of flights) {
    for (const code of [f.origin, f.destination]) {
      const a = lookupAirport(code);
      if (a) byIcao.set(a.icao, { icao: a.icao, iata: a.iata });
    }
  }

  const airports: AirportPrice[] = await Promise.all(
    Array.from(byIcao.values()).map(async ({ icao, iata }) => {
      const price = await getFuelPrice(icao);
      return { icao, iata, price };
    }),
  );

  const prices = airports.map((a) => a.price?.totalPerUSG).filter((p): p is number => p !== undefined);
  const fleetAvgUSG = prices.length > 0
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : undefined;

  // Per-airport flagging vs. avg
  if (fleetAvgUSG !== undefined) {
    for (const a of airports) {
      if (!a.price) continue;
      const pct = ((a.price.totalPerUSG - fleetAvgUSG) / fleetAvgUSG) * 100;
      a.vsAvgPct = Math.round(pct * 10) / 10;
      if      (pct > 30) a.flag = 'red';
      else if (pct > 15) a.flag = 'amber';
    }
  }

  // Tankering opportunities — one per flight where origin is cheaper than dest
  const tankering: TankeringOpportunity[] = [];
  for (const f of flights) {
    const o = lookupAirport(f.origin);
    const d = lookupAirport(f.destination);
    if (!o || !d) continue;

    const oPrice = airports.find((a) => a.icao === o.icao)?.price?.totalPerUSG;
    const dPrice = airports.find((a) => a.icao === d.icao)?.price?.totalPerUSG;
    if (oPrice === undefined || dPrice === undefined) continue;
    if (oPrice >= dPrice) continue;  // not a tankering opportunity

    const fe = fuelEstimate(o, d, f.aircraftType ?? f.aircraftIcao ?? '');
    const tripFuelUSG = fe.trip / KG_PER_USG;
    const blockTimeHours = fe.blockTimeMin / 60;

    // Net savings: buy at origin (cheap) instead of dest (expensive), but
    // pay a burn penalty of 3.5% per hour of carry-time on the carried fuel.
    const grossSavings = tripFuelUSG * (dPrice - oPrice);
    const carryPenaltyUSG = tripFuelUSG * TANKER_BURN_PENALTY * blockTimeHours;
    const carryPenaltyUSD = carryPenaltyUSG * dPrice;
    const savingsUSD = grossSavings - carryPenaltyUSD;

    if (savingsUSD <= 0) continue;
    tankering.push({
      flight: `${f.carrier}${f.flightNumber}`,
      origin: o.iata,
      destination: d.iata,
      originPriceUSG: oPrice,
      destPriceUSG: dPrice,
      savingsUSD: Math.round(savingsUSD),
      tripFuelUSG: Math.round(tripFuelUSG),
      blockTimeHours: Math.round(blockTimeHours * 10) / 10,
    });
  }
  tankering.sort((a, b) => b.savingsUSD - a.savingsUSD);

  airports.sort((a, b) => a.icao.localeCompare(b.icao));

  // Source — if every priced airport has the same source, use it; else 'mixed'.
  const sources = new Set(airports.map((a) => a.price?.source).filter(Boolean));
  const source: FuelDashboardResponse['source'] =
    sources.size === 1 ? (Array.from(sources)[0] as FuelPrice['source']) : 'mixed';

  const body: FuelDashboardResponse = {
    generatedAt: new Date().toISOString(),
    source,
    fleetAvgUSG: fleetAvgUSG !== undefined ? Math.round(fleetAvgUSG * 1000) / 1000 : undefined,
    airports,
    tankering,
  };
  return NextResponse.json(body);
}
