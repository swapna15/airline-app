/**
 * Canonical aircraft-type ontology — single source of truth for resolving
 * any aircraft name (ICAO, IATA, marketing, family, manufacturer-prefixed,
 * with/without dashes/spaces/variant suffix) into a single record.
 *
 * Closes the design-doc §4.2 "semantic layer" requirement: instead of every
 * consumer (planner phase, ETOPS check, perf table, OpsSpecs match)
 * substring-matching their own variant of the aircraft string, they all call
 * `resolveAircraftType(input)` and operate on the canonical record.
 *
 * Design notes:
 *   - One row per ICAO type code (the IATA standard primary key for aircraft).
 *   - `aliases` lists every spelling we've seen in operator data (Boeing 777
 *     vs 777-300ER vs 77W). Adding a new spelling = one line edit, no logic
 *     change anywhere.
 *   - Performance numbers (kg/hr, Mach, MTOW) live here, replacing the smaller
 *     PERF_TABLE in lib/perf.ts. Tenants needing tail-level deltas will layer
 *     on top per .claude/specs/flight_planning_design.md §3.2 ("performance
 *     is typically tied to type with per-tail deltas").
 *   - Family token ('777', 'A330', '737NG') lets OpsSpecs authorize whole
 *     families with one entry instead of every variant.
 */

/**
 * Per-type ETOPS critical-fuel performance. These factors scale the normal
 * 2-engine cruise per-NM burn to the per-NM burn at the given failure
 * scenario's altitude and configuration.
 *
 * Real dispatch consumes the operator's Boeing PEP / Airbus PEP per-tail
 * tables, which take weight, altitude, ISA-deviation, and configuration as
 * inputs. The factors here are first-pass type-level approximations sourced
 * from manufacturer training material and IVAO/SmartCockpit references — when
 * a tenant plugs in a real PEP integration, these get overridden per tail.
 */
export interface EtopsPerformance {
  /** Per-NM fuel burn ratio at engine-out cruise (typically FL220) vs 2-engine cruise. */
  engineOutBurnFactor: number;
  /** Per-NM fuel burn ratio after rapid depress, descent to FL100, both engines running. */
  depressBurnFactor: number;
  /** Per-NM fuel burn ratio at FL100 single-engine — the worst case. */
  bothBurnFactor: number;
  /** Max altitude after engine failure (FL units). FL220 typical for widebody, FL170 narrowbody. */
  engineOutCeilingFL: number;
  /** Cargo fire suppression time in minutes — bounds the EP-to-alt time per FAR 121 App. P. */
  cargoFireSuppressionMin?: number;
  /** Provenance — 'first-pass' = type-level estimate, 'PEP' = real Boeing/Airbus table. */
  source: 'first-pass' | 'PEP' | 'manufacturer';
}

export interface AircraftType {
  /** ICAO type designator — primary key (e.g., 'B77W'). */
  icao: string;
  /** IATA aircraft code (e.g., '77W'). May be absent for newer types. */
  iata?: string;
  /** Family group — used by OpsSpecs to authorize "all 777s" with one entry. */
  family: string;
  manufacturer: 'Boeing' | 'Airbus' | 'Embraer' | 'Bombardier' | 'McDonnell Douglas' | 'Other';
  /** Human-readable marketing name. */
  marketingName: string;
  /**
   * Every spelling we've ever seen in operator/feed data. Case + dashes +
   * spaces are normalized away when indexing, so 'Boeing 777-300ER',
   * 'Boeing777-300ER', 'BOEING-777-300ER' all match the same alias.
   */
  aliases: string[];

  /** Engine count drives ETOPS applicability. */
  engineCount: 2 | 3 | 4;
  /** Default ETOPS-rated capability (real authorization is per-tail per OpsSpec B044). */
  defaultEtopsCapable: boolean;

  // Performance — replaces lib/perf.ts PERF_TABLE.
  cruiseBurnKgPerHr: number;
  cruiseMach: number;
  mtowKg: number;

