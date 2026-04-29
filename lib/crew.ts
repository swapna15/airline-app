/**
 * Crew façade — FAR-117 dispatch limits + roster/assignment accessors.
 *
 * Roster + assignments come from a pluggable provider (`lib/integrations/crew/`)
 * chosen at runtime — mock by default, CSV/S3 or Sabre/Jeppesen/AIMS REST when
 * configured. See `CREW_PROVIDER` in CLAUDE.md.
 *
 * Callers fetch `getRoster()` + `getAssignments()` once, then use the
 * synchronous helpers (`crewById`, `assignmentsForFlight`, `flightsForCrew`)
 * to walk the in-memory snapshot. This keeps inner loops cheap and avoids
 * fan-out fetches.
 */

import { getCrewProvider } from './integrations/crew/resolver';
import type { ProviderHealthResult } from './integrations/types';
import type { CrewMember, CrewAssignment, CrewRole } from './integrations/crew/types';

export type { CrewMember, CrewAssignment, CrewRole };
export { getCrewProvider, resetCrewProvider } from './integrations/crew/resolver';

// ── FAR 117 simplified — single-day window, unaugmented ops ──────────────────
export const MAX_FDP_MIN         = 14 * 60;
export const MAX_FLIGHT_TIME_MIN =  9 * 60;
export const MIN_REST_MIN        = 10 * 60;
export const REPORT_BUFFER_MIN   = 60;
export const DEBRIEF_BUFFER_MIN  = 30;

// ── Async data accessors (delegate to provider) ──────────────────────────────
export async function getRoster():      Promise<CrewMember[]>     { return getCrewProvider().getRoster(); }
export async function getAssignments(): Promise<CrewAssignment[]> { return getCrewProvider().getAssignments(); }

export async function crewProviderHealth(): Promise<ProviderHealthResult> {
  return getCrewProvider().healthCheck();
}

// ── Pure helpers operating on a fetched snapshot ─────────────────────────────
export function crewById(roster: CrewMember[], id: string): CrewMember | undefined {
  return roster.find((c) => c.id === id);
}

export function assignmentsForFlight(
  roster: CrewMember[],
  assignments: CrewAssignment[],
  flight: string,
): CrewMember[] {
  return assignments
    .filter((a) => a.flight === flight)
    .map((a) => roster.find((c) => c.id === a.crewId))
    .filter((c): c is CrewMember => !!c);
}

export function flightsForCrew(assignments: CrewAssignment[], crewId: string): string[] {
  return assignments.filter((a) => a.crewId === crewId).map((a) => a.flight);
}

/** Type-rating match: case-insensitive substring against the aircraft string. */
export function typeMatches(aircraft: string, ratings: string[]): boolean {
  const upper = aircraft.toUpperCase().replace(/\s+/g, '');
  return ratings.some((r) => upper.includes(r.toUpperCase()));
}
