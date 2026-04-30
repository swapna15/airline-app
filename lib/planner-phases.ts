/**
 * Pure phase functions extracted from app/api/planner/[phase]/route.ts so the
 * orchestrator (lib/planner-orchestrator.ts) can call them directly without
 * round-tripping through HTTP. The route handler now delegates here, and the
 * orchestrator imports the same functions to run the workflow end-to-end.
 *
 * Hard rule: every result is a plain { summary, data, source } envelope —
 * no UI assumptions, no agent invention of numbers. See PlanningAgent for the
 * "facts in, prose out" contract.
 */

import { lookupAirport } from '@/lib/icao';
import { fetchMetars, fetchTafs, fetchSigmets } from '@/lib/aviationweather';
import { fetchNotams } from '@/lib/notams';
import { fuelEstimate, initialBearing } from '@/lib/perf';
import { planningAgent } from '@/core/agents/PlanningAgent';
import { listRejectionComments } from '@/lib/planner-store';
import type { OwnFlight } from '@shared/schema/flight';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export type PhaseId =
  | 'brief'
  | 'aircraft'
  | 'route'
  | 'fuel'
  | 'weight_balance'
  | 'crew'
  | 'slot_atc';

export const VALID_PHASES: ReadonlySet<string> = new Set<PhaseId>([
  'brief', 'aircraft', 'route', 'fuel', 'weight_balance', 'crew', 'slot_atc',
]);

/**
 * Phase functions consume the canonical OwnFlight directly. The legacy
 * `FlightInput` shape was a stripped-down ad-hoc DTO; we keep the alias for
 * one release so existing call sites still work, but new code should depend
 * on `OwnFlight` from `@shared/schema/flight`.
 *
 * @deprecated Import `OwnFlight` from '@shared/schema/flight' instead.
 */
export type FlightInput = OwnFlight;

export interface PhaseResult {
  summary: string;
  data: unknown;
  source: string;
}

interface PastRejection { phase: string; comment: string; createdAt: string }

// Internal display helpers — the phase functions output human-readable summaries,
// so we collapse the canonical structured fields into the same strings the UI shows.
function flightNo(f: OwnFlight): string {
  return `${f.carrier}${f.flightNumber}`;
}
function depTimeHHmm(f: OwnFlight): string {
  const d = new Date(f.scheduledDeparture);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}
function aircraftLabel(f: OwnFlight): string {
  return f.aircraftType ?? f.aircraftIcao ?? 'unknown';
}

