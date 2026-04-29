/**
 * Mock tail rotation data for the cascade simulator.
 * Real airlines source this from the fleet plan / OPSCALE; we build a
 * small daily-tail-pattern that's enough to exercise the cascade logic.
 *
 * Each tail flies a sequence of legs with documented STD/STA. The
 * cascade calc walks the chain forward applying min ground time.
 */

export interface Leg {
  flight: string;
  origin: string;
  destination: string;
  std: string;     // ISO time HH:MM
  sta: string;     // ISO time HH:MM
  paxLoad: number;
}

export interface TailRotation {
  tail: string;
  aircraft: string;
  /** Minimum turnaround on ground in minutes. Widebody intl: 90. Narrowbody: 45. */
  minGroundMin: number;
  legs: Leg[];
}

/**
 * Today's planned rotations. Times are local-clock (we ignore TZ for the demo).
 * Connects to the same flight numbers used by the planner mock list so the
 * cascade simulator can pick them by flight number.
 */
export const ROTATIONS: TailRotation[] = [
  {
    tail: 'G-XLEK',
    aircraft: 'Boeing 777-300ER',
    minGroundMin: 90,
    legs: [
      { flight: 'BA1000', origin: 'JFK', destination: 'LHR', std: '09:45', sta: '21:30', paxLoad: 287 },
      { flight: 'BA1001', origin: 'LHR', destination: 'JFK', std: '23:15', sta: '02:00', paxLoad: 273 },
    ],
  },
  {
    tail: 'N801AA',
    aircraft: 'Airbus A330-300',
    minGroundMin: 75,
    legs: [
      { flight: 'AA2110', origin: 'CDG', destination: 'JFK', std: '06:00', sta: '08:30', paxLoad: 251 },
      { flight: 'AA2111', origin: 'JFK', destination: 'CDG', std: '11:15', sta: '23:50', paxLoad: 244 },
    ],
  },
  {
    tail: 'D-AIMA',
    aircraft: 'Airbus A380-800',
    minGroundMin: 120,
    legs: [
      { flight: 'LH4409', origin: 'FRA', destination: 'JFK', std: '08:00', sta: '11:15', paxLoad: 472 },
      { flight: 'LH4410', origin: 'JFK', destination: 'FRA', std: '14:00', sta: '03:30', paxLoad: 489 },
    ],
  },
  {
    tail: 'A6-EUC',
    aircraft: 'Airbus A380-800',
    minGroundMin: 120,
    legs: [
      { flight: 'EK5499', origin: 'DXB', destination: 'JFK', std: '09:00', sta: '14:00', paxLoad: 510 },
      { flight: 'EK5500', origin: 'JFK', destination: 'DXB', std: '16:30', sta: '13:30', paxLoad: 502 },
    ],
  },
];

/**
 * Mock maintenance windows. The tail is unavailable for operation between
 * `startHHMM` and `endHHMM` local-clock at `airport`. A leg conflicts with a
 * window when its STD or STA falls inside the interval. Real airlines source
 * this from the maintenance scheduling system (AMOS / TRAX maintenance
 * planner). Times use the same simplified local-clock model as `Leg`.
 */
export interface MaintenanceWindow {
  tail: string;
  airport: string;
  startHHMM: string;
  endHHMM: string;
  reason: string;
}

export const MAINTENANCE_WINDOWS: MaintenanceWindow[] = [
  // Conflicts with BA1001 STD 23:15 LHR (window covers the departure slot)
  { tail: 'G-XLEK', airport: 'LHR', startHHMM: '22:30', endHHMM: '23:59', reason: 'A-check tail compass swing' },
  // Non-conflicting overnight check on N801AA at JFK
  { tail: 'N801AA', airport: 'JFK', startHHMM: '03:00', endHHMM: '06:00', reason: 'tire change' },
];

export function findRotationByFlight(flightNumber: string): { rotation: TailRotation; legIndex: number } | undefined {
  for (const r of ROTATIONS) {
    const i = r.legs.findIndex((l) => l.flight === flightNumber);
    if (i >= 0) return { rotation: r, legIndex: i };
  }
  return undefined;
}

/** Parse HH:MM into minutes since 00:00 local. Wrap-around handled at caller. */
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Format minutes since 00:00 back into HH:MM (mod 1440 for wrap). */
export function minToHhmm(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
