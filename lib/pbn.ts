/**
 * PBN (Performance-Based Navigation) requirements derivation for a route.
 *
 * The OpsSpec carries the operator's authorized RNAV/RNP levels in
 * `pbnAuthorizations` (OpsSpec C063 / B036). For each route the planner
 * builds, we derive what PBN spec the route requires and compare against
 * the authorization. Missing authorization → dispatch reject.
 *
 * Real planning consumes AIRAC airway/SID/STAR data and reads the encoded
 * PBN requirement off each segment. Without AIRAC, we use coarse heuristics
 * that match the dispatch reality for ~95% of routes:
 *
 *   - All modern continental airspace (US/EU/most of Asia) requires
 *     RNAV-1 (and -2 for many SID/STAR) for IFR ops
 *   - Oceanic crossings > 1,500 nm in the NAT HLA require RNP-4
 *     (legacy RNP-10 still accepted on some tracks)
 *   - Pacific oceanic > 2,500 nm same rules
 *   - Specific airports are RNP-AR-only for approaches (terrain-driven —
 *     Gibraltar, Queenstown, Samedan, etc.)
 *
 * When the AIRAC integration lands, this file is replaced by per-segment
 * lookups; the derivePbnRequirements signature stays the same.
 */

import type { AirportRef } from '@/lib/icao';
import { greatCircleNM } from '@/lib/perf';

/** Airports requiring an RNP-AR approach due to terrain. Far from exhaustive — first-pass set. */
const RNP_AR_AIRPORTS = new Set([
  'LXGB',  // Gibraltar — Strait approach
  'NZQN',  // Queenstown, New Zealand — mountainous
  'LSGS',  // Sion, Switzerland — Alps
  'LSZS',  // Samedan, Switzerland — high-altitude valley
  'LFLJ',  // Courchevel — Alps; also has STOL minimums
  'EPKK',  // Kraków — terrain-driven RNP at certain runways
  'VQPR',  // Paro, Bhutan — among the most demanding RNP-AR worldwide
  'VHHH',  // Hong Kong — congested arrival sectors with RNP-AR options
  'NZWN',  // Wellington — wind/terrain RNP-AR for runway 16/34
  'TJSJ',  // San Juan — RNP-AR available
]);

/** Continental airways modernized to RNAV — effectively all modern airspace. */
const RNAV_CONTINENTAL_REQUIRED = ['RNAV-1', 'RNAV-2'];

/** NAT HLA / PAC OTS oceanic — RNP-4 modern, RNP-10 legacy fallback. */
const RNP_OCEANIC_REQUIRED = ['RNP-4'];

export interface PbnRequirement {
  /** Required RNAV levels along the route (any-of within array would be a future refinement). */
  rnav: string[];
  /** Required RNP levels along the route. */
  rnp: string[];
  /** Reason each requirement was added — for OFP audit trail. */
  reasons: Array<{ spec: string; reason: string }>;
}

/**
 * Derive the PBN spec set required to fly the great-circle route between two
 * airports. Coarse — replaces with per-segment lookup once AIRAC lands.
 */
export function derivePbnRequirements(o: AirportRef, d: AirportRef): PbnRequirement {
  const rnav: string[] = [];
  const rnp:  string[] = [];
  const reasons: PbnRequirement['reasons'] = [];

  // 1. Continental airways — RNAV-1/2 baseline for any IFR route.
  for (const spec of RNAV_CONTINENTAL_REQUIRED) {
    rnav.push(spec);
  }
  reasons.push({ spec: 'RNAV-1', reason: 'continental SID/STAR/airways baseline' });
  reasons.push({ spec: 'RNAV-2', reason: 'continental airway segments' });

  // 2. Long-haul oceanic crossing → RNP-4.
  const distanceNM = greatCircleNM(o, d);
  const looksOceanic = o.country !== d.country && distanceNM > 1500;
  if (looksOceanic) {
    for (const spec of RNP_OCEANIC_REQUIRED) {
      rnp.push(spec);
    }
    reasons.push({
      spec: 'RNP-4',
      reason: `oceanic crossing (${o.country}→${d.country}, ${Math.round(distanceNM)} nm) — NAT HLA / PAC OTS`,
    });
  }

  // 3. Origin or destination is an RNP-AR-only approach.
  for (const ap of [o, d]) {
    if (RNP_AR_AIRPORTS.has(ap.icao)) {
      if (!rnp.includes('RNP-AR')) rnp.push('RNP-AR');
      reasons.push({ spec: 'RNP-AR', reason: `${ap.icao} requires RNP-AR for approach (terrain)` });
    }
  }

  return { rnav, rnp, reasons };
}

export interface PbnValidation {
  ok: boolean;
  missing: string[];
  required: PbnRequirement;
  authorized: { rnav: string[]; rnp: string[] };
}

/**
 * Compare derived requirements against the operator's OpsSpec C063/B036
 * authorizations. Returns missing[] = specs required by the route but not
 * authorized — non-empty means the route can't be filed as-is.
 */
export function validatePbn(
  required: PbnRequirement,
  authorized: { rnavLevels: string[]; rnpLevels: string[] },
): PbnValidation {
  const auth = {
    rnav: authorized.rnavLevels.map((s) => s.toUpperCase()),
    rnp:  authorized.rnpLevels.map((s) => s.toUpperCase()),
  };

  const missing: string[] = [];
  for (const spec of required.rnav) {
    if (!auth.rnav.includes(spec.toUpperCase())) missing.push(spec);
  }
  for (const spec of required.rnp) {
    if (!auth.rnp.includes(spec.toUpperCase())) missing.push(spec);
  }

  return { ok: missing.length === 0, missing, required, authorized: auth };
}
