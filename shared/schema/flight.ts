/**
 * Canonical Flight schema — single source of truth for both the Next.js
 * frontend and AWS Lambda backend.
 *
 * Two domains live under the same shape via a discriminated union:
 *
 *   - source: 'own'    — flights this airline operates. Stored in the
 *                        Postgres `flights` table. Eligible for planning,
 *                        dispatch, MEL assessment, crew assignment, etc.
 *   - source: 'duffel' — retail inventory aggregated by Duffel for
 *                        passenger search and booking. NOT stored in the
 *                        Postgres `flights` table; fetched on demand.
 *                        Cannot be planned/dispatched.
 *   - source: 'csv'    — flat-file imports (e.g., FMS exports).
 *   - source: 'fms_api' — REST integrations from external FMS / OPSCALE.
 *
 * External integration adapters MUST normalize their input through
 * `flightSchema.parse(...)` so anything downstream can rely on the same
 * shape. Use `flightKey(f)` to match the same flight across sources.
 */

import { z } from 'zod';

// IATA codes are 2 (carrier) / 3 (airport) char strings.
const Iata2 = z.string().regex(/^[A-Z0-9]{2}$/, 'IATA carrier code (2 chars)');
const Iata3 = z.string().regex(/^[A-Z0-9]{3}$/, 'IATA airport code (3 chars)');

// Flight number digits, optionally suffixed with a letter (e.g., "1000", "44A").
const FlightNumber = z.string().regex(/^\d{1,4}[A-Z]?$/, 'flight number digits');

// ISO 8601 with timezone offset. Required so we can compute the local STD
// from any consumer without ambiguity.
const Iso8601WithTz = z.string().refine(
  (s) => !isNaN(Date.parse(s)),
  'must be a parseable ISO 8601 timestamp',
);

const FlightSourceSchema = z.enum(['own', 'duffel', 'csv', 'fms_api']);
export type FlightSource = z.infer<typeof FlightSourceSchema>;

// Common to every source — the minimum needed to identify a flight.
const FlightCoreSchema = z.object({
  /** Stable identifier WITHIN the source (your DB UUID, Duffel offer id, etc.) */
  externalId: z.string().min(1),
  /** 'BA', 'AA', 'EK', ... */
  carrier: Iata2,
  /** '1000', '2111', '4410A' — without the carrier prefix */
  flightNumber: FlightNumber,
  /** ISO 8601 with offset, e.g. '2026-04-30T09:45:00-04:00' */
  scheduledDeparture: Iso8601WithTz,
  scheduledArrival:   Iso8601WithTz,
  origin:      Iata3,
  destination: Iata3,
  /** ICAO aircraft type code, e.g. 'B77W', 'A333' — optional because
   *  retail/Duffel results sometimes only carry IATA equipment. */
  aircraftIcao: z.string().min(2).max(4).optional(),
});

// Operational extension — only meaningful for source: 'own'.
const OwnFlightSchema = FlightCoreSchema.extend({
  source: z.literal('own'),
  /** Tail registration assigned to this flight, e.g. 'G-XLEK'. */
  tail: z.string().optional(),
  /** Planned passenger load. */
  paxLoad: z.number().int().nonnegative().optional(),
});

// Retail extension — Duffel and similar aggregators.
const RetailFlightSchema = FlightCoreSchema.extend({
  source: z.literal('duffel'),
  totalAmount: z.string(),    // Duffel returns price as a decimal string
  currency:    z.string().length(3),
  cabinClass:  z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
});

// Plain external feeds (CSV / FMS REST) — same shape as own, but can be
// promoted to 'own' once the adapter writes a row into the flights table.
const ExternalFlightSchema = FlightCoreSchema.extend({
  source: z.enum(['csv', 'fms_api']),
  tail: z.string().optional(),
  paxLoad: z.number().int().nonnegative().optional(),
});

export const flightSchema = z.discriminatedUnion('source', [
  OwnFlightSchema,
  RetailFlightSchema,
  ExternalFlightSchema,
]);

export type Flight        = z.infer<typeof flightSchema>;
export type OwnFlight     = z.infer<typeof OwnFlightSchema>;
export type RetailFlight  = z.infer<typeof RetailFlightSchema>;
export type ExternalFlight = z.infer<typeof ExternalFlightSchema>;

/**
 * Stable cross-source identity. Two records from different sources represent
 * the same physical flight iff their flightKey()s are equal. Operational
 * deduplication, reconciliation, and matching all use this.
 *
 * Format: '<carrier><flightNumber>-<YYYY-MM-DD>-<origin>-<destination>'
 * Example: 'BA1000-2026-04-30-JFK-LHR'
 */
export function flightKey(f: Pick<Flight, 'carrier' | 'flightNumber' | 'scheduledDeparture' | 'origin' | 'destination'>): string {
  const date = new Date(f.scheduledDeparture).toISOString().slice(0, 10);
  return `${f.carrier}${f.flightNumber}-${date}-${f.origin}-${f.destination}`;
}

/**
 * Branded ID helpers — when only the identifier is needed across the system,
 * use these branded types so a flightId can't be silently confused with a
 * tenantId or a userId at the type level.
 */
export type FlightId = string & { readonly __brand: 'FlightId' };

export function asFlightId(s: string): FlightId {
  if (!s || typeof s !== 'string') {
    throw new Error('flightId must be a non-empty string');
  }
  return s as FlightId;
}
