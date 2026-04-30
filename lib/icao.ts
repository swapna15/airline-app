/**
 * Airport reference data sourced from OurAirports.
 * Regenerate with `node scripts/import-ourairports.mjs`.
 *
 * The JSON contains all type=large/medium airports with at least one
 * paved runway ≥ 6,000 ft (~3,500 entries). Some fields are heuristic —
 * see the import script for details. For prod ETOPS-grade alternates,
 * swap this for Jeppesen.
 */
import airportsJson from './airports.json';

export interface AirportRef {
  iata: string;       // may be '' for ICAO-only entries
  icao: string;
  name: string;
  country: string;    // ISO 3166-1 alpha-2 (e.g. 'US', 'GB', 'JP')
  lat: number;
  lon: number;
  runwayLengthFt: number;
  /** ICAO RFF category 1–10. From scripts/airport-supplements.json when
   *  dataQuality === 'verified', else heuristic (large=9, medium=7). */
  fireCat: number;
  /** Whether the airport has 24-hour customs. From the supplement file when
   *  verified, else the (scheduled-service AND large) heuristic. */
  customs: boolean;
  /** @deprecated Use fuelTypes (array). Single-grade kept for back-compat. */
  fuel: 'jet-a' | 'jet-a1' | 'none';
  /** Available fuel grades. May be empty if the airport offers none. */
  fuelTypes: string[];
  /** Heuristic ETOPS-alternate flag: large_airport + scheduled_service +
   *  ≥ 7,500 ft lit paved runway. Real ETOPS-rated alternates also need
   *  24h customs/RFF/CAT II ILS — replace with Jeppesen for prod. */
  etopsAlternate: boolean;
  /** 'verified' if this airport's fireCat / customs / fuelTypes came from
   *  scripts/airport-supplements.json; 'heuristic' if derived from
   *  OurAirports size + scheduled_service. */
  dataQuality: 'verified' | 'heuristic';
}

const ALL: AirportRef[] = airportsJson as AirportRef[];

// Index by IATA and ICAO so callers can pass either.
const BY_KEY: Map<string, AirportRef> = (() => {
  const m = new Map<string, AirportRef>();
  for (const a of ALL) {
    if (a.iata) m.set(a.iata, a);
    m.set(a.icao, a);
  }
  return m;
})();

/** Look up by IATA or ICAO (case-insensitive). */
export function lookupAirport(code: string): AirportRef | undefined {
  return BY_KEY.get(code.toUpperCase());
}

export function iataToIcao(iata: string): string | undefined {
  return BY_KEY.get(iata.toUpperCase())?.icao;
}

export function listAirports(): AirportRef[] {
  return ALL;
}
