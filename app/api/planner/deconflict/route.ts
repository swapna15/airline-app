import { NextResponse } from 'next/server';
import { lookupAirport } from '@/lib/icao';
import { fuelEstimate } from '@/lib/perf';
import {
  ROTATIONS, MAINTENANCE_WINDOWS, hhmmToMin,
  type Leg,
} from '@/lib/fleet';
import {
  getRoster, getAssignments, assignmentsForFlight, flightsForCrew, typeMatches,
  MAX_FDP_MIN, MAX_FLIGHT_TIME_MIN, MIN_REST_MIN, REPORT_BUFFER_MIN, DEBRIEF_BUFFER_MIN,
  type CrewMember, type CrewAssignment,
} from '@/lib/crew';

/**
 * Schedule deconfliction across the day's rotations + crew pairings.
 *
 * Conflict types:
 *   maintenance       — leg dep/arr slot overlaps a tail maintenance window
 *   unstaffed         — leg has no captain or no first officer assigned
 *   unqualified       — assigned crew lacks a type rating for the aircraft
 *   fdp_exceeded      — crew total FDP > 14h
 *   flight_time_exceeded — crew total flight time > 9h
 *   insufficient_rest — crew rest before duty < 10h
 *   double_booked     — crew has flights that don't form a contiguous chain
 *   base_mismatch     — crew's first leg origin ≠ crew base (warn — positioning lost)
 */

type ConflictType =
  | 'maintenance'
  | 'unstaffed'
  | 'unqualified'
  | 'fdp_exceeded'
  | 'flight_time_exceeded'
  | 'insufficient_rest'
  | 'double_booked'
  | 'base_mismatch';

interface Conflict {
  type:     ConflictType;
  severity: 'block' | 'warn';
  detail:   string;
  tail?:    string;
  flight?:  string;
  crewId?:  string;
}

interface CrewSummary {
  id: string;
  name: string;
  role: 'CAP' | 'FO';
  base: string;
  typeRatings: string[];
  flights: string[];
  totalFdpMin: number;
  totalFlightTimeMin: number;
  conflicts: number;
}

/** A leg's flight time (block - taxi 15) computed from the perf engine. */
function legFlightTimeMin(leg: Leg, aircraft: string): number {
  const o = lookupAirport(leg.origin);
  const d = lookupAirport(leg.destination);
  if (!o || !d) return 0;
  // blockTimeMin = trip + 15 (taxi). Flight time is just trip.
  return Math.max(0, fuelEstimate(o, d, aircraft).blockTimeMin - 15);
}

/** Per-leg block time for FDP accounting. Block + report buffer + debrief buffer. */
function legFdpMin(leg: Leg, aircraft: string): number {
  const o = lookupAirport(leg.origin);
  const d = lookupAirport(leg.destination);
  if (!o || !d) return 0;
  return fuelEstimate(o, d, aircraft).blockTimeMin + REPORT_BUFFER_MIN + DEBRIEF_BUFFER_MIN;
}

/** Two HH:MM intervals overlap (treats `end < start` as wrapping past midnight). */
function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  // Normalize wrap-around by shifting end forward 1440 if it's before start.
  const a2 = aEnd <= aStart ? aEnd + 1440 : aEnd;
  const b2 = bEnd <= bStart ? bEnd + 1440 : bEnd;
  return aStart < b2 && bStart < a2;
}

function maintenanceConflicts(): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const r of ROTATIONS) {
    const windows = MAINTENANCE_WINDOWS.filter((w) => w.tail === r.tail);
    if (!windows.length) continue;
    for (const leg of r.legs) {
      const stdM = hhmmToMin(leg.std);
      const staM = hhmmToMin(leg.sta);
      for (const w of windows) {
        // Only matters if the maintenance is at an airport the leg touches.
        if (w.airport !== leg.origin && w.airport !== leg.destination) continue;
        const wStart = hhmmToMin(w.startHHMM);
        const wEnd   = hhmmToMin(w.endHHMM);
        // Treat the leg's STD as the moment the tail must be available at origin,
        // and STA as when it arrives at destination. Conflict if either falls in window.
        const overlapsAtOrigin = w.airport === leg.origin
          && intervalsOverlap(stdM, stdM + 1, wStart, wEnd);
        const overlapsAtDest = w.airport === leg.destination
          && intervalsOverlap(staM, staM + 1, wStart, wEnd);
        if (overlapsAtOrigin || overlapsAtDest) {
          conflicts.push({
            type: 'maintenance',
            severity: 'block',
            detail:
              `${leg.flight} ${overlapsAtOrigin ? 'departure' : 'arrival'} ` +
              `${overlapsAtOrigin ? leg.std : leg.sta} at ${w.airport} overlaps ` +
              `${w.reason} (${w.startHHMM}-${w.endHHMM})`,
            tail:   r.tail,
            flight: leg.flight,
          });
        }
      }
    }
  }
  return conflicts;
}

