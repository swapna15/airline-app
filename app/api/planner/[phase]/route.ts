import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { lookupAirport } from '@/lib/icao';
import { fetchMetars, fetchTafs, fetchSigmets } from '@/lib/aviationweather';
import { fetchNotams } from '@/lib/notams';
import { fuelEstimate, initialBearing } from '@/lib/perf';
import { planningAgent } from '@/core/agents/PlanningAgent';
import { listRejectionComments } from '@/lib/planner-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface PastRejection { phase: string; comment: string; createdAt: string }

/** Phase D — fetch from Postgres via Lambda when configured, else in-memory store. */
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

type PhaseId =
  | 'brief'
  | 'aircraft'
  | 'route'
  | 'fuel'
  | 'weight_balance'
  | 'crew'
  | 'slot_atc';

interface FlightInput {
  flight: string;
  origin: string;
  destination: string;
  scheduled: string;
  aircraft: string;
  paxLoad: number;
}

interface PhaseResult {
  summary: string;
  data: unknown;
  source: string;
}

/**
 * Real data path for brief/route/fuel; mocks for the phases we have no
 * source for. Same envelope shape as Phase A so the UI is unchanged.
 */

async function brief(f: FlightInput, authToken: string | null): Promise<PhaseResult> {
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

  // Fetch in parallel — failures degrade individually, not the whole brief.
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
    flight: f.flight,
    origin: { iata: o.iata, icao: o.icao, name: o.name },
    destination: { iata: d.iata, icao: d.icao, name: d.name },
    metars: metars.map((m) => ({ id: m.icaoId, raw: m.rawOb, fltCat: m.fltCat })),
    tafs: tafs.map((t) => ({ id: t.icaoId, raw: t.rawTAF })),
    sigmetCount: sigmets.length,
    sigmetHazards: sigmets.map((s) => s.hazard).filter(Boolean),
    notams: notams.items.slice(0, 6).map((n) => ({ at: n.location, text: n.text })),
  };

  // Phase D — pull recent brief rejections so the agent can avoid past failure modes.
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

function route(f: FlightInput): PhaseResult {
  const o = lookupAirport(f.origin);
  const d = lookupAirport(f.destination);
  if (!o || !d) {
    return { summary: 'Airport reference missing; route skipped.', data: { error: 'unknown_airport' }, source: 'planner-internal' };
  }

  const fe = fuelEstimate(o, d, f.aircraft);
  const bearing = Math.round(initialBearing(o, d));

  // Filed route stays representative — building real airway routing requires
  // AIRAC nav data we don't have. The distance/time/heading are real.
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

function fuel(f: FlightInput): PhaseResult {
  const o = lookupAirport(f.origin);
  const d = lookupAirport(f.destination);
  if (!o || !d) {
    return { summary: 'Airport reference missing; fuel skipped.', data: { error: 'unknown_airport' }, source: 'planner-internal' };
  }

  const fe = fuelEstimate(o, d, f.aircraft);
  const summary =
    `Fuel estimate (${f.aircraft}): trip ${fe.trip.toLocaleString()} kg · contingency ${fe.contingency.toLocaleString()} kg ` +
    `(5%) · alternate ${fe.alternate.toLocaleString()} kg (45 min) · reserve ${fe.reserve.toLocaleString()} kg (30 min) · ` +
    `taxi ${fe.taxi} kg. Block fuel ${fe.block.toLocaleString()} kg vs MTOW ${fe.mtowKg.toLocaleString()} kg.`;

  return { summary, data: fe, source: 'perf-table (manufacturer specs)' };
}

function aircraft(f: FlightInput): PhaseResult {
  return {
    summary:
      `Recommended tail: G-XLEK (${f.aircraft}). ETOPS 180 current, no MEL items affecting this route. ` +
      `Last C-check 14d ago, next due in 89d. [mocked — fleet system not integrated]`,
    data: { tail: 'G-XLEK', etops: 180, melItems: [] },
    source: 'mock://fleet-system',
  };
}

function weightBalance(f: FlightInput): PhaseResult {
  return {
    summary:
      `ZFW 198,200 kg · TOW 267,120 kg · LDW 208,720 kg. CG at TOW 24.3% MAC (envelope 18-32%). ` +
      `${f.paxLoad} pax loaded, cargo 14.2t. Within all limits. [mocked — load planning not integrated]`,
    data: { zfw: 198200, tow: 267120, ldw: 208720, cgPct: 24.3 },
    source: 'mock://load-planning',
  };
}

function crew(): PhaseResult {
  return {
    summary:
      `4-pilot crew assigned (augmented). All current on type, recurrent within 90d. ` +
      `FDP planned 9h 12m vs max 14h. CC: 12 cabin crew, all currency valid. [mocked — crew system not integrated]`,
    data: { pilots: 4, cabinCrew: 12, fdpMinutes: 552, fdpMaxMinutes: 840 },
    source: 'mock://crew-scheduling',
  };
}

function slotAtc(f: FlightInput): PhaseResult {
  return {
    summary:
      `CTOT confirmed: STD ${f.scheduled} (no ATFM regulation). ICAO FPL submission pending. ` +
      `[mocked — Eurocontrol NM not integrated]`,
    data: { ctot: f.scheduled, ifpsAccepted: false, regulation: null },
    source: 'mock://eurocontrol-nm',
  };
}

const VALID_PHASES: ReadonlySet<string> = new Set([
  'brief', 'aircraft', 'route', 'fuel', 'weight_balance', 'crew', 'slot_atc',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { phase: string } },
) {
  if (!VALID_PHASES.has(params.phase)) {
    return NextResponse.json({ error: `unknown phase: ${params.phase}` }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const authToken = (session as { accessToken?: string } | null)?.accessToken ?? null;

  const body = await req.json() as { flight?: FlightInput };
  if (!body.flight) {
    return NextResponse.json({ error: 'flight is required' }, { status: 400 });
  }

  try {
    let result: PhaseResult;
    switch (params.phase as PhaseId) {
      case 'brief':          result = await brief(body.flight, authToken); break;
      case 'route':          result = route(body.flight); break;
      case 'fuel':           result = fuel(body.flight); break;
      case 'aircraft':       result = aircraft(body.flight); break;
      case 'weight_balance': result = weightBalance(body.flight); break;
      case 'crew':           result = crew(); break;
      case 'slot_atc':       result = slotAtc(body.flight); break;
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'phase generation failed', detail: (err as Error).message },
      { status: 502 },
    );
  }
}
