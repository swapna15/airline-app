import type { CrewMember, CrewAssignment, CrewProvider } from './types';
import type { ProviderHealthResult } from '../types';

/**
 * In-repo mock roster + pairings — same data as the original `lib/crew.ts`,
 * tagged with `source: 'mock'`. Crafted so the deconfliction tool surfaces
 * every conflict type at least once across the four demo tails.
 */

const ROSTER: CrewMember[] = [
  // 777 crew
  // Allen carries accumulated FDP and a short rest gap — exercises the
  // high_fatigue path (~70+ score on a TZ-crossing sector).
  { id: 'C001', name: 'Allen, K.',   role: 'CAP', base: 'JFK', typeRatings: ['777'],          priorFdpMin: 50 * 60, priorFlightTimeMin: 35 * 60, restMinSinceLastDuty:  9 * 60, status: 'active', source: 'mock' },
  { id: 'C002', name: 'Bennett, R.', role: 'CAP', base: 'LHR', typeRatings: ['777'],          priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12 * 60, status: 'active', source: 'mock' },
  // Foster is at the regulatory edge — pushes above 85 to verify the reject
  // path (dispatch should be blocked when this crew is assigned).
  { id: 'F001', name: 'Foster, J.',  role: 'FO',  base: 'JFK', typeRatings: ['777'],          priorFdpMin: 58 * 60, priorFlightTimeMin: 40 * 60, restMinSinceLastDuty:  6 * 60, status: 'active', source: 'mock' },
  { id: 'F002', name: 'Garcia, T.',  role: 'FO',  base: 'LHR', typeRatings: ['777'],          priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12 * 60, status: 'active', source: 'mock' },
  // A330 crew
  { id: 'C003', name: 'Carter, J.',  role: 'CAP', base: 'JFK', typeRatings: ['A330'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12 * 60, status: 'active', source: 'mock' },
  { id: 'F003', name: 'Hewitt, S.',  role: 'FO',  base: 'JFK', typeRatings: ['A330'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 11 * 60, status: 'active', source: 'mock' },
  // A380 crew
  { id: 'C004', name: 'Donovan, M.', role: 'CAP', base: 'FRA', typeRatings: ['A380'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 11 * 60, status: 'active', source: 'mock' },
  { id: 'C005', name: 'Engel, P.',   role: 'CAP', base: 'DXB', typeRatings: ['A380'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 13 * 60, status: 'active', source: 'mock' },
  { id: 'F005', name: 'Jung, K.',    role: 'FO',  base: 'FRA', typeRatings: ['A380'],         priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 13 * 60, status: 'active', source: 'mock' },
  // Reserve captain with insufficient rest — surfaces that conflict type.
  { id: 'C006', name: 'Klein, A.',   role: 'CAP', base: 'JFK', typeRatings: ['777'],          priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty:  8 * 60, status: 'reserve', source: 'mock' },
];

const ASSIGNMENTS: CrewAssignment[] = [
  { crewId: 'C001', flight: 'BA1000' },
  { crewId: 'F001', flight: 'BA1000' },
  { crewId: 'C006', flight: 'BA1000' },           // Klein only had 8h rest → insufficient_rest
  { crewId: 'C002', flight: 'BA1001' },
  { crewId: 'F002', flight: 'BA1001' },
  { crewId: 'C003', flight: 'AA2110' },           // Carter A330 — clean for this leg
  { crewId: 'C003', flight: 'AA2111' },           // back-to-back transatlantic → fdp_exceeded + flight_time_exceeded
  { crewId: 'F003', flight: 'AA2110' },
  { crewId: 'F003', flight: 'AA2111' },
  { crewId: 'C004', flight: 'LH4409' },
  { crewId: 'F005', flight: 'LH4409' },
  { crewId: 'C003', flight: 'LH4410' },           // Carter A330 on A380 → unqualified + chain break
  { crewId: 'C005', flight: 'EK5499' },
  // EK5500 left intentionally unstaffed → 2x unstaffed
];

export class MockCrewProvider implements CrewProvider {
  readonly name = 'mock';

  async getRoster()      { return ROSTER; }
  async getAssignments() { return ASSIGNMENTS; }

  async healthCheck(): Promise<ProviderHealthResult> {
    return {
      ok: true,
      recordCount: ROSTER.length + ASSIGNMENTS.length,
      checkedAt: new Date().toISOString(),
    };
  }
}
