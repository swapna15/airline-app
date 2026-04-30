/**
 * Canonical Flight Information Region (FIR) ontology.
 *
 * A FIR is the airspace volume controlled by a single ATC center. ICAO
 * identifies them by 4-letter codes (e.g., KZNY for New York Oceanic,
 * EGTT for London). Same shape as airline.ts and aircraft.ts:
 *
 *   - one row per ICAO FIR code
 *   - aliases[] for all the names you see in the wild
 *   - resolveFir(input) walks the alias index
 *
 * Future consumers:
 *   - SIGMET overlay sidebar (already shows raw firId — add resolved name)
 *   - NOTAM aggregation by FIR (the "all NOTAMs over the Atlantic" view)
 *   - ICAO Flight Plan Item 18 EET/ entries (estimated elapsed time per FIR)
 *   - Oceanic clearance routing (Gander, Shanwick, New York Oceanic, Oakland Oceanic)
 *   - Conflict-zone screening (cross-reference against State Dept / EASA bulletins)
 *
 * Coverage in this seed: major US ARTCCs + Atlantic + Pacific oceanic +
 * principal European FIRs. Real-world dispatch needs ~300 FIRs globally;
 * extend by adding rows.
 */

export type FirRegion =
  | 'CONUS'
  | 'NAT'         // North Atlantic
  | 'PACOTS'      // Pacific Organised Tracks
  | 'EUR'         // Europe
  | 'ASIA'        // Asia
  | 'OCEANIA'
  | 'AFRICA'
  | 'SAM'         // South America
  | 'POLAR'
  | 'OTHER';

export interface Fir {
  /** ICAO FIR/CTA identifier (e.g., 'KZNY'). */
  icao: string;
  /** Marketing name (e.g., 'New York Oceanic'). */
  name: string;
  /** ATC center / control authority (e.g., 'New York ARTCC'). */
  atcCenter: string;
  /** ISO 3166-1 alpha-2 country code controlling this FIR. */
  country: string;
  region: FirRegion;
  /** True if oceanic — separation rules differ (RNP-4/10, CPDLC, ADS-C). */
  oceanic: boolean;
  /** Alternate spellings or codes for resolution. */
  aliases: string[];
}

