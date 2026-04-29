import type { Provider } from '../types';

/**
 * Crew roster + flight assignments.
 *
 * Real systems split these across multiple modules (Sabre Crew Pairing,
 * Jeppesen Crew Manager, AIMS, CAE Sabre) — but the dispatcher cares only
 * about: who is on staff today, what flights they're on, and what duty
 * state they're entering. Both `getRoster()` and `getAssignments()` are
 * separately cached so a roster export can refresh weekly while
 * assignments refresh hourly.
 */

export type CrewRole = 'CAP' | 'FO';

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  base: string;
  typeRatings: string[];
  priorFdpMin: number;
  priorFlightTimeMin: number;
  restMinSinceLastDuty: number;

  // ── Optional enterprise fields ────────────────────────────────────────────
  licenseNumber?: string;
  medicalExpiresAt?: string;
  lineCheckExpiresAt?: string;
  status?: 'active' | 'sick' | 'reserve' | 'leave';
  source?: 'mock' | 'csv' | 's3_csv' | 'api_sabre' | 'api_jeppesen' | 'api_aims';
}

export interface CrewAssignment {
  crewId: string;
  flight: string;
}

export interface CrewProvider extends Provider {
  getRoster(): Promise<CrewMember[]>;
  getAssignments(): Promise<CrewAssignment[]>;
}
