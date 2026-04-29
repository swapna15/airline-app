/**
 * Mock crew roster + flight pairings.
 *
 * Real airlines source this from CrewTrac, Sabre Crew Pairing, or Jeppesen
 * Crew Manager. Production wiring: replace `ROSTER`/`ASSIGNMENTS` with REST
 * pulls from the crew system. The deconflict assessor never touches the data
 * layer directly — it only walks the in-memory shape.
 *
 * FAR 117 simplification: only unaugmented domestic+intl ops, single-day window.
 * Real FDP tables vary by report time, time of day, augmented crew (heavy/double),
 * and zone changes. The constants here pick the typical max envelope.
 */

export const MAX_FDP_MIN         = 14 * 60; // 14h max flight duty period
export const MAX_FLIGHT_TIME_MIN =  9 * 60; // 9h max flight time within FDP
export const MIN_REST_MIN        = 10 * 60; // 10h minimum rest before next FDP
export const REPORT_BUFFER_MIN   = 60;      // crew reports 1h before STD
export const DEBRIEF_BUFFER_MIN  = 30;      // 30min after STA

export type CrewRole = 'CAP' | 'FO';

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  base: string;                // base IATA — used for base-mismatch warnings
  typeRatings: string[];       // e.g. ['777'], ['A330'], ['A330', 'A380']
  priorFdpMin: number;         // FDP already accumulated today before this rotation
  priorFlightTimeMin: number;  // flight time already accumulated today
  restMinSinceLastDuty: number;// minutes of rest before this duty period
}

export interface CrewAssignment {
  crewId: string;
  flight: string;
}

export const ROSTER: CrewMember[] = [
  // 777 crew
  { id: 'C001', name: 'Allen, K.',   role: 'CAP', base: 'JFK', typeRatings: ['777'],          priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 14 * 60 },
  { id: 'C002', name: 'Bennett, R.', role: 'CAP', base: 'LHR', typeRatings: ['777'],          priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12 * 60 },
  { id: 'F001', name: 'Foster, J.',  role: 'FO',  base: 'JFK', typeRatings: ['777'],          priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 14 * 60 },
  { id: 'F002', name: 'Garcia, T.',  role: 'FO',  base: 'LHR', typeRatings: ['777'],          priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12 * 60 },
  // A330 crew
  { id: 'C003', name: 'Carter, J.',  role: 'CAP', base: 'JFK', typeRatings: ['A330'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12 * 60 },
  { id: 'F003', name: 'Hewitt, S.',  role: 'FO',  base: 'JFK', typeRatings: ['A330'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 11 * 60 },
  // A380 crew
  { id: 'C004', name: 'Donovan, M.', role: 'CAP', base: 'FRA', typeRatings: ['A380'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 11 * 60 },
  { id: 'C005', name: 'Engel, P.',   role: 'CAP', base: 'DXB', typeRatings: ['A380'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 13 * 60 },
  { id: 'F005', name: 'Jung, K.',    role: 'FO',  base: 'FRA', typeRatings: ['A380'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 13 * 60 },
  // Reserve captain with insufficient rest — used to surface that conflict type
  { id: 'C006', name: 'Klein, A.',   role: 'CAP', base: 'JFK', typeRatings: ['777'],          priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty:  8 * 60 },
];

/**
 * Today's pairings — crafted so a single deconflict pass surfaces every
 * conflict type at least once. Production data comes from the crew system.
 */
export const ASSIGNMENTS: CrewAssignment[] = [
  // BA1000 JFK→LHR + BA1001 LHR→JFK (G-XLEK 777)
  { crewId: 'C001', flight: 'BA1000' },
  { crewId: 'F001', flight: 'BA1000' },
  { crewId: 'C006', flight: 'BA1000' }, // Klein has only 8h rest → insufficient_rest
  { crewId: 'C002', flight: 'BA1001' },
  { crewId: 'F002', flight: 'BA1001' },

  // AA2110 CDG→JFK + AA2111 JFK→CDG (N801AA A330)
  { crewId: 'C003', flight: 'AA2110' }, // Carter A330 — clean for this leg
  { crewId: 'C003', flight: 'AA2111' }, // back-to-back transatlantic → fdp_exceeded + flight_time_exceeded
  { crewId: 'F003', flight: 'AA2110' },
  { crewId: 'F003', flight: 'AA2111' },

  // LH4409 FRA→JFK + LH4410 JFK→FRA (D-AIMA A380)
  { crewId: 'C004', flight: 'LH4409' },
  { crewId: 'F005', flight: 'LH4409' },
  // LH4410 captain assigned wrongly: Carter is A330-only, LH4410 is A380.
  // Also creates a triple-assignment chain that breaks (CDG → JFK origin mismatch) → double_booked.
  { crewId: 'C003', flight: 'LH4410' },
  // LH4410 has NO FO assignment → unstaffed conflict

  // EK5499 DXB→JFK (A6-EUC A380)
  { crewId: 'C005', flight: 'EK5499' },
  // EK5500 has NO crew at all → 2x unstaffed (CAP + FO)
];

export const crewById = (id: string): CrewMember | undefined => ROSTER.find((c) => c.id === id);

export const assignmentsForFlight = (flight: string): CrewMember[] =>
  ASSIGNMENTS
    .filter((a) => a.flight === flight)
    .map((a) => crewById(a.crewId))
    .filter((c): c is CrewMember => !!c);

export const flightsForCrew = (crewId: string): string[] =>
  ASSIGNMENTS.filter((a) => a.crewId === crewId).map((a) => a.flight);

/** Type-rating match: case-insensitive substring against the aircraft string. */
export function typeMatches(aircraft: string, ratings: string[]): boolean {
  const upper = aircraft.toUpperCase().replace(/\s+/g, '');
  return ratings.some((r) => upper.includes(r.toUpperCase()));
}
