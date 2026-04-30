/**
 * ETOPS / EDTO planning support.
 *
 * Closes the design-doc §1A ETOPS section: detect when a route requires
 * ETOPS, find ETOPS-adequate alternates within the operator's approved time
 * radius, fetch ±1hr weather for each, and compute the three critical-fuel
 * scenarios (engine-out, depressurization, both at the equidistant point).
 *
 * All calculations are first-pass approximations using the existing
 * lib/perf.ts performance table. Real ETOPS dispatch needs:
 *   - Per-tail engine-out cruise tables (Boeing PEP / Airbus PEP), not 1.3×.
 *   - Time-limited cargo fire suppression check (195 min for most widebodies).
 *   - CAT II/III ILS minima per OpsSpec C055, not just ceiling+vis.
 *   - 24h customs / RFF / fire response at each alternate.
 * That's Jeppesen / NavBlue territory — we model the structure here so
 * tenants can plug a real ETOPS engine in without changing consumers.
 */

import type { AirportRef } from '@/lib/icao';
import { listAirports } from '@/lib/icao';
import { greatCircleNM, fuelEstimate } from '@/lib/perf';
import type { MetarReport } from '@/lib/aviationweather';
import type { EtopsApproval, AlternateMinima } from '@/lib/ops-specs';
import { resolveAircraftType } from '@shared/semantic/aircraft';

/**
 * Twin-engine determination flows through the canonical aircraft ontology
 * (shared/semantic/aircraft.ts). Single source of truth — change once,
 * every consumer (planner, divert advisor, ETOPS check) updates.
 */
export function isTwinEngine(aircraft: string): boolean {
  return resolveAircraftType(aircraft)?.engineCount === 2;
}

/**
 * Approximate equidistant point on the great circle between two airports.
 * For ETOPS first-pass, geographic midpoint is adequate; the real EP is
 * computed against winds aloft and may shift by hundreds of NM on
 * trans-Pacific routes. The OpsSpecs-aware fuel engine handles that.
 */
export function equidistantPoint(o: AirportRef, d: AirportRef): { lat: number; lon: number } {
  // Convert to radians, average on the unit sphere, then back.
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const φ1 = toRad(o.lat); const λ1 = toRad(o.lon);
  const φ2 = toRad(d.lat); const λ2 = toRad(d.lon);
  const Δλ = λ2 - λ1;

  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);

  const φ3 = Math.atan2(
    Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) * (Math.cos(φ1) + Bx) + By * By),
  );
  const λ3 = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);

  return { lat: toDeg(φ3), lon: ((toDeg(λ3) + 540) % 360) - 180 };
}

export interface EtopsAlternateCandidate {
  airport: AirportRef;
  /** NM from the equidistant point. */
  distanceFromEpNM: number;
  /** Time at single-engine cruise speed (~Mach 0.78, ≈ 460 kt TAS). */
  minutesFromEp: number;
}

const SINGLE_ENGINE_TAS_KT = 460;

export function findEtopsAlternates(
  ep: { lat: number; lon: number },
  approval: EtopsApproval,
  requiredRunwayFt: number,
): EtopsAlternateCandidate[] {
  const out: EtopsAlternateCandidate[] = [];
  for (const a of listAirports()) {
    if (!a.etopsAlternate) continue;             // pre-flagged in airports.json
    if (a.runwayLengthFt < requiredRunwayFt) continue;
    const distanceFromEpNM = greatCircleNM(ep as AirportRef, a);
    const minutesFromEp = Math.round((distanceFromEpNM / SINGLE_ENGINE_TAS_KT) * 60);
    if (minutesFromEp <= approval.maxMinutes) {
      out.push({ airport: a, distanceFromEpNM: Math.round(distanceFromEpNM), minutesFromEp });
    }
  }
  return out.sort((x, y) => x.minutesFromEp - y.minutesFromEp);
}

export interface CriticalFuelScenarios {
  /** Standard burn from origin to destination (no diversion). */
  standardKg: number;
  /** Engine failure at the EP — single-engine cruise to the nearest ETOPS alt. */
  engineOutKg: number;
  /** Cabin depressurization at the EP — emergency descent + low-alt cruise. */
  depressurizationKg: number;
  /** Both at once — engine-out + depress. */
  bothKg: number;
  /** The dispatch-required fuel (highest of all four scenarios). */
  requiredKg: number;
  /** Which scenario drove the dispatch number — so the planner can argue with it. */
  drivingScenario: 'standard' | 'engineOut' | 'depressurization' | 'both';
}

