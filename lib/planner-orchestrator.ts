/**
 * In-memory auto-prepare orchestrator.
 *
 * One Run = one flight. Phases execute in dependency order with as much
 * parallelism as the graph allows. Each phase's status / result / error is
 * captured on the run so the UI can render live progress without holding open
 * an SSE connection.
 *
 * Convention matches lib/planner-store.ts: globalThis-attached registry,
 * HMR-safe, restart-clean. Production swap target is Vercel Workflow DevKit
 * (`step.do(...)` per phase, durable on crash) — the phase functions stay the
 * same; only this orchestrator file changes.
 */

import { runPhase, type FlightInput, type PhaseId } from '@/lib/planner-phases';

export type RunPhaseStatus = 'pending' | 'running' | 'ready' | 'failed';

export interface RunPhaseState {
  status: RunPhaseStatus;
  summary?: string;
  source?: string;
  data?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export type RunStatus = 'running' | 'completed' | 'partial' | 'failed';

export interface Run {
  id: string;
  flight: FlightInput;
  status: RunStatus;
  phases: Record<PhaseId, RunPhaseState>;
  startedAt: string;
  finishedAt?: string;
  totalMs?: number;
  reviewerId?: string;
}

interface Registry {
  byId: Map<string, Run>;
  // Index of "live" runs by flight key so the planner can't kick off two
  // parallel runs for the same flight.
  liveByFlight: Map<string, string>;
}

const REG: Registry =
  ((globalThis as unknown) as { __plannerRunRegistry?: Registry }).__plannerRunRegistry
  ?? { byId: new Map(), liveByFlight: new Map() };
((globalThis as unknown) as { __plannerRunRegistry?: Registry }).__plannerRunRegistry = REG;

const ALL_PHASES: PhaseId[] = ['brief', 'route', 'crew', 'slot_atc', 'aircraft', 'fuel', 'weight_balance'];

function flightKey(f: FlightInput): string {
  return `${f.flight}|${f.scheduled}|${f.origin}-${f.destination}`;
}

function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPhases(): Record<PhaseId, RunPhaseState> {
  return Object.fromEntries(
    ALL_PHASES.map((p): [PhaseId, RunPhaseState] => [p, { status: 'pending' }]),
  ) as Record<PhaseId, RunPhaseState>;
}

export function getRun(id: string): Run | undefined {
  return REG.byId.get(id);
}

export function listRuns(): Run[] {
  return Array.from(REG.byId.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function newRun(flight: FlightInput, reviewerId?: string): Run {
  return {
    id: newRunId(),
    flight,
    status: 'running',
    phases: emptyPhases(),
    startedAt: new Date().toISOString(),
    reviewerId,
  };
}

/**
 * Idempotent kick-off: if a run is already live for this flight, return that
 * run instead of starting a duplicate. Released-plan short-circuit lives in
 * the API route (we can't reach the plan store without auth here).
 *
 * Fire-and-forget — the registry is in-memory so this only works when the
 * caller is running on the SAME process for the lifetime of the run. On
 * serverless (Vercel Functions), use `runToCompletion` instead, which awaits
 * inside one invocation and returns the finished Run.
 */
export function startRun(flight: FlightInput, authToken: string | null, reviewerId?: string): Run {
  const key = flightKey(flight);
  const liveId = REG.liveByFlight.get(key);
  if (liveId) {
    const live = REG.byId.get(liveId);
    if (live && live.status === 'running') return live;
  }

  const run = newRun(flight, reviewerId);
  REG.byId.set(run.id, run);
  REG.liveByFlight.set(key, run.id);

  void execute(run, authToken).catch(() => finalize(run));
  return run;
}

/**
 * Synchronous variant — creates a run, awaits all phases, returns the final
 * Run. Use this on serverless (Vercel Functions) where in-memory state
 * doesn't persist across invocations: the caller gets the full result back
 * in the response of one HTTP call, so no polling is required.
 */
export async function runToCompletion(
  flight: FlightInput,
  authToken: string | null,
  reviewerId?: string,
): Promise<Run> {
  const run = newRun(flight, reviewerId);
  REG.byId.set(run.id, run);
  await execute(run, authToken);
  return run;
}

async function runOne(run: Run, id: PhaseId, authToken: string | null): Promise<void> {
  const phase = run.phases[id];
  phase.status = 'running';
  phase.startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const result = await runPhase(id, run.flight, authToken);
    phase.status = 'ready';
    phase.summary = result.summary;
    phase.source = result.source;
    phase.data = result.data;
  } catch (err) {
    phase.status = 'failed';
    phase.error = err instanceof Error ? err.message : String(err);
  } finally {
    phase.finishedAt = new Date().toISOString();
    phase.durationMs = Date.now() - t0;
  }
}

async function execute(run: Run, authToken: string | null): Promise<void> {
  // Tier 1 — independent phases run in parallel.
  await Promise.all([
    runOne(run, 'brief',    authToken),
    runOne(run, 'route',    authToken),
    runOne(run, 'crew',     authToken),
    runOne(run, 'slot_atc', authToken),
  ]);

  // Tier 2 — aircraft depends on route (ETOPS / oceanic from distance).
  // If route failed, we still attempt aircraft using mocked logic.
  await runOne(run, 'aircraft', authToken);

  // Tier 3 — fuel depends on route + aircraft (block fuel vs MTOW headroom).
  await runOne(run, 'fuel', authToken);

  // Tier 4 — weight_balance depends on fuel (block fuel mass into TOW).
  await runOne(run, 'weight_balance', authToken);

  finalize(run);
}

function finalize(run: Run): void {
  const failed = ALL_PHASES.filter((p) => run.phases[p].status === 'failed');
  const ready  = ALL_PHASES.filter((p) => run.phases[p].status === 'ready');
  if (failed.length === 0)            run.status = 'completed';
  else if (ready.length === 0)        run.status = 'failed';
  else                                run.status = 'partial';

  run.finishedAt = new Date().toISOString();
  run.totalMs = Date.now() - new Date(run.startedAt).getTime();

  // Drop the live-by-flight index so a follow-up run can start.
  const key = flightKey(run.flight);
  if (REG.liveByFlight.get(key) === run.id) REG.liveByFlight.delete(key);
}
