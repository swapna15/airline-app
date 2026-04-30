/**
 * Frontend-only display + adapter helpers around the canonical Flight schema.
 *
 * The canonical schema (shared/schema/flight.ts) is intentionally low-level:
 *   - separate `carrier` + `flightNumber` (so external systems can match)
 *   - ISO 8601 `scheduledDeparture` (so timezone is unambiguous)
 *
 * These helpers spell those out for UI surfaces.
 */

import type { OwnFlight } from '@shared/schema/flight';

/** 'BA' + '1000' → 'BA1000'. */
export function displayFlightNo(f: Pick<OwnFlight, 'carrier' | 'flightNumber'>): string {
  return `${f.carrier}${f.flightNumber}`;
}

/** ISO 8601 → 'HH:MM' in the local timezone of the user's browser. */
export function displayDepartureTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** "today at HH:MM" → ISO 8601 with the browser's local TZ offset baked in.
 *  Used by mock data so the same string keeps meaning "today" each day the
 *  module is loaded. */
export function todayAt(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Minutes between now and the flight's scheduled departure. Negative if past. */
export function minutesUntilDeparture(f: Pick<OwnFlight, 'scheduledDeparture'>): number {
  const dep = new Date(f.scheduledDeparture).getTime();
  return Math.round((dep - Date.now()) / 60000);
}
