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
import { getRoster, getAssignments, assignmentsForFlight } from '@/lib/crew';
import { scoreCrewBatch, REJECT_FATIGUE_THRESHOLD, HIGH_FATIGUE_THRESHOLD } from '@/lib/crew-fatigue';
import { loadOpsSpecs } from '@/lib/ops-specs';
import {
  equidistantPoint, findEtopsAlternates,
  computeCriticalFuel, checkAlternateWeather,
} from '@/lib/etops';
import { resolveAircraftType, isTypeAuthorized } from '@shared/semantic/aircraft';

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

// Phase functions consume the canonical OwnFlight directly from
// `@shared/schema/flight`. The legacy FlightInput alias has been removed.

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

export async function brief(f: OwnFlight, authToken: string | null): Promise<PhaseResult> {
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

export async function route(f: OwnFlight, authToken: string | null): Promise<PhaseResult> {
  const o = lookupAirport(f.origin);
  const d = lookupAirport(f.destination);
  if (!o || !d) {
    return { summary: 'Airport reference missing; route skipped.', data: { error: 'unknown_airport' }, source: 'planner-internal' };
  }

  const fe = fuelEstimate(o, d, aircraftLabel(f));
  const bearing = Math.round(initialBearing(o, d));
  const filed = `${o.icao} DCT ${d.icao}`;

  // Cost-index drives the speed schedule the FMS computes against fuel-vs-time
  // tradeoff. Per-type override wins, falling back to the OpsSpec default.
  // Real planning consumes CI to bias the route optimizer; we surface it on
  // the OFP so dispatch and crew see the same number.
  const ops = await loadOpsSpecs(authToken);
  const typeKey = f.aircraftIcao ?? aircraftLabel(f);
  const ci = ops.costIndex.byType[typeKey] ?? ops.costIndex.default;

  const summary =
    `Great-circle ${o.iata}→${d.iata}: ${fe.distanceNM} nm, initial heading ${String(bearing).padStart(3, '0')}°. ` +
    `Block time ${Math.floor(fe.blockTimeMin / 60)}h ${fe.blockTimeMin % 60}m at M${(fe.cruiseSpeedKt / 573).toFixed(2)} ` +
    `(CI ${ci}). Direct routing shown — airway selection pending AIRAC integration.`;

  return {
    summary,
    data: {
      filedRoute: filed,
      distanceNM: fe.distanceNM,
      initialBearing: bearing,
      blockTimeMin: fe.blockTimeMin,
      cruiseSpeedKt: fe.cruiseSpeedKt,
      costIndex: ci,
      costIndexSource: ops.costIndex.byType[typeKey] !== undefined ? `byType[${typeKey}]` : 'default',
    },
    source: 'haversine + perf-table + tenant ops-specs',
  };
}

export async function fuel(f: OwnFlight, authToken: string | null): Promise<PhaseResult> {
  const o = lookupAirport(f.origin);
  const d = lookupAirport(f.destination);
  if (!o || !d) {
    return { summary: 'Airport reference missing; fuel skipped.', data: { error: 'unknown_airport' }, source: 'planner-internal' };
  }

  // Tenant fuel policy from /admin/ops-specs (migration 010). Falls back to
  // sensible defaults when NEXT_PUBLIC_API_URL isn't set or the call fails,
  // matching the values previously hardcoded in lib/perf.ts.
  const ops = await loadOpsSpecs(authToken);
  const fp  = ops.fuelPolicy;

  const fe = fuelEstimate(o, d, aircraftLabel(f), {
    contingencyPct:      fp.contingencyPct,
    alternateMinutes:    fp.alternateMinutes,
    finalReserveMinutes: fp.finalReserveMinutes,
    taxiKg:              fp.taxiKg,
    captainsFuelMinutes: fp.captainsFuelMinutes,
  });

  const summary =
    `Fuel estimate (${aircraftLabel(f)}): trip ${fe.trip.toLocaleString()} kg · contingency ${fe.contingency.toLocaleString()} kg ` +
    `(${fp.contingencyPct}%) · alternate ${fe.alternate.toLocaleString()} kg (${fp.alternateMinutes} min) · ` +
    `reserve ${fe.reserve.toLocaleString()} kg (${fp.finalReserveMinutes} min) · ` +
    (fp.captainsFuelMinutes > 0 && fe.captainsFuel
      ? `captain's fuel ${fe.captainsFuel.toLocaleString()} kg (${fp.captainsFuelMinutes} min) · `
      : '') +
    `taxi ${fe.taxi} kg. Block fuel ${fe.block.toLocaleString()} kg vs MTOW ${fe.mtowKg.toLocaleString()} kg.`;

  return { summary, data: { ...fe, policy: fp }, source: 'perf-table + tenant ops-specs' };
}

export async function aircraft(f: OwnFlight, authToken: string | null): Promise<PhaseResult> {
  // Tail lookup is still mocked — real path consults the fleet system.
  const tail = f.tail ?? 'G-XLEK';
  const acft = aircraftLabel(f);

  const o = lookupAirport(f.origin);
  const d = lookupAirport(f.destination);

  // ── ETOPS analysis ────────────────────────────────────────────────────────
  // Twin-engine + over-water/long-haul routes incur ETOPS rules. We pull
  // the operator's approval from OpsSpecs (B044), find adequate alternates
  // within the approved time radius from the equidistant point, fetch
  // current METAR for each, and compute the three critical-fuel scenarios.
  const ops = await loadOpsSpecs(authToken);
  // Single canonical type lookup via the semantic layer — handles every
  // form (ICAO, IATA, marketing, family) through one path.
  const resolvedType = resolveAircraftType(f.aircraftIcao ?? acft);
  const twin = resolvedType?.engineCount === 2;
  const typeAuthorized = isTypeAuthorized(
    { aircraftIcao: f.aircraftIcao, aircraftType: f.aircraftType ?? acft },
    ops.etopsApproval.authorizedTypes,
  );

  // First-pass ETOPS trigger: twin + > 1500nm great-circle. Real planning
  // also kicks in if any segment is > 60min from a suitable alternate;
  // approximated here as distance.
  let etopsBlock = '';
  let etopsData: Record<string, unknown> = { applicable: false };

  if (o && d && twin) {
    const distanceNM = Math.round(
      // reuse the perf greatCircleNM via fuelEstimate's distance output
      fuelEstimate(o, d, acft).distanceNM,
    );
    if (distanceNM > 1500) {
      const ep = equidistantPoint(o, d);
      const requiredRunway = 7000;  // widebody-twin needs ≥ 7,000 ft
      const candidates = findEtopsAlternates(ep, ops.etopsApproval, requiredRunway).slice(0, 5);
      let weatherChecks: ReturnType<typeof checkAlternateWeather> = [];
      if (candidates.length > 0) {
        try {
          const metars = await fetchMetars(candidates.map((c) => c.airport.icao));
          weatherChecks = checkAlternateWeather(candidates, metars, ops.alternateMinima);
        } catch {
          weatherChecks = candidates.map((c) => ({
            icao: c.airport.icao, iata: c.airport.iata,
            meetsMinima: 'unknown' as const, reason: 'METAR fetch failed',
          }));
        }
      }
      const nearest = candidates[0]?.airport;
      const fuel = nearest ? computeCriticalFuel(o, d, nearest, ep, acft) : null;

      const meetingMin = weatherChecks.filter((w) => w.meetsMinima === 'yes').length;
      const okForDispatch = !!nearest && !!fuel && meetingMin >= 1 && typeAuthorized;

      etopsBlock =
        `\nETOPS analysis:\n` +
        `  · Equidistant point ${ep.lat.toFixed(2)}°, ${ep.lon.toFixed(2)}°; ` +
        `${candidates.length} alternates within ${ops.etopsApproval.maxMinutes} min.\n` +
        (fuel
          ? `  · Critical fuel (driver: ${fuel.drivingScenario}): ${fuel.requiredKg.toLocaleString()} kg ` +
            `vs standard ${fuel.standardKg.toLocaleString()} kg ` +
            `(engine-out ${fuel.engineOutKg.toLocaleString()}, depress ${fuel.depressurizationKg.toLocaleString()}, both ${fuel.bothKg.toLocaleString()}).\n` +
            `    perf: ${fuel.perfTypeIcao ?? 'unresolved'} ` +
            `(${fuel.perfFactors.engineOutBurnFactor.toFixed(2)}× / ${fuel.perfFactors.depressBurnFactor.toFixed(2)}× / ${fuel.perfFactors.bothBurnFactor.toFixed(2)}× per-NM, source: ${fuel.perfSource})\n`
          : `  · No ETOPS alternates within radius — dispatch BLOCKED.\n`) +
        `  · Alternate weather (±1h proxy via METAR fltCat): ` +
        `${meetingMin}/${weatherChecks.length} meet minima.\n` +
        (typeAuthorized
          ? ''
          : `  · ⛔ ${acft} is NOT in OpsSpec B044 authorized types — dispatch BLOCKED.\n`) +
        (okForDispatch ? `  · ✓ ETOPS dispatch eligible.` : `  · ⛔ ETOPS dispatch criteria NOT met.`);

      etopsData = {
        applicable: true,
        twin,
        typeAuthorized,
        approvedMaxMin: ops.etopsApproval.maxMinutes,
        equidistantPoint: ep,
        alternates: candidates.map((c, i) => ({
          ...c,
          weather: weatherChecks[i],
        })),
        criticalFuel: fuel,
        okForDispatch,
      };
    }
  }

  return {
    summary:
      `Recommended tail: ${tail} (${acft}). ` +
      `Last C-check 14d ago, next due in 89d. [tail/MEL still mocked]` +
      etopsBlock,
    data: {
      tail,
      etops: ops.etopsApproval.maxMinutes,
      melItems: [],
      etopsAnalysis: etopsData,
    },
    source: etopsData.applicable
      ? `mock://fleet-system + etops-calc + aviationweather:metar`
      : `mock://fleet-system`,
  };
}

export function weightBalance(f: OwnFlight): PhaseResult {
  const pax = f.paxLoad ?? 0;
  return {
    summary:
      `ZFW 198,200 kg · TOW 267,120 kg · LDW 208,720 kg. CG at TOW 24.3% MAC (envelope 18-32%). ` +
      `${pax} pax loaded, cargo 14.2t. Within all limits. [mocked — load planning not integrated]`,
    data: { zfw: 198200, tow: 267120, ldw: 208720, cgPct: 24.3, paxLoad: pax },
    source: 'mock://load-planning',
  };
}

export async function crew(f: OwnFlight): Promise<PhaseResult> {
  // Pull the current roster + assignment snapshot (provider-cached so multiple
  // phases per request don't fan out into separate fetches).
  const [roster, assignments] = await Promise.all([getRoster(), getAssignments()]);
  const flightNo = `${f.carrier}${f.flightNumber}`;
  const assigned = assignmentsForFlight(roster, assignments, flightNo);

  if (assigned.length === 0) {
    return {
      summary: `No crew assigned to ${flightNo}. Crew system shows no pairing — coordinate with crew control.`,
      data: { flightNo, assigned: [], fatigue: [], maxScore: 0 },
      source: 'crew-provider (no assignment)',
    };
  }

  const fatigue = scoreCrewBatch(assigned, { origin: f.origin, destination: f.destination });
  const maxScore = Math.max(0, ...fatigue.map((s) => s.score));
  const highFatigue = fatigue.filter((s) => s.flag === 'high_fatigue');
  const rejected    = fatigue.filter((s) => s.flag === 'reject');

  // Build a one-line headline + per-crew detail lines.
  const lines: string[] = [
    `${assigned.length}-crew assigned (${assigned.filter((c) => c.role === 'CAP').length} CAP, ${assigned.filter((c) => c.role === 'FO').length} FO).`,
  ];
  if (rejected.length > 0) {
    lines.push(`⛔ Crew above ${REJECT_FATIGUE_THRESHOLD} fatigue (dispatch blocked): ${rejected.map((r) => `${r.name} (${r.score})`).join(', ')}.`);
  } else if (highFatigue.length > 0) {
    lines.push(`⚠ Elevated fatigue (>${HIGH_FATIGUE_THRESHOLD}): ${highFatigue.map((r) => `${r.name} (${r.score})`).join(', ')}.`);
  } else {
    lines.push(`Max fatigue score ${maxScore}/100 — within limits.`);
  }
  for (const s of fatigue) {
    lines.push(`  · ${s.name} (${s.crewId}): score ${s.score} — FDP ${s.breakdown.fdp}, rest ${s.breakdown.rest}, TZ ${s.breakdown.timezone}`);
  }

  return {
    summary: lines.join('\n'),
    data: {
      flightNo,
      assigned: assigned.map((c) => ({ id: c.id, name: c.name, role: c.role, base: c.base })),
      fatigue,
      maxScore,
      blocked: rejected.length > 0,
    },
    source: rejected.length > 0
      ? `crew-provider + fatigue-calc (BLOCKED: ${rejected.length} above ${REJECT_FATIGUE_THRESHOLD})`
      : `crew-provider + fatigue-calc`,
  };
}

export function slotAtc(f: OwnFlight): PhaseResult {
  const std = depTimeHHmm(f);
  return {
    summary:
      `CTOT confirmed: STD ${std} (no ATFM regulation). ICAO FPL submission pending. ` +
      `[mocked — Eurocontrol NM not integrated]`,
    data: { ctot: f.scheduledDeparture, ifpsAccepted: false, regulation: null },
    source: 'mock://eurocontrol-nm',
  };
}

export async function runPhase(id: PhaseId, f: OwnFlight, authToken: string | null): Promise<PhaseResult> {
  switch (id) {
    case 'brief':          return brief(f, authToken);
    case 'route':          return route(f, authToken);
    case 'fuel':           return fuel(f, authToken);
    case 'aircraft':       return aircraft(f, authToken);
    case 'weight_balance': return weightBalance(f);
    case 'crew':           return crew(f);
    case 'slot_atc':       return slotAtc(f);
  }
}