function unstaffedConflicts(roster: CrewMember[], assignments: CrewAssignment[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const r of ROTATIONS) {
    for (const leg of r.legs) {
      const assigned = assignmentsForFlight(roster, assignments, leg.flight);
      const hasCAP = assigned.some((c) => c.role === 'CAP');
      const hasFO  = assigned.some((c) => c.role === 'FO');
      if (!hasCAP) conflicts.push({ type: 'unstaffed', severity: 'block', detail: `${leg.flight} has no captain assigned`, tail: r.tail, flight: leg.flight });
      if (!hasFO)  conflicts.push({ type: 'unstaffed', severity: 'block', detail: `${leg.flight} has no first officer assigned`, tail: r.tail, flight: leg.flight });
    }
  }
  return conflicts;
}

interface CrewWalkResult { crew: CrewSummary; conflicts: Conflict[] }

function walkCrew(crew: CrewMember, assignments: CrewAssignment[]): CrewWalkResult {
  const conflicts: Conflict[] = [];
  const flightCodes = flightsForCrew(assignments, crew.id);

  // Resolve each flight to its leg + tail's aircraft.
  type CrewLeg = { tail: string; aircraft: string; leg: Leg };
  const crewLegs: CrewLeg[] = [];
  for (const f of flightCodes) {
    for (const r of ROTATIONS) {
      const leg = r.legs.find((l) => l.flight === f);
      if (leg) crewLegs.push({ tail: r.tail, aircraft: r.aircraft, leg });
    }
  }
  // Sort by STD so chain checks are deterministic.
  crewLegs.sort((a, b) => hhmmToMin(a.leg.std) - hhmmToMin(b.leg.std));

  // Type-rating: every assigned aircraft must match at least one of the crew's ratings.
  for (const cl of crewLegs) {
    if (!typeMatches(cl.aircraft, crew.typeRatings)) {
      conflicts.push({
        type: 'unqualified',
        severity: 'block',
        detail: `${crew.id} ${crew.name} not rated for ${cl.aircraft} (holds ${crew.typeRatings.join(', ')})`,
        crewId: crew.id, flight: cl.leg.flight, tail: cl.tail,
      });
    }
  }

  // Chain check — assigned legs must form a continuous chain (each leg starts where prior ended).
  for (let i = 1; i < crewLegs.length; i++) {
    const prev = crewLegs[i - 1].leg;
    const curr = crewLegs[i].leg;
    if (curr.origin !== prev.destination) {
      conflicts.push({
        type: 'double_booked',
        severity: 'block',
        detail:
          `${crew.id} ${crew.name}: ${prev.flight} ends at ${prev.destination}, ` +
          `next assignment ${curr.flight} departs ${curr.origin}`,
        crewId: crew.id, flight: curr.flight,
      });
    }
  }

  // Cumulative FDP / flight time across assignments.
  const totalFdpMin        = crew.priorFdpMin + crewLegs.reduce((s, cl) => s + legFdpMin(cl.leg, cl.aircraft), 0);
  const totalFlightTimeMin = crew.priorFlightTimeMin + crewLegs.reduce((s, cl) => s + legFlightTimeMin(cl.leg, cl.aircraft), 0);

  if (totalFdpMin > MAX_FDP_MIN) {
    conflicts.push({
      type: 'fdp_exceeded',
      severity: 'block',
      detail: `${crew.id} ${crew.name}: total FDP ${Math.round(totalFdpMin / 60 * 10) / 10}h exceeds ${MAX_FDP_MIN / 60}h limit (FAR 117 unaugmented)`,
      crewId: crew.id,
    });
  }
  if (totalFlightTimeMin > MAX_FLIGHT_TIME_MIN) {
    conflicts.push({
      type: 'flight_time_exceeded',
      severity: 'block',
      detail: `${crew.id} ${crew.name}: total flight time ${Math.round(totalFlightTimeMin / 60 * 10) / 10}h exceeds ${MAX_FLIGHT_TIME_MIN / 60}h limit`,
      crewId: crew.id,
    });
  }

  // Rest before duty.
  if (crewLegs.length > 0 && crew.restMinSinceLastDuty < MIN_REST_MIN) {
    conflicts.push({
      type: 'insufficient_rest',
      severity: 'block',
      detail: `${crew.id} ${crew.name}: ${Math.round(crew.restMinSinceLastDuty / 60 * 10) / 10}h rest before ${crewLegs[0].leg.flight} (${MIN_REST_MIN / 60}h required)`,
      crewId: crew.id, flight: crewLegs[0].leg.flight,
    });
  }

  // Base mismatch — only a warning. Costs the airline a positioning leg.
  if (crewLegs.length > 0 && crewLegs[0].leg.origin !== crew.base) {
    conflicts.push({
      type: 'base_mismatch',
      severity: 'warn',
      detail: `${crew.id} ${crew.name}: based at ${crew.base} but first assignment departs ${crewLegs[0].leg.origin}`,
      crewId: crew.id, flight: crewLegs[0].leg.flight,
    });
  }

  return {
    crew: {
      id: crew.id,
      name: crew.name,
      role: crew.role,
      base: crew.base,
      typeRatings: crew.typeRatings,
      flights: crewLegs.map((cl) => cl.leg.flight),
      totalFdpMin,
      totalFlightTimeMin,
      conflicts: conflicts.length,
    },
    conflicts,
  };
}

