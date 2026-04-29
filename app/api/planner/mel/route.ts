import { NextRequest, NextResponse } from 'next/server';
import { lookupAirport } from '@/lib/icao';
import { greatCircleNM } from '@/lib/perf';
import { findRotationByFlight } from '@/lib/fleet';
import { assessMEL, getDeferredItems, type RouteContext } from '@/lib/mel';

interface MELRequest {
  flight: string;
  origin: string;
  destination: string;
  aircraft: string;
  /** Optional manual overrides — typically the planner pulls these from the brief phase. */
  overrides?: Partial<RouteContext>;
}

/**
 * Required runway by aircraft class. Same heuristic as divert/route.ts.
 */
function requiredRunwayFt(aircraft: string): number {
  const upper = aircraft.toUpperCase();
  if (upper.includes('A380') || upper.includes('747')) return 9_000;
  if (upper.includes('777') || upper.includes('787') || upper.includes('A330') || upper.includes('A350')) return 8_500;
  if (upper.includes('A320') || upper.includes('737')) return 6_500;
  return 8_000;
}

/**
 * Coarse oceanic detection: cross-country + > 1,500 nm. Same proxy used by
 * the divert tool. Replace with the dispatch route library for prod.
 */
function looksOceanic(originCountry: string, destCountry: string, distanceNM: number): boolean {
  if (distanceNM < 1500) return false;
  if (originCountry === destCountry) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as MELRequest;
  const origin = lookupAirport(body.origin);
  const dest   = lookupAirport(body.destination);
  if (!origin || !dest) {
    return NextResponse.json({ error: 'unknown origin or destination' }, { status: 400 });
  }

  // Map flight number → tail via fleet rotations. Without a rotation, no deferrals
  // can be looked up — return a clean "no deferrals known" response rather than 404.
  const rot = findRotationByFlight(body.flight);
  const tail = rot?.rotation.tail;
  const deferred = tail ? getDeferredItems(tail) : [];

  // Auto-derived route context. Planner can override any field via `overrides`.
  const distanceNM = greatCircleNM(origin, dest);
  const oceanic = looksOceanic(origin.country, dest.country, distanceNM);
  const isTwin  = /777|787|A330|A350|737|A320/i.test(body.aircraft);

  const auto: RouteContext = {
    oceanic,
    etopsRequired:           oceanic && isTwin,
    knownIcing:              false,
    thunderstormsForecast:   false,
    imcBelowFreezing:        false,
    destCatIIIRequired:      false,
    arrivalIsNight:          false,
    destRunwayFt:            dest.runwayLengthFt,
    requiredRunwayFt:        requiredRunwayFt(body.aircraft),
  };
  const ctx: RouteContext = { ...auto, ...(body.overrides ?? {}) };

  const assessment = assessMEL(deferred, ctx);

  return NextResponse.json({
    flight: body.flight,
    tail: tail ?? null,
    aircraft: body.aircraft,
    distanceNM: Math.round(distanceNM),
    routeContext: ctx,
    deferred: assessment.deferred.map((d) => ({
      melId: d.melId,
      ataChapter: d.mel.ataChapter,
      ataName: d.mel.ataName,
      item: d.mel.item,
      category: d.mel.category,
      daysDeferred: d.daysDeferred,
      restrictions: d.mel.restrictions,
    })),
    conflicts:        assessment.conflicts,
    advisories:       assessment.advisories,
    mtowReductionKg:  assessment.mtowReductionKg,
    flCeiling:        assessment.flCeiling,
    dispatchAllowed:  assessment.dispatchAllowed,
    source: tail
      ? `mock mel.ts deferrals for ${tail} — production needs AMOS/TRAX integration`
      : 'no rotation found for flight; assessment ran with empty deferral list',
  });
}
