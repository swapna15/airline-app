/**
 * Canonical airline ontology — single source of truth for resolving any
 * airline reference (IATA code, ICAO code, callsign, marketing name) to a
 * single record.
 *
 * Same shape as shared/semantic/aircraft.ts:
 *   - one row per ICAO carrier code (the canonical key for ATC + flight plan)
 *   - aliases[] every spelling we've seen
 *   - resolveAirline(input) walks alias index then permissive fallback
 *
 * Future consumers:
 *   - ICAO Flight Plan Item 7 (callsign), Item 18 (DOF/REG/etc.)
 *   - Codeshare reconciliation against Duffel offers
 *   - Branded OFP rendering (logo, primary color from the existing tenant
 *     registry can also live here)
 *   - Alliance-aware reroute / interline suggestions in IROPS recovery
 */

export type Alliance = 'oneworld' | 'Star Alliance' | 'SkyTeam' | null;

export interface Airline {
  /** ICAO airline designator — primary key (e.g., 'BAW' for British Airways). */
  icao: string;
  /** IATA airline designator (e.g., 'BA'). Always 2 chars. */
  iata: string;
  /** Marketing name. */
  name: string;
  /** Radio callsign used by ATC ('SPEEDBIRD' for British Airways). */
  callsign: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  alliance: Alliance;
  /** IATA codes of primary hub airports — used by network/IROPS planning. */
  hubs: string[];
  /** Every spelling we've ever seen in operator/feed data. */
  aliases: string[];
}

