/**
 * Crew fatigue scoring (Req 8).
 *
 * Pure function. Inputs come strictly from the crew system (or mock store) —
 * we never invent duty history. Score is a 0–100 composite of three real-world
 * fatigue drivers:
 *
 *   FDP load        — cumulative Flight Duty Period in the prior window vs.
 *                     the regulatory weekly cap (60h is a common ceiling).
 *   Rest deficit    — most-recent rest period vs. the 10h regulatory minimum.
 *                     Real systems track every rest gap in the prior 7 days;
 *                     our crew adapter exposes only `restMinSinceLastDuty`,
 *                     so the calc binary-penalizes a deficit there.
 *   Timezone load   — number of ≥3h timezone crossings on the upcoming sector.
 *                     Approximated from longitude delta between airports
 *                     (each 15° ≈ 1 hour).
 *
 * Thresholds mirror the spec: > 70 → high_fatigue (warn), > 85 → reject.
 */

import type { CrewMember } from '@shared/schema/crew';
import { lookupAirport } from '@/lib/icao';

export const HIGH_FATIGUE_THRESHOLD = 70;
export const REJECT_FATIGUE_THRESHOLD = 85;

const FDP_WEEKLY_CAP_MIN = 60 * 60;     // 60h regulatory cap
const MIN_REST_MIN       = 10 * 60;     // 10h regulatory minimum

export interface FatigueBreakdown {
  fdp:      number;   // 0–50
  rest:     number;   // 0–30
  timezone: number;   // 0–20
}

export interface CrewFatigueResult {
  crewId: string;
  name: string;
  score: number;                              // 0–100, rounded to int
  breakdown: FatigueBreakdown;
  flag: 'ok' | 'high_fatigue' | 'reject';
}

function fdpComponent(priorFdpMin: number): number {
  // Scale 0…cap → 0…50 contribution. Linear is sufficient for first pass;
  // real FDP curves are step-wise per regulator.
  const ratio = Math.max(0, priorFdpMin) / FDP_WEEKLY_CAP_MIN;
  return Math.min(50, Math.round(ratio * 50));
}

function restComponent(restMinSinceLastDuty: number): number {
  // Below the 10h minimum, contribution scales linearly to 30.
  if (restMinSinceLastDuty >= MIN_REST_MIN) return 0;
  const deficit = (MIN_REST_MIN - restMinSinceLastDuty) / MIN_REST_MIN;
  return Math.min(30, Math.round(deficit * 30));
}

function timezoneCrossings(originIata: string, destinationIata: string): number {
  // Approximate hour delta from longitude difference. lib/airports.json has
  // longitude on each airport; we use the canonical lookup.
  const o = lookupAirport(originIata);
  const d = lookupAirport(destinationIata);
  if (!o || !d) return 0;
  const lonDelta = Math.abs(o.lon - d.lon);
  const hours = Math.round(lonDelta / 15);
  // Each 3-hour block counts as one crossing unit.
  return Math.floor(hours / 3);
}

function timezoneComponent(originIata: string, destinationIata: string): number {
  // Up to 20 points; each crossing unit adds 5.
  return Math.min(20, timezoneCrossings(originIata, destinationIata) * 5);
}

export interface FlightContext {
  origin: string;       // IATA
  destination: string;  // IATA
}

export function scoreCrewFatigue(
  member: CrewMember,
  flight: FlightContext,
): CrewFatigueResult {
  const breakdown: FatigueBreakdown = {
    fdp:      fdpComponent(member.priorFdpMin),
    rest:     restComponent(member.restMinSinceLastDuty),
    timezone: timezoneComponent(flight.origin, flight.destination),
  };
  const score = breakdown.fdp + breakdown.rest + breakdown.timezone;

  let flag: CrewFatigueResult['flag'] = 'ok';
  if (score >= REJECT_FATIGUE_THRESHOLD)      flag = 'reject';
  else if (score >= HIGH_FATIGUE_THRESHOLD)   flag = 'high_fatigue';

  return {
    crewId: member.id,
    name: member.name,
    score,
    breakdown,
    flag,
  };
}

export function scoreCrewBatch(
  members: CrewMember[],
  flight: FlightContext,
): CrewFatigueResult[] {
  return members.map((m) => scoreCrewFatigue(m, flight));
}
