import { NextRequest, NextResponse } from 'next/server';
import { lookupAirport, type AirportRef } from '@/lib/icao';
import { findCandidatesWithin, greatCircleNM } from '@/lib/perf';
import { fetchMetars } from '@/lib/aviationweather';
import type { MetarReport } from '@/lib/aviationweather';

type DivertReason = 'medical' | 'mechanical' | 'weather' | 'fuel';

interface DivertRequest {
  flight: string;
  origin: string;
  destination: string;
  aircraft: string;
  reason: DivertReason;
}

interface AlternateScore {
  airport: AirportRef;
  distanceFromOriginNM: number;
  distanceFromDestNM: number;
  fltCat?: MetarReport['fltCat'];
  metar?: string;
  runwayAdequate: boolean;
  customs: boolean;
  fuel: boolean;
  fireCatOk: boolean;
  etopsAlternate: boolean;
  score: number;
  notes: string[];
}

/**
 * Required runway by aircraft class. Approximate landing distance available
 * needs (dry, sea-level, ISA + 15%) based on Boeing/Airbus FCOM rules of thumb.
 */
function requiredRunwayFt(aircraft: string): number {
  const upper = aircraft.toUpperCase();
  if (upper.includes('A380') || upper.includes('747')) return 9_000;
  if (upper.includes('777') || upper.includes('787') || upper.includes('A330') || upper.includes('A350')) return 8_500;
  if (upper.includes('A320') || upper.includes('737')) return 6_500;
  return 8_000;
}

/** Reason-specific weighting for the score. Higher = better alternate. */
function scoreFor(
  reason: DivertReason,
  etopsRequired: boolean,
  alt: {
    distance: number; runway: boolean; customs: boolean; fuel: boolean;
    fireCatOk: boolean; isVfr: boolean; etopsAlternate: boolean;
  },
): number {
  // Distance penalty: 1 point per 100 nm
  let s = 100 - alt.distance / 100;

  // Hard-disqualifiers (heavy negative)
  if (!alt.runway) s -= 80;
  if (!alt.fireCatOk) s -= 50;
  if (etopsRequired && !alt.etopsAlternate) s -= 70; // ETOPS dispatch needs an adequate alternate

  // Reason-specific bonuses
  if (reason === 'medical' && alt.customs) s += 10;
  if (reason === 'mechanical' && alt.customs) s += 5;
  if (reason === 'fuel' && alt.fuel) s += 25;
  if (reason === 'weather' && alt.isVfr) s += 30;
  if (reason !== 'fuel' && alt.fuel) s += 5;
  if (alt.etopsAlternate) s += 5; // mild positive even when ETOPS not strictly required

  return Math.round(s);
}

/**
 * Coarse oceanic detection. ETOPS routing applies to twin-engine types over
 * water beyond 60 min single-engine cruise from an adequate aerodrome. Real
 * ETOPS classification is per-route via the approved track database; this is
 * a planner-side proxy: cross-country + > 1,500 nm. Misses some edge cases
 * (e.g. mainland US ↔ HI is same `iso_country` but actually oceanic — the
 * iso_region column would catch it). Replace with the dispatch route library
 * for prod.
 */
function looksOceanic(originCountry: string, destCountry: string, distanceNM: number): boolean {
  if (distanceNM < 1500) return false;
  if (originCountry === destCountry) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as DivertRequest;
  const dest   = lookupAirport(body.destination);
  const origin = lookupAirport(body.origin);
  if (!dest || !origin) {
    return NextResponse.json({ error: 'unknown origin or destination' }, { status: 400 });
  }

  const required = requiredRunwayFt(body.aircraft);
  const distanceOriginToDestNM = greatCircleNM(origin, dest);
  const isTwin = /777|787|A330|A350|737|A320/i.test(body.aircraft);
  const oceanic = looksOceanic(origin.country, dest.country, distanceOriginToDestNM);
  const etopsRequired = oceanic && isTwin;

  // Spatial filter — only candidates within 1000nm of destination, with adequate
  // runway. Skips ~3,400 obviously-irrelevant airports and keeps the METAR fetch
  // small enough for AviationWeather's URL limit.
  const nearby = findCandidatesWithin(dest, 1000, required)
    .filter((a) => a.icao !== dest.icao);

  // Cap to top 60 closest before WX lookup. Score-based final ranking still applies.
  const candidates = nearby.slice(0, 60);

  // Live METARs for the candidate set (single batched call)
  let metars: MetarReport[] = [];
  try {
    metars = await fetchMetars(candidates.map((c) => c.icao));
  } catch {
    // proceed without WX if AviationWeather is down
  }
  const metarById = new Map(metars.map((m) => [m.icaoId, m]));

  const scored: AlternateScore[] = candidates.map((a) => {
    const metar = metarById.get(a.icao);
    const distFromDest   = greatCircleNM(dest, a);
    const distFromOrigin = greatCircleNM(origin, a);
    const runwayAdequate = a.runwayLengthFt >= required;
    const fireCatOk      = a.fireCat >= 9;
    const isVfr          = metar?.fltCat === 'VFR';

    const score = scoreFor(body.reason, etopsRequired, {
      distance: distFromDest,
      runway: runwayAdequate,
      customs: a.customs,
      fuel: a.fuel !== 'none',
      fireCatOk,
      isVfr,
      etopsAlternate: a.etopsAlternate,
    });

    const notes: string[] = [];
    if (!runwayAdequate) notes.push(`runway ${a.runwayLengthFt.toLocaleString()} ft < ${required.toLocaleString()} ft required`);
    if (!fireCatOk) notes.push(`RFF cat ${a.fireCat} below 9`);
    if (etopsRequired && !a.etopsAlternate) notes.push('not ETOPS-adequate (lighting/runway/customs)');
    if (!a.customs && body.reason === 'medical') notes.push('no 24h customs — pax handling delays likely');
    if (a.fuel === 'none') notes.push('no fuel uplift available');
    if (metar?.fltCat && metar.fltCat !== 'VFR') notes.push(`current WX ${metar.fltCat}`);

    return {
      airport: a,
      distanceFromOriginNM: Math.round(distFromOrigin),
      distanceFromDestNM:   Math.round(distFromDest),
      fltCat:               metar?.fltCat,
      metar:                metar?.rawOb,
      runwayAdequate,
      customs:              a.customs,
      fuel:                 a.fuel !== 'none',
      fireCatOk,
      etopsAlternate:       a.etopsAlternate,
      score,
      notes,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Top 15 surfaced to the UI — beyond that the list stops being useful.
  const ranked = scored.slice(0, 15);

  const etopsAdequateCount = nearby.filter((a) => a.etopsAlternate).length;

  return NextResponse.json({
    flight: body.flight,
    reason: body.reason,
    requiredRunwayFt: required,
    etopsRequired,
    candidatePoolSize: nearby.length,
    etopsAdequateCount,
    ranked,
    source: metars.length
      ? `aviationweather:metar + ourairports (${nearby.length} in 1000nm; ${etopsAdequateCount} ETOPS-adequate)`
      : `ourairports (${nearby.length} in 1000nm; ${etopsAdequateCount} ETOPS-adequate; no live WX)`,
  });
}
