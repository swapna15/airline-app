import { NextRequest, NextResponse } from 'next/server';
import { lookupAirport, type AirportRef } from '@/lib/icao';
import { findCandidatesWithin, greatCircleNM } from '@/lib/perf';
import { fetchMetars, parseMetarMinima } from '@/lib/aviationweather';
import type { MetarReport } from '@/lib/aviationweather';
import { loadOpsSpecs, type AlternateMinima } from '@/lib/ops-specs';

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
  ceilingFt: number | null;
  visSm: number | null;
  meetsAlternateMinima: 'yes' | 'no' | 'unknown';
  runwayAdequate: boolean;
  customs: boolean;
  fuel: boolean;
  fireCatOk: boolean;
  etopsAlternate: boolean;
  authorized: boolean;
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
    meetsAlternateMinima: 'yes' | 'no' | 'unknown';
    authorized: boolean;
  },
): number {
  // Distance penalty: 1 point per 100 nm
  let s = 100 - alt.distance / 100;

  // Hard-disqualifiers (heavy negative)
  if (!alt.runway) s -= 80;
  if (!alt.fireCatOk) s -= 50;
  if (etopsRequired && !alt.etopsAlternate) s -= 70; // ETOPS dispatch needs an adequate alternate
  if (alt.meetsAlternateMinima === 'no') s -= 90;    // OpsSpec C055 ceiling/vis floor
  if (!alt.authorized) s -= 100;                     // OpsSpec authorized-airports list

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
 * Compare a parsed METAR against the OpsSpec alternate-minima floor.
 * Returns 'unknown' when we lack ceiling or vis data — the planner sees the
 * gap rather than a false 'yes'.
 *
 * Real dispatch uses TAF at ETA ±1hr; this is a current-conditions proxy.
 */
function checkAlternateMinima(
  ceilingFt: number | null,
  visSm: number | null,
  minima: AlternateMinima,
): 'yes' | 'no' | 'unknown' {
  if (visSm === null) return 'unknown';
  if (visSm < minima.alternateVisSm) return 'no';
  // ceiling=null means no BKN/OVC reported → unlimited ceiling → meets minima
  if (ceilingFt !== null && ceilingFt < minima.alternateCeilingFt) return 'no';
  return 'yes';
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

  // Pull the tenant OpsSpec — alternateMinima for ceiling/vis floor, and
  // authorizedAirports for the operator's permitted-stations filter.
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const opsSpecs = await loadOpsSpecs(token);
  const authorizedSet = new Set(opsSpecs.authorizedAirports.map((s) => s.toUpperCase()));
  const hasAuthList = authorizedSet.size > 0;

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
    const authorized     = !hasAuthList
      || authorizedSet.has(a.icao.toUpperCase())
      || authorizedSet.has(a.iata.toUpperCase());

    const minima = metar
      ? parseMetarMinima(metar)
      : { ceilingFt: null, visSm: null };
    const meetsAlternateMinima: 'yes' | 'no' | 'unknown' = metar
      ? checkAlternateMinima(minima.ceilingFt, minima.visSm, opsSpecs.alternateMinima)
      : 'unknown';

    const score = scoreFor(body.reason, etopsRequired, {
      distance: distFromDest,
      runway: runwayAdequate,
      customs: a.customs,
      fuel: a.fuel !== 'none',
      fireCatOk,
      isVfr,
      etopsAlternate: a.etopsAlternate,
      meetsAlternateMinima,
      authorized,
    });

    const notes: string[] = [];
    if (!runwayAdequate) notes.push(`runway ${a.runwayLengthFt.toLocaleString()} ft < ${required.toLocaleString()} ft required`);
    if (!fireCatOk) notes.push(`RFF cat ${a.fireCat} below 9`);
    if (etopsRequired && !a.etopsAlternate) notes.push('not ETOPS-adequate (lighting/runway/customs)');
    if (!authorized) notes.push('not in OpsSpec authorized-airports list');
    if (meetsAlternateMinima === 'no') {
      const ceilStr = minima.ceilingFt !== null ? `${minima.ceilingFt} ft` : 'unlimited';
      const visStr  = minima.visSm !== null ? `${minima.visSm} SM` : '?';
      notes.push(
        `WX ${ceilStr} / ${visStr} below alt minima ${opsSpecs.alternateMinima.alternateCeilingFt} ft / ${opsSpecs.alternateMinima.alternateVisSm} SM`,
      );
    } else if (meetsAlternateMinima === 'unknown' && !metar) {
      notes.push('no METAR — alternate minima unverified');
    }
    if (!a.customs && body.reason === 'medical') notes.push('no 24h customs — pax handling delays likely');
    if (a.fuel === 'none') notes.push('no fuel uplift available');
    if (metar?.fltCat && metar.fltCat !== 'VFR' && meetsAlternateMinima !== 'no') {
      notes.push(`current WX ${metar.fltCat}`);
    }

    return {
      airport: a,
      distanceFromOriginNM: Math.round(distFromOrigin),
      distanceFromDestNM:   Math.round(distFromDest),
      fltCat:               metar?.fltCat,
      metar:                metar?.rawOb,
      ceilingFt:            minima.ceilingFt,
      visSm:                minima.visSm,
      meetsAlternateMinima,
      runwayAdequate,
      customs:              a.customs,
      fuel:                 a.fuel !== 'none',
      fireCatOk,
      etopsAlternate:       a.etopsAlternate,
      authorized,
      score,
      notes,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Top 15 surfaced to the UI — beyond that the list stops being useful.
  const ranked = scored.slice(0, 15);

  const etopsAdequateCount    = nearby.filter((a) => a.etopsAlternate).length;
  const meetsMinimaCount      = scored.filter((s) => s.meetsAlternateMinima === 'yes').length;
  const authorizedRankedCount = scored.filter((s) => s.authorized).length;

  // Surface a destination-authorization warning when the operator has an
  // authorized-airports list and the filed destination isn't on it.
  const destAuthorized = !hasAuthList
    || authorizedSet.has(dest.icao.toUpperCase())
    || authorizedSet.has(dest.iata.toUpperCase());

  return NextResponse.json({
    flight: body.flight,
    reason: body.reason,
    requiredRunwayFt: required,
    etopsRequired,
    candidatePoolSize: nearby.length,
    etopsAdequateCount,
    meetsMinimaCount,
    authorizedRankedCount,
    destAuthorized,
    alternateMinima: opsSpecs.alternateMinima,
    authorizedAirportsCount: authorizedSet.size,
    ranked,
    source: metars.length
      ? `aviationweather:metar + ourairports (${nearby.length} in 1000nm; ${etopsAdequateCount} ETOPS-adequate; ${meetsMinimaCount} meet alt minima)`
      : `ourairports (${nearby.length} in 1000nm; ${etopsAdequateCount} ETOPS-adequate; no live WX)`,
  });
}