export function computeCriticalFuel(
  origin: AirportRef,
  destination: AirportRef,
  nearestAltFromEp: AirportRef,
  ep: { lat: number; lon: number },
  aircraft: string,
): CriticalFuelScenarios {
  // Standard fuel — same calc the fuel phase already does.
  const standard = fuelEstimate(origin, destination, aircraft);

  // Distance from EP to nearest ETOPS alternate. We model the diversion as
  // origin→EP at standard burn + EP→alt at the appropriate scenario factor.
  const halfTrip = standard.trip / 2;
  const epToAltNM = Math.round(greatCircleNM(ep as AirportRef, nearestAltFromEp));
  const epToAltHours = epToAltNM / standard.cruiseSpeedKt;
  const burnPerHr = standard.trip / (standard.distanceNM / standard.cruiseSpeedKt); // kg/hr at cruise

  // First-pass scenario factors (Boeing PEP / Airbus PEP would replace these):
  //   engine-out at FL220+ ≈ 1.3× cruise burn
  //   depressurization (FL100 cruise after emergency descent) ≈ 1.55×
  //   both                                                   ≈ 2.0×
  const ENGINE_OUT_FACTOR  = 1.30;
  const DEPRESS_FACTOR     = 1.55;
  const BOTH_FACTOR        = 2.00;

  const engineOutDivertKg  = Math.round(epToAltHours * burnPerHr * ENGINE_OUT_FACTOR);
  const depressDivertKg    = Math.round(epToAltHours * burnPerHr * DEPRESS_FACTOR);
  const bothDivertKg       = Math.round(epToAltHours * burnPerHr * BOTH_FACTOR);

  // Each scenario adds the divert fuel on top of "got to the EP" fuel.
  const engineOutKg        = Math.round(halfTrip + engineOutDivertKg + standard.reserve);
  const depressurizationKg = Math.round(halfTrip + depressDivertKg + standard.reserve);
  const bothKg             = Math.round(halfTrip + bothDivertKg + standard.reserve);

  const standardKg = standard.block;
  const all = { standardKg, engineOutKg, depressurizationKg, bothKg };
  let drivingScenario: CriticalFuelScenarios['drivingScenario'] = 'standard';
  let max = standardKg;
  if (engineOutKg > max)        { max = engineOutKg;        drivingScenario = 'engineOut'; }
  if (depressurizationKg > max) { max = depressurizationKg; drivingScenario = 'depressurization'; }
  if (bothKg > max)             { max = bothKg;             drivingScenario = 'both'; }

  return { ...all, requiredKg: max, drivingScenario };
}

export interface AlternateWeatherCheck {
  icao: string;
  iata: string;
  metarRaw?: string;
  fltCat?: MetarReport['fltCat'];
  meetsMinima: 'yes' | 'no' | 'unknown';
  reason?: string;
}

/**
 * Verify each candidate alternate's METAR meets the C055 alternate minima.
 * The full ICAO ±1hr-from-ETA check requires TAF; first-pass uses current
 * METAR fltCat as a coarse proxy:
 *   VFR  → ceilings/vis well above minima → meets
 *   MVFR → marginal; flagged "unknown — check TAF"
 *   IFR  → likely below minima → fails
 *   LIFR → below minima
 * Tenants needing the precise check should plug a TAF parser into this.
 */
export function checkAlternateWeather(
  candidates: EtopsAlternateCandidate[],
  metars: MetarReport[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _minima: AlternateMinima,
): AlternateWeatherCheck[] {
  const byIcao = new Map<string, MetarReport>();
  for (const m of metars) if (m.icaoId) byIcao.set(m.icaoId, m);
  return candidates.map((c) => {
    const m = byIcao.get(c.airport.icao);
    if (!m) {
      return {
        icao: c.airport.icao,
        iata: c.airport.iata,
        meetsMinima: 'unknown',
        reason: 'no METAR available',
      };
    }
    const fltCat = m.fltCat;
    if (fltCat === 'VFR' || fltCat === 'MVFR') {
      return {
        icao: c.airport.icao, iata: c.airport.iata,
        metarRaw: m.rawOb, fltCat,
        meetsMinima: fltCat === 'VFR' ? 'yes' : 'unknown',
        reason: fltCat === 'MVFR' ? 'marginal — confirm against TAF for ±1hr ETA window' : undefined,
      };
    }
    return {
      icao: c.airport.icao, iata: c.airport.iata,
      metarRaw: m.rawOb, fltCat,
      meetsMinima: 'no',
      reason: `current ${fltCat} below alternate minima`,
    };
  });
}