export const AIRLINES: Airline[] = [
  // ── oneworld ─────────────────────────────────────────────────────────────
  { icao: 'BAW', iata: 'BA', name: 'British Airways',  callsign: 'SPEEDBIRD',
    country: 'GB', alliance: 'oneworld',
    hubs: ['LHR', 'LGW'], aliases: ['British Airways', 'BA', 'BAW', 'Speedbird'] },
  { icao: 'AAL', iata: 'AA', name: 'American Airlines', callsign: 'AMERICAN',
    country: 'US', alliance: 'oneworld',
    hubs: ['DFW', 'CLT', 'ORD', 'PHX', 'PHL', 'MIA', 'LAX', 'JFK'],
    aliases: ['American Airlines', 'AA', 'AAL', 'American'] },
  { icao: 'JAL', iata: 'JL', name: 'Japan Airlines',   callsign: 'JAPANAIR',
    country: 'JP', alliance: 'oneworld',
    hubs: ['HND', 'NRT'], aliases: ['Japan Airlines', 'JAL', 'JL', 'Japanair'] },
  { icao: 'CPA', iata: 'CX', name: 'Cathay Pacific',   callsign: 'CATHAY',
    country: 'HK', alliance: 'oneworld',
    hubs: ['HKG'], aliases: ['Cathay Pacific', 'Cathay', 'CX', 'CPA'] },
  { icao: 'QFA', iata: 'QF', name: 'Qantas',           callsign: 'QANTAS',
    country: 'AU', alliance: 'oneworld',
    hubs: ['SYD', 'MEL', 'BNE'], aliases: ['Qantas', 'QF', 'QFA'] },
  { icao: 'IBE', iata: 'IB', name: 'Iberia',           callsign: 'IBERIA',
    country: 'ES', alliance: 'oneworld',
    hubs: ['MAD'], aliases: ['Iberia', 'IB', 'IBE'] },
  { icao: 'FIN', iata: 'AY', name: 'Finnair',          callsign: 'FINNAIR',
    country: 'FI', alliance: 'oneworld',
    hubs: ['HEL'], aliases: ['Finnair', 'AY', 'FIN'] },

  // ── Star Alliance ────────────────────────────────────────────────────────
  { icao: 'UAL', iata: 'UA', name: 'United Airlines',  callsign: 'UNITED',
    country: 'US', alliance: 'Star Alliance',
    hubs: ['ORD', 'IAH', 'EWR', 'DEN', 'IAD', 'SFO', 'LAX'],
    aliases: ['United Airlines', 'United', 'UA', 'UAL'] },
  { icao: 'DLH', iata: 'LH', name: 'Lufthansa',        callsign: 'LUFTHANSA',
    country: 'DE', alliance: 'Star Alliance',
    hubs: ['FRA', 'MUC'], aliases: ['Lufthansa', 'LH', 'DLH'] },
  { icao: 'SWA', iata: 'WN', name: 'Southwest Airlines', callsign: 'SOUTHWEST',
    country: 'US', alliance: null,
    hubs: ['DAL', 'HOU', 'BWI', 'MDW', 'LAS', 'PHX'],
    aliases: ['Southwest Airlines', 'Southwest', 'WN', 'SWA'] },
  { icao: 'ANA', iata: 'NH', name: 'All Nippon Airways', callsign: 'ALL NIPPON',
    country: 'JP', alliance: 'Star Alliance',
    hubs: ['HND', 'NRT'], aliases: ['All Nippon Airways', 'ANA', 'NH'] },
  { icao: 'SIA', iata: 'SQ', name: 'Singapore Airlines', callsign: 'SINGAPORE',
    country: 'SG', alliance: 'Star Alliance',
    hubs: ['SIN'], aliases: ['Singapore Airlines', 'Singapore', 'SQ', 'SIA'] },
  { icao: 'AFR', iata: 'AF', name: 'Air France',       callsign: 'AIRFRANS',
    country: 'FR', alliance: 'SkyTeam',
    hubs: ['CDG', 'ORY'], aliases: ['Air France', 'AF', 'AFR'] },
  { icao: 'KLM', iata: 'KL', name: 'KLM',              callsign: 'KLM',
    country: 'NL', alliance: 'SkyTeam',
    hubs: ['AMS'], aliases: ['KLM', 'KLM Royal Dutch', 'KL'] },
  { icao: 'DAL', iata: 'DL', name: 'Delta Air Lines',  callsign: 'DELTA',
    country: 'US', alliance: 'SkyTeam',
    hubs: ['ATL', 'DTW', 'MSP', 'JFK', 'LAX', 'SLC', 'SEA', 'BOS'],
    aliases: ['Delta Air Lines', 'Delta', 'DL', 'DAL'] },
  { icao: 'KAL', iata: 'KE', name: 'Korean Air',       callsign: 'KOREANAIR',
    country: 'KR', alliance: 'SkyTeam',
    hubs: ['ICN'], aliases: ['Korean Air', 'KE', 'KAL'] },
  { icao: 'CES', iata: 'MU', name: 'China Eastern',    callsign: 'CHINA EASTERN',
    country: 'CN', alliance: 'SkyTeam',
    hubs: ['PVG', 'SHA'], aliases: ['China Eastern', 'MU', 'CES'] },

  // ── Middle East ──────────────────────────────────────────────────────────
  { icao: 'UAE', iata: 'EK', name: 'Emirates',         callsign: 'EMIRATES',
    country: 'AE', alliance: null,
    hubs: ['DXB'], aliases: ['Emirates', 'EK', 'UAE'] },
  { icao: 'ETD', iata: 'EY', name: 'Etihad Airways',   callsign: 'ETIHAD',
    country: 'AE', alliance: null,
    hubs: ['AUH'], aliases: ['Etihad', 'Etihad Airways', 'EY', 'ETD'] },
  { icao: 'QTR', iata: 'QR', name: 'Qatar Airways',    callsign: 'QATARI',
    country: 'QA', alliance: 'oneworld',
    hubs: ['DOH'], aliases: ['Qatar Airways', 'Qatar', 'QR', 'QTR'] },

  // ── Other notable ────────────────────────────────────────────────────────
  { icao: 'AIC', iata: 'AI', name: 'Air India',        callsign: 'AIRINDIA',
    country: 'IN', alliance: 'Star Alliance',
    hubs: ['DEL', 'BOM'], aliases: ['Air India', 'AI', 'AIC'] },
  { icao: 'TAM', iata: 'JJ', name: 'LATAM',            callsign: 'TAM',
    country: 'BR', alliance: null,
    hubs: ['GRU'], aliases: ['LATAM', 'TAM', 'JJ'] },
  { icao: 'CPA', iata: 'CA', name: 'Air China',        callsign: 'AIR CHINA',
    country: 'CN', alliance: 'Star Alliance',
    hubs: ['PEK'], aliases: ['Air China', 'CA'] },
  { icao: 'JBU', iata: 'B6', name: 'JetBlue Airways',  callsign: 'JETBLUE',
    country: 'US', alliance: null,
    hubs: ['JFK', 'BOS', 'FLL'], aliases: ['JetBlue', 'JetBlue Airways', 'B6', 'JBU'] },
  { icao: 'VIR', iata: 'VS', name: 'Virgin Atlantic',  callsign: 'VIRGIN',
    country: 'GB', alliance: null,
    hubs: ['LHR', 'LGW', 'MAN'], aliases: ['Virgin Atlantic', 'Virgin', 'VS', 'VIR'] },
];

function norm(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '').replace(/-/g, '').replace(/\./g, '');
}

const BY_ALIAS: Map<string, Airline> = (() => {
  const m = new Map<string, Airline>();
  for (const a of AIRLINES) {
    m.set(norm(a.icao), a);
    m.set(norm(a.iata), a);
    m.set(norm(a.callsign), a);
    for (const x of a.aliases) m.set(norm(x), a);
  }
  return m;
})();

/**
 * Resolve any airline reference to its canonical record.
 *
 *   resolveAirline('BA')                 → British Airways
 *   resolveAirline('BAW')                → British Airways
 *   resolveAirline('SPEEDBIRD')          → British Airways
 *   resolveAirline('British Airways')    → British Airways
 *   resolveAirline('united-airlines')    → United Airlines
 */
export function resolveAirline(input: string | undefined | null): Airline | undefined {
  if (!input) return undefined;
  return BY_ALIAS.get(norm(input));
}

/** Display helper — returns 'British Airways BA1000' or fallback if unresolved. */
export function airlineLabel(carrier: string | undefined | null, fallback = ''): string {
  const a = resolveAirline(carrier);
  return a?.name ?? fallback;
}