async function loadPastBriefRejections(token: string | null): Promise<PastRejection[]> {
  if (API_URL && token) {
    try {
      const res = await fetch(`${API_URL}/planning/rejection-comments?phase=brief&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) return await res.json() as PastRejection[];
    } catch {
      // fall through to in-memory
    }
  }
  return listRejectionComments('brief', 10);
}

export async function brief(f: FlightInput, authToken: string | null): Promise<PhaseResult> {
  const o = lookupAirport(f.origin);
  const d = lookupAirport(f.destination);
  if (!o || !d) {
    return {
      summary: `Airport reference missing for ${f.origin}/${f.destination}; brief skipped.`,
      data: { error: 'unknown_airport' },
      source: 'planner-internal',
    };
  }

  const icaos = [o.icao, d.icao];

  const [metarsR, tafsR, sigmetsR, notamsR] = await Promise.allSettled([
    fetchMetars(icaos),
    fetchTafs(icaos),
    fetchSigmets(),
    fetchNotams(icaos),
  ]);

  const metars  = metarsR.status === 'fulfilled' ? metarsR.value : [];
  const tafs    = tafsR.status === 'fulfilled' ? tafsR.value : [];
  const sigmets = sigmetsR.status === 'fulfilled' ? sigmetsR.value.slice(0, 5) : [];
  const notams  = notamsR.status === 'fulfilled' ? notamsR.value : { items: [], source: 'mock' as const };

  const facts = {
    flight: flightNo(f),
    origin: { iata: o.iata, icao: o.icao, name: o.name },
    destination: { iata: d.iata, icao: d.icao, name: d.name },
    metars: metars.map((m) => ({ id: m.icaoId, raw: m.rawOb, fltCat: m.fltCat })),
    tafs: tafs.map((t) => ({ id: t.icaoId, raw: t.rawTAF })),
    sigmetCount: sigmets.length,
    sigmetHazards: sigmets.map((s) => s.hazard).filter(Boolean),
    notams: notams.items.slice(0, 6).map((n) => ({ at: n.location, text: n.text })),
  };

  const pastRejections = await loadPastBriefRejections(authToken);
  const summary = await planningAgent.summarize(facts, pastRejections);

  const sourceParts = [
    metars.length ? 'aviationweather:metar' : null,
    tafs.length ? 'aviationweather:taf' : null,
    sigmets.length ? 'aviationweather:isigmet' : null,
    `notam:${notams.source}`,
    pastRejections.length ? `${pastRejections.length} past rejections informed` : null,
  ].filter(Boolean);

  return {
    summary,
    data: { metars, tafs, sigmets, notams: notams.items },
    source: sourceParts.join(' + '),
  };
}

export function route(f: FlightInput): PhaseResult {
  const o = lookupAirport(f.origin);
  const d = lookupAirport(f.destination);
  if (!o || !d) {
    return { summary: 'Airport reference missing; route skipped.', data: { error: 'unknown_airport' }, source: 'planner-internal' };
  }

  const fe = fuelEstimate(o, d, aircraftLabel(f));
  const bearing = Math.round(initialBearing(o, d));
  const filed = `${o.icao} DCT ${d.icao}`;
  const summary =
    `Great-circle ${o.iata}→${d.iata}: ${fe.distanceNM} nm, initial heading ${String(bearing).padStart(3, '0')}°. ` +
    `Block time ${Math.floor(fe.blockTimeMin / 60)}h ${fe.blockTimeMin % 60}m at M${(fe.cruiseSpeedKt / 573).toFixed(2)}. ` +
    `Direct routing shown — airway selection pending AIRAC integration.`;

  return {
    summary,
    data: { filedRoute: filed, distanceNM: fe.distanceNM, initialBearing: bearing, blockTimeMin: fe.blockTimeMin, cruiseSpeedKt: fe.cruiseSpeedKt },
    source: 'haversine + perf-table',
  };
}

export function fuel(f: FlightInput): PhaseResult {
  const o = lookupAirport(f.origin);
  const d = lookupAirport(f.destination);
  if (!o || !d) {
    return { summary: 'Airport reference missing; fuel skipped.', data: { error: 'unknown_airport' }, source: 'planner-internal' };
  }

  const fe = fuelEstimate(o, d, aircraftLabel(f));
  const summary =
    `Fuel estimate (${aircraftLabel(f)}): trip ${fe.trip.toLocaleString()} kg · contingency ${fe.contingency.toLocaleString()} kg ` +
    `(5%) · alternate ${fe.alternate.toLocaleString()} kg (45 min) · reserve ${fe.reserve.toLocaleString()} kg (30 min) · ` +
    `taxi ${fe.taxi} kg. Block fuel ${fe.block.toLocaleString()} kg vs MTOW ${fe.mtowKg.toLocaleString()} kg.`;

  return { summary, data: fe, source: 'perf-table (manufacturer specs)' };
}

export function aircraft(f: FlightInput): PhaseResult {
  // Real path: lookup f.tail in fleet system; mocked here.
  const tail = f.tail ?? 'G-XLEK';
  return {
    summary:
      `Recommended tail: ${tail} (${aircraftLabel(f)}). ETOPS 180 current, no MEL items affecting this route. ` +
      `Last C-check 14d ago, next due in 89d. [mocked — fleet system not integrated]`,
    data: { tail, etops: 180, melItems: [] },
    source: 'mock://fleet-system',
  };
}

export function weightBalance(f: FlightInput): PhaseResult {
  const pax = f.paxLoad ?? 0;
  return {
    summary:
      `ZFW 198,200 kg · TOW 267,120 kg · LDW 208,720 kg. CG at TOW 24.3% MAC (envelope 18-32%). ` +
      `${pax} pax loaded, cargo 14.2t. Within all limits. [mocked — load planning not integrated]`,
    data: { zfw: 198200, tow: 267120, ldw: 208720, cgPct: 24.3, paxLoad: pax },
    source: 'mock://load-planning',
  };
}

export function crew(): PhaseResult {
  return {
    summary:
      `4-pilot crew assigned (augmented). All current on type, recurrent within 90d. ` +
      `FDP planned 9h 12m vs max 14h. CC: 12 cabin crew, all currency valid. [mocked — crew system not integrated]`,
    data: { pilots: 4, cabinCrew: 12, fdpMinutes: 552, fdpMaxMinutes: 840 },
    source: 'mock://crew-scheduling',
  };
}

export function slotAtc(f: FlightInput): PhaseResult {
  const std = depTimeHHmm(f);
  return {
    summary:
      `CTOT confirmed: STD ${std} (no ATFM regulation). ICAO FPL submission pending. ` +
      `[mocked — Eurocontrol NM not integrated]`,
    data: { ctot: f.scheduledDeparture, ifpsAccepted: false, regulation: null },
    source: 'mock://eurocontrol-nm',
  };
}

export async function runPhase(id: PhaseId, f: FlightInput, authToken: string | null): Promise<PhaseResult> {
  switch (id) {
    case 'brief':          return brief(f, authToken);
    case 'route':          return route(f);
    case 'fuel':           return fuel(f);
    case 'aircraft':       return aircraft(f);
    case 'weight_balance': return weightBalance(f);
    case 'crew':           return crew();
    case 'slot_atc':       return slotAtc(f);
  }
}