  /** Per-type ETOPS critical-fuel performance. Present for ETOPS-capable twins; absent otherwise. */
  etopsPerf?: EtopsPerformance;
}

export const AIRCRAFT_TYPES: AircraftType[] = [
  // ── 777 family ───────────────────────────────────────────────────────────
  // Widebody twins: engine-out at FL220, cargo fire suppression 195 min.
  // Numbers from Boeing FCTM / IVAO ETOPS guidance.
  {
    icao: 'B77W', iata: '77W', family: '777', manufacturer: 'Boeing',
    marketingName: 'Boeing 777-300ER',
    aliases: ['Boeing 777-300ER', 'B777-300ER', '777-300ER', 'Boeing 777', '777'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 7500, cruiseMach: 0.84, mtowKg: 351_500,
    etopsPerf: {
      engineOutBurnFactor: 1.05, depressBurnFactor: 2.55, bothBurnFactor: 1.65,
      engineOutCeilingFL: 220, cargoFireSuppressionMin: 195, source: 'first-pass',
    },
  },
  {
    icao: 'B772', iata: '772', family: '777', manufacturer: 'Boeing',
    marketingName: 'Boeing 777-200ER',
    aliases: ['Boeing 777-200ER', '777-200ER', 'Boeing 777-200', '777-200'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 7300, cruiseMach: 0.84, mtowKg: 297_550,
    etopsPerf: {
      engineOutBurnFactor: 1.05, depressBurnFactor: 2.55, bothBurnFactor: 1.65,
      engineOutCeilingFL: 220, cargoFireSuppressionMin: 195, source: 'first-pass',
    },
  },
  {
    icao: 'B77L', iata: '77L', family: '777', manufacturer: 'Boeing',
    marketingName: 'Boeing 777-200LR',
    aliases: ['Boeing 777-200LR', '777-200LR'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 7600, cruiseMach: 0.84, mtowKg: 347_500,
    etopsPerf: {
      engineOutBurnFactor: 1.05, depressBurnFactor: 2.55, bothBurnFactor: 1.65,
      engineOutCeilingFL: 220, cargoFireSuppressionMin: 330, source: 'first-pass',
    },
  },
  {
    icao: 'B779', iata: '779', family: '777', manufacturer: 'Boeing',
    marketingName: 'Boeing 777-9',
    aliases: ['Boeing 777-9', 'Boeing 777X', '777X', '777-9'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 8200, cruiseMach: 0.84, mtowKg: 351_500,
    etopsPerf: {
      engineOutBurnFactor: 1.05, depressBurnFactor: 2.55, bothBurnFactor: 1.65,
      engineOutCeilingFL: 220, cargoFireSuppressionMin: 330, source: 'first-pass',
    },
  },
  // ── 787 family ───────────────────────────────────────────────────────────
  // 787 has electric (not bleed) ECS — slightly more efficient at FL100 depress.
  // Cargo fire 330 min (one of the longest in service).
  {
    icao: 'B788', iata: '788', family: '787', manufacturer: 'Boeing',
    marketingName: 'Boeing 787-8',
    aliases: ['Boeing 787-8', '787-8'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 5300, cruiseMach: 0.85, mtowKg: 227_930,
    etopsPerf: {
      engineOutBurnFactor: 1.00, depressBurnFactor: 2.45, bothBurnFactor: 1.60,
      engineOutCeilingFL: 240, cargoFireSuppressionMin: 330, source: 'first-pass',
    },
  },
  {
    icao: 'B789', iata: '789', family: '787', manufacturer: 'Boeing',
    marketingName: 'Boeing 787-9',
    aliases: ['Boeing 787-9', '787-9', 'Boeing 787', '787'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 5400, cruiseMach: 0.85, mtowKg: 254_000,
    etopsPerf: {
      engineOutBurnFactor: 1.00, depressBurnFactor: 2.45, bothBurnFactor: 1.60,
      engineOutCeilingFL: 240, cargoFireSuppressionMin: 330, source: 'first-pass',
    },
  },
  {
    icao: 'B78X', iata: '78X', family: '787', manufacturer: 'Boeing',
    marketingName: 'Boeing 787-10',
    aliases: ['Boeing 787-10', '787-10'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 5600, cruiseMach: 0.85, mtowKg: 254_000,
    etopsPerf: {
      engineOutBurnFactor: 1.00, depressBurnFactor: 2.45, bothBurnFactor: 1.60,
      engineOutCeilingFL: 240, cargoFireSuppressionMin: 330, source: 'first-pass',
    },
  },
  // ── 747 family ───────────────────────────────────────────────────────────
  {
    icao: 'B744', iata: '744', family: '747', manufacturer: 'Boeing',
    marketingName: 'Boeing 747-400',
    aliases: ['Boeing 747-400', '747-400', 'Boeing 747', '747'],
    engineCount: 4, defaultEtopsCapable: false,
    cruiseBurnKgPerHr: 11_000, cruiseMach: 0.85, mtowKg: 396_900,
  },
  {
    icao: 'B748', iata: '748', family: '747', manufacturer: 'Boeing',
    marketingName: 'Boeing 747-8',
    aliases: ['Boeing 747-8', '747-8I', '747-8'],
    engineCount: 4, defaultEtopsCapable: false,
    cruiseBurnKgPerHr: 11_500, cruiseMach: 0.86, mtowKg: 447_700,
  },
  // ── 737 family ───────────────────────────────────────────────────────────
  // Narrowbody twins: lower engine-out ceiling (FL170-200), cargo fire 60 min.
  // ETOPS for 737NG is 180 min (ETOPS-180); the same factors apply.
  {
    icao: 'B738', iata: '738', family: '737', manufacturer: 'Boeing',
    marketingName: 'Boeing 737-800',
    aliases: ['Boeing 737-800', '737-800', '737NG', 'Boeing 737NG', 'Boeing 737', '737'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 2500, cruiseMach: 0.78, mtowKg: 79_000,
    etopsPerf: {
      engineOutBurnFactor: 1.20, depressBurnFactor: 2.30, bothBurnFactor: 1.75,
      engineOutCeilingFL: 200, cargoFireSuppressionMin: 60, source: 'first-pass',
    },
  },
  {
    icao: 'B739', iata: '739', family: '737', manufacturer: 'Boeing',
    marketingName: 'Boeing 737-900',
    aliases: ['Boeing 737-900', '737-900'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 2600, cruiseMach: 0.78, mtowKg: 79_000,
    etopsPerf: {
      engineOutBurnFactor: 1.20, depressBurnFactor: 2.30, bothBurnFactor: 1.75,
      engineOutCeilingFL: 200, cargoFireSuppressionMin: 60, source: 'first-pass',
    },
  },
  {
    icao: 'B38M', iata: '7M8', family: '737', manufacturer: 'Boeing',
    marketingName: 'Boeing 737 MAX 8',
    aliases: ['Boeing 737 MAX 8', '737 MAX 8', '737-8', 'Boeing 737-8'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 2300, cruiseMach: 0.79, mtowKg: 82_200,
    etopsPerf: {
      engineOutBurnFactor: 1.18, depressBurnFactor: 2.30, bothBurnFactor: 1.72,
      engineOutCeilingFL: 210, cargoFireSuppressionMin: 60, source: 'first-pass',
    },
  },
  // ── A330 family ──────────────────────────────────────────────────────────
  // ETOPS-240 (A330) and ETOPS-370 (A350). Cargo fire 240-330 min.
  {
    icao: 'A332', iata: '332', family: 'A330', manufacturer: 'Airbus',
    marketingName: 'Airbus A330-200',
    aliases: ['Airbus A330-200', 'A330-200'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 5500, cruiseMach: 0.82, mtowKg: 230_000,
    etopsPerf: {
      engineOutBurnFactor: 1.08, depressBurnFactor: 2.50, bothBurnFactor: 1.68,
      engineOutCeilingFL: 230, cargoFireSuppressionMin: 240, source: 'first-pass',
    },
  },
  {
    icao: 'A333', iata: '333', family: 'A330', manufacturer: 'Airbus',
    marketingName: 'Airbus A330-300',
    aliases: ['Airbus A330-300', 'A330-300', 'Airbus A330', 'A330'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 5800, cruiseMach: 0.82, mtowKg: 233_000,
    etopsPerf: {
      engineOutBurnFactor: 1.08, depressBurnFactor: 2.50, bothBurnFactor: 1.68,
      engineOutCeilingFL: 230, cargoFireSuppressionMin: 240, source: 'first-pass',
    },
  },
  {
    icao: 'A339', iata: '339', family: 'A330', manufacturer: 'Airbus',
    marketingName: 'Airbus A330-900',
    aliases: ['Airbus A330-900', 'A330-900', 'A330neo', 'Airbus A330neo'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 5400, cruiseMach: 0.82, mtowKg: 251_000,
    etopsPerf: {
      engineOutBurnFactor: 1.05, depressBurnFactor: 2.45, bothBurnFactor: 1.65,
      engineOutCeilingFL: 240, cargoFireSuppressionMin: 240, source: 'first-pass',
    },
  },
  // ── A350 family ──────────────────────────────────────────────────────────
  // A350 has ETOPS-370 capability — the longest in service. Higher cruise alt.
  {
    icao: 'A359', iata: '359', family: 'A350', manufacturer: 'Airbus',
    marketingName: 'Airbus A350-900',
    aliases: ['Airbus A350-900', 'A350-900', 'Airbus A350', 'A350'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 5800, cruiseMach: 0.85, mtowKg: 280_000,
    etopsPerf: {
      engineOutBurnFactor: 1.02, depressBurnFactor: 2.40, bothBurnFactor: 1.62,
      engineOutCeilingFL: 250, cargoFireSuppressionMin: 330, source: 'first-pass',
    },
  },
  {
    icao: 'A35K', iata: '351', family: 'A350', manufacturer: 'Airbus',
    marketingName: 'Airbus A350-1000',
    aliases: ['Airbus A350-1000', 'A350-1000'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 6300, cruiseMach: 0.85, mtowKg: 319_000,
    etopsPerf: {
      engineOutBurnFactor: 1.02, depressBurnFactor: 2.40, bothBurnFactor: 1.62,
      engineOutCeilingFL: 250, cargoFireSuppressionMin: 330, source: 'first-pass',
    },
  },
  // ── A380 ─────────────────────────────────────────────────────────────────
  {
    icao: 'A388', iata: '388', family: 'A380', manufacturer: 'Airbus',
    marketingName: 'Airbus A380-800',
    aliases: ['Airbus A380-800', 'A380-800', 'Airbus A380', 'A380'],
    engineCount: 4, defaultEtopsCapable: false,
    cruiseBurnKgPerHr: 11_000, cruiseMach: 0.85, mtowKg: 575_000,
  },
  // ── A340 ─────────────────────────────────────────────────────────────────
  {
    icao: 'A343', iata: '343', family: 'A340', manufacturer: 'Airbus',
    marketingName: 'Airbus A340-300',
    aliases: ['Airbus A340-300', 'A340-300', 'Airbus A340', 'A340'],
    engineCount: 4, defaultEtopsCapable: false,
    cruiseBurnKgPerHr: 6800, cruiseMach: 0.82, mtowKg: 275_000,
  },
  // ── A320 family ──────────────────────────────────────────────────────────
  // ETOPS-180 typical for A320/A321. Narrowbody figures similar to 737.
  {
    icao: 'A319', iata: '319', family: 'A320', manufacturer: 'Airbus',
    marketingName: 'Airbus A319',
    aliases: ['Airbus A319', 'A319'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 2300, cruiseMach: 0.78, mtowKg: 75_500,
    etopsPerf: {
      engineOutBurnFactor: 1.18, depressBurnFactor: 2.28, bothBurnFactor: 1.72,
      engineOutCeilingFL: 200, cargoFireSuppressionMin: 60, source: 'first-pass',
    },
  },
  {
    icao: 'A320', iata: '320', family: 'A320', manufacturer: 'Airbus',
    marketingName: 'Airbus A320',
    aliases: ['Airbus A320', 'A320'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 2500, cruiseMach: 0.78, mtowKg: 78_000,
    etopsPerf: {
      engineOutBurnFactor: 1.18, depressBurnFactor: 2.28, bothBurnFactor: 1.72,
      engineOutCeilingFL: 200, cargoFireSuppressionMin: 60, source: 'first-pass',
    },
  },
  {
    icao: 'A321', iata: '321', family: 'A320', manufacturer: 'Airbus',
    marketingName: 'Airbus A321',
    aliases: ['Airbus A321', 'A321'],
    engineCount: 2, defaultEtopsCapable: true,
    cruiseBurnKgPerHr: 2700, cruiseMach: 0.78, mtowKg: 93_500,
    etopsPerf: {
      engineOutBurnFactor: 1.18, depressBurnFactor: 2.30, bothBurnFactor: 1.74,
      engineOutCeilingFL: 195, cargoFireSuppressionMin: 60, source: 'first-pass',
    },
  },
  // ── Tri-jets / regionals ─────────────────────────────────────────────────
  {
    icao: 'MD11', iata: 'M11', family: 'MD-11', manufacturer: 'McDonnell Douglas',
    marketingName: 'McDonnell Douglas MD-11',
    aliases: ['McDonnell Douglas MD-11', 'MD-11', 'MD11'],
    engineCount: 3, defaultEtopsCapable: false,
    cruiseBurnKgPerHr: 8000, cruiseMach: 0.83, mtowKg: 285_000,
  },
  {
    icao: 'E190', iata: 'E90', family: 'E-Jet', manufacturer: 'Embraer',
    marketingName: 'Embraer E190',
    aliases: ['Embraer E190', 'E190', 'ERJ-190'],
    engineCount: 2, defaultEtopsCapable: false,
    cruiseBurnKgPerHr: 1700, cruiseMach: 0.78, mtowKg: 51_800,
  },
  {
    icao: 'CRJ9', iata: 'CR9', family: 'CRJ', manufacturer: 'Bombardier',
    marketingName: 'Bombardier CRJ-900',
    aliases: ['Bombardier CRJ-900', 'CRJ-900', 'CRJ900'],
    engineCount: 2, defaultEtopsCapable: false,
    cruiseBurnKgPerHr: 1500, cruiseMach: 0.78, mtowKg: 38_300,
  },
];

/** Normalize any aircraft string for index lookup. */
function norm(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
}

// Build the alias index once at module load.
const BY_ALIAS: Map<string, AircraftType> = (() => {
  const m = new Map<string, AircraftType>();
  for (const t of AIRCRAFT_TYPES) {
    m.set(norm(t.icao), t);
    if (t.iata) m.set(norm(t.iata), t);
    for (const a of t.aliases) m.set(norm(a), t);
  }
  return m;
})();

/** Build a family→default-type map so 'Boeing 777' resolves consistently. */
const FAMILY_DEFAULT: Map<string, AircraftType> = (() => {
  const m = new Map<string, AircraftType>();
  // Default per family is whichever entry lists the bare family token
  // (e.g., '777', 'A330') as one of its aliases. We pick the first.
  for (const t of AIRCRAFT_TYPES) {
    const famKey = norm(t.family);
    if (m.has(famKey)) continue;
    if (t.aliases.some((a) => norm(a) === famKey)) m.set(famKey, t);
  }
  // Fallback: any record matching the family name even without bare alias.
  for (const t of AIRCRAFT_TYPES) {
    const famKey = norm(t.family);
    if (!m.has(famKey)) m.set(famKey, t);
  }
  return m;
})();

/**
 * Resolve any aircraft string (ICAO, IATA, marketing, family) to its
 * canonical record. Returns undefined if no match.
 *
 * Resolution order:
 *   1. Exact alias match (case + dash + space insensitive)
 *   2. Family substring — 'Boeing 777' → '777' family default
 */
export function resolveAircraftType(input: string | undefined | null): AircraftType | undefined {
  if (!input) return undefined;
  const n = norm(input);
  const exact = BY_ALIAS.get(n);
  if (exact) return exact;
  // Walk families longest-first so 'A380' isn't matched by 'A38' inside 'A380' etc.
  const families = Array.from(FAMILY_DEFAULT.keys()).sort((a, b) => b.length - a.length);
  for (const fam of families) {
    if (n.includes(fam)) return FAMILY_DEFAULT.get(fam);
  }
  return undefined;
}

/**
 * OpsSpecs authorizedTypes membership check. The list can mix ICAO codes
 * (B77W), family tokens (777), and marketing names — all are resolved
 * through the same ontology.
 */
export function isTypeAuthorized(
  aircraft: { aircraftIcao?: string | null; aircraftType?: string | null } | string | undefined | null,
  authorizedTypes: string[],
): boolean {
  if (!authorizedTypes || authorizedTypes.length === 0) return true; // empty list = no restriction
  const candidate = typeof aircraft === 'string'
    ? resolveAircraftType(aircraft)
    : resolveAircraftType(aircraft?.aircraftIcao ?? aircraft?.aircraftType ?? '');
  if (!candidate) return false;
  return authorizedTypes.some((entry) => {
    const e = resolveAircraftType(entry);
    if (e) return e.icao === candidate.icao || e.family === candidate.family;
    // Plain family-name entry that didn't resolve (e.g., a brand-new type
    // not yet in the ontology) — match against family code or string.
    return norm(entry) === norm(candidate.family) || norm(entry) === norm(candidate.icao);
  });
}

export function isTwinEngine(aircraft: string | undefined | null): boolean {
  return resolveAircraftType(aircraft)?.engineCount === 2;
}

export function aircraftLabel(t: AircraftType | undefined | null, fallback: string): string {
  return t?.marketingName ?? fallback;
}

/**
 * Last-resort defaults for unrecognized aircraft strings. Used by the
 * fuel-estimate path so a typo in the marketing string doesn't break
 * dispatch — better to plan with conservative numbers than to fall over.
 */
export const DEFAULT_AIRCRAFT_PERFORMANCE = {
  cruiseBurnKgPerHr: 6500,
  cruiseMach: 0.82,
  mtowKg: 250_000,
} as const;

/** Returns the resolved record's perf, or conservative defaults. */
export function aircraftPerformance(input: string | undefined | null): {
  cruiseBurnKgPerHr: number; cruiseMach: number; mtowKg: number;
} {
  const t = resolveAircraftType(input);
  if (t) {
    return {
      cruiseBurnKgPerHr: t.cruiseBurnKgPerHr,
      cruiseMach: t.cruiseMach,
      mtowKg: t.mtowKg,
    };
  }
  return DEFAULT_AIRCRAFT_PERFORMANCE;
}

/**
 * Conservative ETOPS-perf defaults for types lacking an etopsPerf entry —
 * used when an unrecognized twin or non-ETOPS type is queried so the
 * critical-fuel calc still produces a number rather than NaN.
 */
export const DEFAULT_ETOPS_PERFORMANCE: EtopsPerformance = {
  engineOutBurnFactor: 1.10,
  depressBurnFactor:   1.40,
  bothBurnFactor:      1.70,
  engineOutCeilingFL:  220,
  source: 'first-pass',
};

/**
 * Returns the resolved type's per-NM ETOPS factors, or the conservative
 * defaults. Includes a `resolved` flag so callers (like the planner UI) can
 * surface whether they're operating on real per-type numbers or the fallback.
 */
export function aircraftEtopsPerf(input: string | undefined | null): {
  perf: EtopsPerformance;
  resolved: boolean;
  typeIcao?: string;
} {
  const t = resolveAircraftType(input);
  if (t?.etopsPerf) return { perf: t.etopsPerf, resolved: true, typeIcao: t.icao };
  return { perf: DEFAULT_ETOPS_PERFORMANCE, resolved: false, typeIcao: t?.icao };
}
