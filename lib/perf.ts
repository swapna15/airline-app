/**
 * Deterministic performance numbers for the planner.
 * NOT OFP-grade. Real planning uses certified perf engines (PPS, Lido, NetLine).
 * These calcs give *real numbers from real inputs* — distance from coordinates,
 * fuel from a per-aircraft burn-rate table — without pretending to model winds,
 * step climbs, or contingency reserves accurately.
 */
import { listAirports, type AirportRef } from './icao';

const NM_PER_KM = 0.539957;

/** Great-circle distance in nautical miles via haversine. */
export function greatCircleNM(a: AirportRef, b: AirportRef): number {
  const R_KM = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R_KM * Math.asin(Math.sqrt(h));
  return km * NM_PER_KM;
}

/**
 * Approximate cruise fuel burn (kg/h) and Mach for common widebodies.
 * Sourced from manufacturer published specs — accurate enough for a
 * planning estimate, not a dispatch release.
 */
const PERF_TABLE: Record<string, { burnKgPerHr: number; mach: number; mtowKg: number }> = {
  '777-300ER': { burnKgPerHr: 7500, mach: 0.84, mtowKg: 351_500 },
  '777':       { burnKgPerHr: 7500, mach: 0.84, mtowKg: 351_500 },
  'A330-300':  { burnKgPerHr: 5800, mach: 0.82, mtowKg: 233_000 },
  'A330':      { burnKgPerHr: 5800, mach: 0.82, mtowKg: 233_000 },
  'A380-800':  { burnKgPerHr: 11_000, mach: 0.85, mtowKg: 575_000 },
  'A380':      { burnKgPerHr: 11_000, mach: 0.85, mtowKg: 575_000 },
  '787-9':     { burnKgPerHr: 5400, mach: 0.85, mtowKg: 254_000 },
  '787':       { burnKgPerHr: 5400, mach: 0.85, mtowKg: 254_000 },
  'A350-900':  { burnKgPerHr: 5800, mach: 0.85, mtowKg: 280_000 },
  'A350':      { burnKgPerHr: 5800, mach: 0.85, mtowKg: 280_000 },
};

const DEFAULT_PERF = { burnKgPerHr: 6500, mach: 0.82, mtowKg: 250_000 };

function matchPerf(aircraft: string) {
  const upper = aircraft.toUpperCase().replace(/\s+/g, '');
  for (const key of Object.keys(PERF_TABLE)) {
    if (upper.includes(key.toUpperCase())) return PERF_TABLE[key];
  }
  return DEFAULT_PERF;
}

const TAS_KT_PER_MACH = 573; // approx at FL350, ISA

export interface FuelEstimate {
  distanceNM: number;
  cruiseSpeedKt: number;
  blockTimeMin: number;
  trip: number;
  contingency: number;
  alternate: number;
  reserve: number;
  taxi: number;
  block: number;
  mtowKg: number;
}

/**
 * Compute a planning fuel estimate.
 * Rules of thumb used:
 *  - cruise TAS ≈ Mach × 573 kt
 *  - block time = trip time + 15 min (taxi)
 *  - contingency 5% of trip
 *  - alternate = 45 min at cruise burn
 *  - final reserve = 30 min at cruise burn
 *  - taxi fuel = 600 kg flat
 */
export interface FuelPolicyOverrides {
  /** % of trip fuel — default 5 */
  contingencyPct?: number;
  /** minutes at cruise burn — default 45 */
  alternateMinutes?: number;
  /** minutes at cruise burn — default 30 */
  finalReserveMinutes?: number;
  /** kg, flat — default 600 */
  taxiKg?: number;
  /** discretionary captain's fuel, minutes at cruise burn — default 0 */
  captainsFuelMinutes?: number;
}

export function fuelEstimate(
  a: AirportRef,
  b: AirportRef,
  aircraft: string,
  policy: FuelPolicyOverrides = {},
): FuelEstimate & { captainsFuel?: number } {
  const { burnKgPerHr, mach, mtowKg } = matchPerf(aircraft);
  const contingencyPct      = policy.contingencyPct      ?? 5;
  const alternateMinutes    = policy.alternateMinutes    ?? 45;
  const finalReserveMinutes = policy.finalReserveMinutes ?? 30;
  const taxiKg              = policy.taxiKg              ?? 600;
  const captainsFuelMinutes = policy.captainsFuelMinutes ?? 0;

  const distanceNM    = Math.round(greatCircleNM(a, b));
  const cruiseSpeedKt = Math.round(mach * TAS_KT_PER_MACH);
  const tripHours     = distanceNM / cruiseSpeedKt;
  const trip          = Math.round(tripHours * burnKgPerHr);
  const contingency   = Math.round(trip * (contingencyPct / 100));
  const alternate     = Math.round(burnKgPerHr * (alternateMinutes / 60));
  const reserve       = Math.round(burnKgPerHr * (finalReserveMinutes / 60));
  const captainsFuel  = Math.round(burnKgPerHr * (captainsFuelMinutes / 60));
  const taxi          = taxiKg;
  const block         = trip + contingency + alternate + reserve + captainsFuel + taxi;
  const blockTimeMin  = Math.round(tripHours * 60) + 15;
  return {
    distanceNM, cruiseSpeedKt, blockTimeMin,
    trip, contingency, alternate, reserve, taxi, block, mtowKg,
    ...(captainsFuel > 0 ? { captainsFuel } : {}),
  };
}

/**
 * Find every airport within `radiusNM` of a centroid. O(N) over the full
 * 3,400-entry catalogue — fine for per-request use; the JSON is server-only.
 * Optional `minRunwayFt` short-circuits unsuitable candidates before the
 * (cheap but non-trivial) haversine.
 */
export function findCandidatesWithin(
  centroid: { lat: number; lon: number },
  radiusNM: number,
  minRunwayFt = 0,
): Array<AirportRef & { distanceNM: number }> {
  const out: Array<AirportRef & { distanceNM: number }> = [];
  for (const a of listAirports()) {
    if (a.runwayLengthFt < minRunwayFt) continue;
    const distanceNM = greatCircleNM(centroid as AirportRef, a);
    if (distanceNM <= radiusNM) out.push({ ...a, distanceNM: Math.round(distanceNM) });
  }
  out.sort((x, y) => x.distanceNM - y.distanceNM);
  return out;
}

/** Initial bearing from a → b in degrees, used for a rough route heading. */
export function initialBearing(a: AirportRef, b: AirportRef): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y  = Math.sin(Δλ) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