export async function GET() {
  const [roster, assignments] = await Promise.all([getRoster(), getAssignments()]);

  const conflicts: Conflict[] = [
    ...maintenanceConflicts(),
    ...unstaffedConflicts(roster, assignments),
  ];

  const crewSummaries: CrewSummary[] = [];
  for (const member of roster) {
    const { crew, conflicts: c } = walkCrew(member, assignments);
    if (crew.flights.length > 0 || c.length > 0) {
      crewSummaries.push(crew);
      conflicts.push(...c);
    }
  }

  // Per-leg conflict count for the rotation timeline UI.
  const conflictsByFlight: Record<string, number> = {};
  for (const c of conflicts) {
    if (c.flight) conflictsByFlight[c.flight] = (conflictsByFlight[c.flight] ?? 0) + 1;
  }

  const blockers = conflicts.filter((c) => c.severity === 'block').length;
  const warnings = conflicts.filter((c) => c.severity === 'warn').length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    fleet: {
      tails: ROTATIONS.length,
      legs: ROTATIONS.flatMap((r) => r.legs).length,
      maintenanceWindows: MAINTENANCE_WINDOWS.length,
      crew: roster.length,
      assignments: assignments.length,
    },
    summary: {
      total: conflicts.length,
      blockers,
      warnings,
      dispatchableLegs: ROTATIONS.flatMap((r) => r.legs).filter((l) => !conflictsByFlight[l.flight]).length,
    },
    rotations: ROTATIONS.map((r) => ({
      tail: r.tail,
      aircraft: r.aircraft,
      legs: r.legs.map((l) => ({
        flight: l.flight,
        origin: l.origin,
        destination: l.destination,
        std: l.std,
        sta: l.sta,
        crew: assignmentsForFlight(roster, assignments, l.flight).map((c) => ({ id: c.id, name: c.name, role: c.role })),
        conflicts: conflictsByFlight[l.flight] ?? 0,
      })),
      maintenance: MAINTENANCE_WINDOWS.filter((w) => w.tail === r.tail),
    })),
    crew: crewSummaries,
    conflicts,
    source: `crew:${roster[0]?.source ?? 'mock'} + fleet.ts mock maintenance windows`,
  });
}