export const FIRS: Fir[] = [
  // ── CONUS ARTCCs ─────────────────────────────────────────────────────────
  { icao: 'KZNY', name: 'New York',          atcCenter: 'New York ARTCC',     country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZNY', 'New York Center'] },
  { icao: 'KZBW', name: 'Boston',            atcCenter: 'Boston ARTCC',       country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZBW', 'Boston Center'] },
  { icao: 'KZDC', name: 'Washington',        atcCenter: 'Washington ARTCC',   country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZDC', 'Washington Center'] },
  { icao: 'KZJX', name: 'Jacksonville',      atcCenter: 'Jacksonville ARTCC', country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZJX'] },
  { icao: 'KZMA', name: 'Miami',             atcCenter: 'Miami ARTCC',        country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZMA'] },
  { icao: 'KZHU', name: 'Houston',           atcCenter: 'Houston ARTCC',      country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZHU'] },
  { icao: 'KZFW', name: 'Fort Worth',        atcCenter: 'Fort Worth ARTCC',   country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZFW'] },
  { icao: 'KZAB', name: 'Albuquerque',       atcCenter: 'Albuquerque ARTCC',  country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZAB'] },
  { icao: 'KZLA', name: 'Los Angeles',       atcCenter: 'Los Angeles ARTCC',  country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZLA'] },
  { icao: 'KZOA', name: 'Oakland',           atcCenter: 'Oakland ARTCC',      country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZOA', 'Oakland Center'] },
  { icao: 'KZSE', name: 'Seattle',           atcCenter: 'Seattle ARTCC',      country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZSE'] },
  { icao: 'KZAU', name: 'Chicago',           atcCenter: 'Chicago ARTCC',      country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZAU'] },
  { icao: 'KZID', name: 'Indianapolis',      atcCenter: 'Indianapolis ARTCC', country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZID'] },
  { icao: 'KZME', name: 'Memphis',           atcCenter: 'Memphis ARTCC',      country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZME'] },
  { icao: 'KZTL', name: 'Atlanta',           atcCenter: 'Atlanta ARTCC',      country: 'US', region: 'CONUS', oceanic: false, aliases: ['ZTL'] },
  { icao: 'KZAN', name: 'Anchorage',         atcCenter: 'Anchorage ARTCC',    country: 'US', region: 'POLAR', oceanic: false, aliases: ['ZAN'] },

  // ── Atlantic oceanic ────────────────────────────────────────────────────
  { icao: 'KZWY', name: 'New York Oceanic',  atcCenter: 'New York Oceanic',   country: 'US', region: 'NAT',    oceanic: true,  aliases: ['ZWY', 'NY Oceanic'] },
  { icao: 'CZQX', name: 'Gander Oceanic',    atcCenter: 'Gander OACC',        country: 'CA', region: 'NAT',    oceanic: true,  aliases: ['ZQX', 'Gander'] },
  { icao: 'EGGX', name: 'Shanwick Oceanic',  atcCenter: 'Shanwick OACC',      country: 'GB', region: 'NAT',    oceanic: true,  aliases: ['Shanwick', 'NAT-Shanwick'] },
  { icao: 'BIRD', name: 'Reykjavik',         atcCenter: 'Reykjavik OACC',     country: 'IS', region: 'NAT',    oceanic: true,  aliases: ['Reykjavik Oceanic'] },
  { icao: 'LPPO', name: 'Santa Maria Oceanic', atcCenter: 'Santa Maria OACC', country: 'PT', region: 'NAT',    oceanic: true,  aliases: ['Santa Maria'] },

  // ── Pacific oceanic ─────────────────────────────────────────────────────
  { icao: 'KZAK', name: 'Oakland Oceanic',   atcCenter: 'Oakland Oceanic',    country: 'US', region: 'PACOTS', oceanic: true,  aliases: ['ZAK', 'Oakland Oceanic'] },
  { icao: 'PAZA', name: 'Anchorage Oceanic', atcCenter: 'Anchorage Oceanic',  country: 'US', region: 'PACOTS', oceanic: true,  aliases: ['Anchorage Arctic'] },
  { icao: 'RJJJ', name: 'Fukuoka',           atcCenter: 'Fukuoka ACC',        country: 'JP', region: 'PACOTS', oceanic: true,  aliases: ['Fukuoka', 'RJTG'] },
  { icao: 'NZZO', name: 'Auckland Oceanic',  atcCenter: 'Auckland Oceanic',   country: 'NZ', region: 'PACOTS', oceanic: true,  aliases: ['Auckland Oceanic'] },

  // ── Europe ──────────────────────────────────────────────────────────────
  { icao: 'EGTT', name: 'London',            atcCenter: 'London ACC',         country: 'GB', region: 'EUR', oceanic: false, aliases: ['London FIR', 'NATS'] },
  { icao: 'EGPX', name: 'Scottish',          atcCenter: 'Scottish ACC',       country: 'GB', region: 'EUR', oceanic: false, aliases: ['Scottish FIR'] },
  { icao: 'LFFF', name: 'Paris',             atcCenter: 'Paris ACC',          country: 'FR', region: 'EUR', oceanic: false, aliases: ['Paris FIR'] },
  { icao: 'LFRR', name: 'Brest',             atcCenter: 'Brest ACC',          country: 'FR', region: 'EUR', oceanic: false, aliases: ['Brest FIR'] },
  { icao: 'EDGG', name: 'Langen',            atcCenter: 'Langen ACC',         country: 'DE', region: 'EUR', oceanic: false, aliases: ['Langen FIR'] },
  { icao: 'EDMM', name: 'Munich',            atcCenter: 'Munich ACC',         country: 'DE', region: 'EUR', oceanic: false, aliases: ['Munich FIR'] },
  { icao: 'EHAA', name: 'Amsterdam',         atcCenter: 'Amsterdam ACC',      country: 'NL', region: 'EUR', oceanic: false, aliases: ['Amsterdam FIR'] },
  { icao: 'EBBU', name: 'Brussels',          atcCenter: 'Brussels ACC',       country: 'BE', region: 'EUR', oceanic: false, aliases: ['Brussels FIR'] },
  { icao: 'LSAS', name: 'Switzerland',       atcCenter: 'Switzerland ACC',    country: 'CH', region: 'EUR', oceanic: false, aliases: ['Skyguide'] },
  { icao: 'LIRR', name: 'Rome',              atcCenter: 'Rome ACC',           country: 'IT', region: 'EUR', oceanic: false, aliases: ['Rome FIR'] },
  { icao: 'LECM', name: 'Madrid',            atcCenter: 'Madrid ACC',         country: 'ES', region: 'EUR', oceanic: false, aliases: ['Madrid FIR'] },
  { icao: 'LECB', name: 'Barcelona',         atcCenter: 'Barcelona ACC',      country: 'ES', region: 'EUR', oceanic: false, aliases: ['Barcelona FIR'] },
  { icao: 'EKDK', name: 'Copenhagen',        atcCenter: 'Copenhagen ACC',     country: 'DK', region: 'EUR', oceanic: false, aliases: ['Copenhagen FIR'] },
  { icao: 'ESAA', name: 'Sweden',            atcCenter: 'Sweden ACC',         country: 'SE', region: 'EUR', oceanic: false, aliases: ['Sweden FIR'] },
  { icao: 'ENOR', name: 'Norway',            atcCenter: 'Norway ACC',         country: 'NO', region: 'EUR', oceanic: false, aliases: ['Norway FIR'] },
  { icao: 'EFIN', name: 'Helsinki',          atcCenter: 'Finland ACC',        country: 'FI', region: 'EUR', oceanic: false, aliases: ['Finland FIR'] },
  { icao: 'EPWW', name: 'Warsaw',            atcCenter: 'Warsaw ACC',         country: 'PL', region: 'EUR', oceanic: false, aliases: ['Warsaw FIR'] },
  { icao: 'LZBB', name: 'Bratislava',        atcCenter: 'Bratislava ACC',     country: 'SK', region: 'EUR', oceanic: false, aliases: ['Bratislava FIR'] },
  { icao: 'LKAA', name: 'Prague',            atcCenter: 'Prague ACC',         country: 'CZ', region: 'EUR', oceanic: false, aliases: ['Prague FIR'] },
  { icao: 'LHCC', name: 'Budapest',          atcCenter: 'Budapest ACC',       country: 'HU', region: 'EUR', oceanic: false, aliases: ['Budapest FIR'] },
  { icao: 'LOVV', name: 'Vienna',            atcCenter: 'Vienna ACC',         country: 'AT', region: 'EUR', oceanic: false, aliases: ['Vienna FIR'] },
  { icao: 'LGGG', name: 'Athens',            atcCenter: 'Athens ACC',         country: 'GR', region: 'EUR', oceanic: false, aliases: ['Athens FIR'] },
  { icao: 'LTAA', name: 'Ankara',            atcCenter: 'Ankara ACC',         country: 'TR', region: 'EUR', oceanic: false, aliases: ['Ankara FIR'] },

  // ── Asia / Pacific ──────────────────────────────────────────────────────
  { icao: 'ZBPE', name: 'Beijing',           atcCenter: 'Beijing ACC',        country: 'CN', region: 'ASIA', oceanic: false, aliases: ['Beijing FIR'] },
  { icao: 'ZSHA', name: 'Shanghai',          atcCenter: 'Shanghai ACC',       country: 'CN', region: 'ASIA', oceanic: false, aliases: ['Shanghai FIR'] },
  { icao: 'ZGZU', name: 'Guangzhou',         atcCenter: 'Guangzhou ACC',      country: 'CN', region: 'ASIA', oceanic: false, aliases: ['Guangzhou FIR'] },
  { icao: 'VHHK', name: 'Hong Kong',         atcCenter: 'Hong Kong ACC',      country: 'HK', region: 'ASIA', oceanic: false, aliases: ['Hong Kong FIR'] },
  { icao: 'RKRR', name: 'Incheon',           atcCenter: 'Incheon ACC',        country: 'KR', region: 'ASIA', oceanic: false, aliases: ['Incheon FIR'] },
  { icao: 'WSJC', name: 'Singapore',         atcCenter: 'Singapore ACC',      country: 'SG', region: 'ASIA', oceanic: false, aliases: ['Singapore FIR'] },
  { icao: 'WMFC', name: 'Kuala Lumpur',      atcCenter: 'KL ACC',             country: 'MY', region: 'ASIA', oceanic: false, aliases: ['KL FIR'] },
  { icao: 'VTBB', name: 'Bangkok',           atcCenter: 'Bangkok ACC',        country: 'TH', region: 'ASIA', oceanic: false, aliases: ['Bangkok FIR'] },
  { icao: 'VABF', name: 'Mumbai',            atcCenter: 'Mumbai ACC',         country: 'IN', region: 'ASIA', oceanic: false, aliases: ['Mumbai FIR'] },
  { icao: 'VIDF', name: 'Delhi',             atcCenter: 'Delhi ACC',          country: 'IN', region: 'ASIA', oceanic: false, aliases: ['Delhi FIR'] },

  // ── Oceania ─────────────────────────────────────────────────────────────
  { icao: 'YBBB', name: 'Brisbane',          atcCenter: 'Brisbane ACC',       country: 'AU', region: 'OCEANIA', oceanic: false, aliases: ['Brisbane FIR'] },
  { icao: 'YMMM', name: 'Melbourne',         atcCenter: 'Melbourne ACC',      country: 'AU', region: 'OCEANIA', oceanic: false, aliases: ['Melbourne FIR'] },
  { icao: 'NZZC', name: 'New Zealand',       atcCenter: 'Auckland ACC',       country: 'NZ', region: 'OCEANIA', oceanic: false, aliases: ['NZ FIR'] },

  // ── Middle East ─────────────────────────────────────────────────────────
  { icao: 'OMAE', name: 'Emirates',          atcCenter: 'Emirates ACC',       country: 'AE', region: 'OTHER', oceanic: false, aliases: ['UAE FIR'] },
  { icao: 'OOMM', name: 'Muscat',            atcCenter: 'Muscat ACC',         country: 'OM', region: 'OTHER', oceanic: false, aliases: ['Muscat FIR'] },
  { icao: 'OERR', name: 'Riyadh',            atcCenter: 'Riyadh ACC',         country: 'SA', region: 'OTHER', oceanic: false, aliases: ['Riyadh FIR'] },
  { icao: 'OTDF', name: 'Doha',              atcCenter: 'Doha ACC',           country: 'QA', region: 'OTHER', oceanic: false, aliases: ['Doha FIR'] },

  // ── Africa ──────────────────────────────────────────────────────────────
  { icao: 'HECC', name: 'Cairo',             atcCenter: 'Cairo ACC',          country: 'EG', region: 'AFRICA', oceanic: false, aliases: ['Cairo FIR'] },
  { icao: 'FAJO', name: 'Johannesburg',      atcCenter: 'Johannesburg ACC',   country: 'ZA', region: 'AFRICA', oceanic: false, aliases: ['Joburg FIR'] },
  { icao: 'HKNA', name: 'Nairobi',           atcCenter: 'Nairobi ACC',        country: 'KE', region: 'AFRICA', oceanic: false, aliases: ['Nairobi FIR'] },

  // ── South America ───────────────────────────────────────────────────────
  { icao: 'SBBS', name: 'Brasilia',          atcCenter: 'Brasilia ACC',       country: 'BR', region: 'SAM', oceanic: false, aliases: ['Brasilia FIR'] },
  { icao: 'SCFA', name: 'Santiago',          atcCenter: 'Santiago ACC',       country: 'CL', region: 'SAM', oceanic: false, aliases: ['Santiago FIR'] },
  { icao: 'SAEF', name: 'Ezeiza',            atcCenter: 'Buenos Aires ACC',   country: 'AR', region: 'SAM', oceanic: false, aliases: ['Ezeiza FIR'] },

  // ── North America (non-CONUS) ───────────────────────────────────────────
  { icao: 'CZUL', name: 'Montreal',          atcCenter: 'Montreal ACC',       country: 'CA', region: 'CONUS', oceanic: false, aliases: ['Montreal FIR'] },
  { icao: 'CZYZ', name: 'Toronto',           atcCenter: 'Toronto ACC',        country: 'CA', region: 'CONUS', oceanic: false, aliases: ['Toronto FIR'] },
  { icao: 'CZVR', name: 'Vancouver',         atcCenter: 'Vancouver ACC',      country: 'CA', region: 'CONUS', oceanic: false, aliases: ['Vancouver FIR'] },
];

function norm(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '').replace(/-/g, '').replace(/\./g, '');
}

const BY_ALIAS: Map<string, Fir> = (() => {
  const m = new Map<string, Fir>();
  for (const f of FIRS) {
    m.set(norm(f.icao), f);
    for (const a of f.aliases) m.set(norm(a), f);
  }
  return m;
})();

/**
 * Resolve any FIR reference to its canonical record.
 *
 *   resolveFir('KZNY')            → New York
 *   resolveFir('NY Oceanic')      → New York Oceanic
 *   resolveFir('Shanwick')        → Shanwick Oceanic
 *   resolveFir('London FIR')      → London
 */
export function resolveFir(input: string | undefined | null): Fir | undefined {
  if (!input) return undefined;
  return BY_ALIAS.get(norm(input));
}

/** Display helper — 'Shanwick Oceanic' or fallback if unresolved. */
export function firLabel(input: string | undefined | null, fallback = ''): string {
  const f = resolveFir(input);
  return f?.name ?? fallback;
}
