'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Check, AlertTriangle, Loader2, Sparkles, FileSignature, Clock, Lock, Zap } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';
import { AutoPrepareProgress, type AutoPrepareRun } from '@/components/AutoPrepareProgress';
import { readNdjson } from '@/lib/ndjson';
import type { OwnFlight } from '@shared/schema/flight';
import { displayFlightNo, displayDepartureTime, toFlightInput, todayAt } from '@/lib/flight-display';

type PhaseId =
  | 'brief'
  | 'aircraft'
  | 'route'
  | 'fuel'
  | 'weight_balance'
  | 'crew'
  | 'slot_atc'
  | 'release';

type PhaseStatus = 'pending' | 'generating' | 'ready' | 'approved' | 'rejected';

interface PhaseState {
  status: PhaseStatus;
  summary?: string;
  source?: string;
  data?: unknown;
  comment?: string;
}

type PhasesMap = Record<PhaseId, PhaseState>;
type PlanStatus = 'draft' | 'in_review' | 'released' | 'flown' | 'cancelled';

interface FlightPlan {
  flightId: string;
  status: PlanStatus;
  phases: PhasesMap;
  releasedAt?: string;
  releasedBy?: string;
}

// Mock data conforms to the canonical OwnFlight schema. When this is replaced
// by a fetch from the deployed flights table, the type stays the same and
// nothing downstream changes.
const MOCK_FLIGHTS: OwnFlight[] = [
  { source: 'own', externalId: '1', carrier: 'BA', flightNumber: '1000', origin: 'JFK', destination: 'LHR', scheduledDeparture: todayAt('09:45'), scheduledArrival: todayAt('21:45'), aircraftIcao: 'B77W', aircraftType: 'Boeing 777-300ER', tail: 'G-XLEK', paxLoad: 287 },
  { source: 'own', externalId: '2', carrier: 'AA', flightNumber: '2111', origin: 'JFK', destination: 'CDG', scheduledDeparture: todayAt('11:15'), scheduledArrival: todayAt('23:30'), aircraftIcao: 'A333', aircraftType: 'Airbus A330-300',  paxLoad: 244 },
  { source: 'own', externalId: '3', carrier: 'LH', flightNumber: '4410', origin: 'JFK', destination: 'FRA', scheduledDeparture: todayAt('14:00'), scheduledArrival: todayAt('02:30'), aircraftIcao: 'A388', aircraftType: 'Airbus A380-800',  paxLoad: 489 },
  { source: 'own', externalId: '4', carrier: 'EK', flightNumber: '5500', origin: 'JFK', destination: 'DXB', scheduledDeparture: todayAt('16:30'), scheduledArrival: todayAt('07:30'), aircraftIcao: 'A388', aircraftType: 'Airbus A380-800',  paxLoad: 502 },
];

const PHASES: { id: PhaseId; label: string; description: string }[] = [
  { id: 'brief',          label: 'Pre-flight Brief',     description: 'WX outlook, NOTAM digest, ops bulletins' },
  { id: 'aircraft',       label: 'Aircraft Assignment',  description: 'Tail selection — range, ETOPS, MEL, maintenance window' },
  { id: 'route',          label: 'Route Build',          description: 'Optimum-cost airways factoring winds aloft & restricted airspace' },
  { id: 'fuel',           label: 'Fuel Plan',            description: 'Trip + contingency + alternate + reserve + taxi' },
  { id: 'weight_balance', label: 'Weight & Balance',     description: 'ZFW, TOW, LDW, CG envelope check' },
  { id: 'crew',           label: 'Crew Check',           description: 'Currency + FDP / FTL legality' },
  { id: 'slot_atc',       label: 'Slot & ATC',           description: 'Confirm CTOT, file ICAO FPL' },
  { id: 'release',        label: 'Dispatch Release',     description: 'Sign release, brief PIC' },
];

const STATUS_PILL: Record<PhaseStatus, string> = {
  pending:    'bg-gray-100 text-gray-500',
  generating: 'bg-blue-50 text-blue-600',
  ready:      'bg-amber-50 text-amber-700',
  approved:   'bg-green-50 text-green-700',
  rejected:   'bg-red-50 text-red-700',
};

export default function PlannerPage() {
  const { data: session } = useSession();
  const reviewerId = (session?.user as { email?: string })?.email ?? 'anonymous';

  const [selectedId, setSelectedId] = useState<string>(MOCK_FLIGHTS[0].externalId);
  const [plan, setPlan] = useState<FlightPlan | null>(null);
  const [activeRejectPhase, setActiveRejectPhase] = useState<PhaseId | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoRun, setAutoRun] = useState<AutoPrepareRun | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const selected = MOCK_FLIGHTS.find((f) => f.externalId === selectedId)!;
  const phases = plan?.phases;
  const released = plan?.status === 'released';

  // Empty-phases template — used when the upstream returns a partial or
  // missing phases map (auth error, network glitch, etc.) so downstream code
  // can always assume all 8 keys exist.
  const emptyPhases = useCallback((): PhasesMap => ({
    brief:          { status: 'pending' },
    aircraft:       { status: 'pending' },
    route:          { status: 'pending' },
    fuel:           { status: 'pending' },
    weight_balance: { status: 'pending' },
    crew:           { status: 'pending' },
    slot_atc:       { status: 'pending' },
    release:        { status: 'pending' },
  }), []);

  const normalizePlan = useCallback((raw: unknown): FlightPlan => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<FlightPlan>;
    return {
      flightId: r.flightId ?? selectedId,
      status:   r.status   ?? 'draft',
      phases:   { ...emptyPhases(), ...(r.phases ?? {}) },
      releasedAt: r.releasedAt,
      releasedBy: r.releasedBy,
    };
  }, [selectedId, emptyPhases]);

  // Load plan whenever the selected flight changes. Defensive: any non-OK
  // response (auth error, 5xx, malformed body) falls back to a fresh empty
  // plan so the UI doesn't crash on `plan.phases[id]`.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAutoRun(null);
    setAutoBusy(false);
    fetch(`/api/planner/plans/${selectedId}`)
      .then(async (r) => {
        if (!r.ok) return null;
        try { return await r.json(); } catch { return null; }
      })
      .then((raw) => { if (!cancelled) setPlan(normalizePlan(raw)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, normalizePlan]);

  const surfaceError = useCallback(async (res: Response, action: string) => {
    let msg: string;
    try {
      const body = await res.json();
      msg = body?.error || body?.message || `HTTP ${res.status}`;
    } catch {
      msg = `HTTP ${res.status}`;
    }
    setPersistError(`${action} failed: ${msg} (status ${res.status})`);
  }, []);

  const persistPhase = useCallback(async (id: PhaseId, next: PhaseState) => {
    if (!plan) return;
    const updated: FlightPlan = { ...plan, phases: { ...plan.phases, [id]: next } };
    setPlan(updated); // optimistic
    const res = await fetch(`/api/planner/plans/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phases: { [id]: next } }),
    });
    if (res.ok) {
      setPersistError(null);
      try { setPlan(normalizePlan(await res.json())); } catch { /* keep optimistic */ }
    } else {
      await surfaceError(res, 'Save phase');
    }
  }, [plan, selectedId, normalizePlan, surfaceError]);

  const persistManyPhases = useCallback(async (updates: Partial<PhasesMap>) => {
    if (!plan) return;
    const merged: PhasesMap = { ...plan.phases };
    for (const k of Object.keys(updates) as PhaseId[]) {
      const u = updates[k];
      if (u) merged[k] = u;
    }
    const updated: FlightPlan = { ...plan, phases: merged };
    setPlan(updated);
    const res = await fetch(`/api/planner/plans/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phases: updates }),
    });
    if (res.ok) {
      setPersistError(null);
      try { setPlan(normalizePlan(await res.json())); } catch { /* keep optimistic */ }
    } else {
      await surfaceError(res, 'Save plan');
    }
  }, [plan, selectedId, normalizePlan, surfaceError]);

  // Fold completed phases into the plan as `ready` so the planner can
  // approve/reject them through the existing per-phase UI.
  const applyRunToPlan = useCallback((run: AutoPrepareRun) => {
    if (!plan || !plan.phases || released) return;
    const updates: Partial<PhasesMap> = {};
    const runPhaseIds = Object.keys(run.phases ?? {}) as (keyof typeof run.phases)[];
    for (const id of runPhaseIds) {
      const rp = run.phases[id];
      const cur = plan.phases[id as PhaseId] ?? { status: 'pending' as const };
      if (rp?.status === 'ready' && cur.status !== 'approved' && cur.summary !== rp.summary) {
        updates[id as PhaseId] = {
          status: 'ready',
          summary: rp.summary,
          source: rp.source,
          data: rp.data,
        };
      }
      if (rp?.status === 'failed' && cur.status === 'pending') {
        updates[id as PhaseId] = { status: 'rejected', comment: rp.error ?? 'auto-prepare failed' };
      }
    }
    if (Object.keys(updates).length > 0) {
      void persistManyPhases(updates);
    }
  }, [plan, released, persistManyPhases]);

  // POST returns an NDJSON stream — one JSON line per phase transition. We
  // update the UI on every line so the planner sees phases flip from gray to
  // running to ready in real time. Final line is a `{type:"done"}` sentinel.
  const startAutoPrepare = async () => {
    if (!plan || released || autoBusy) return;
    setAutoBusy(true);
    try {
      const res = await fetch('/api/planner/auto-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight: toFlightInput(selected) }),
      });
      if (!res.ok) return;

      type Line =
        | { type: 'update'; runId: string; run: AutoPrepareRun }
        | { type: 'done' }
        | { type: 'error'; error: string };

      let last: AutoPrepareRun | null = null;
      for await (const line of readNdjson<Line>(res)) {
        if (line.type === 'update') {
          last = line.run;
          setAutoRun(line.run);
        }
      }
      if (last) applyRunToPlan(last);
    } finally {
      setAutoBusy(false);
    }
  };

  const recordReview = useCallback(
    (phase: PhaseId, action: 'approve' | 'reject' | 'release', comment?: string) =>
      fetch(`/api/planner/plans/${selectedId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, action, comment, reviewerId }),
      }),
    [selectedId, reviewerId],
  );

  const generatePhase = async (id: PhaseId) => {
    if (!plan || released) return;
    await persistPhase(id, { status: 'generating' });
    try {
      const res = await fetch(`/api/planner/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight: toFlightInput(selected) }),
      });
      const data = await res.json();
      await persistPhase(id, { status: 'ready', summary: data.summary, source: data.source, data: data.data });
    } catch {
      await persistPhase(id, { status: 'rejected', comment: 'Failed to generate' });
    }
  };

  const approvePhase = async (id: PhaseId) => {
    if (!plan || released) return;
    await persistPhase(id, { ...plan.phases[id], status: 'approved' });
    await recordReview(id, 'approve');
  };

  // Bulk-approve every ready phase. Auto-prepare leaves phases in `ready`
  // (human review still required by design); this is the one-click bridge to
  // get from auto-prepare to a state where Release Dispatch enables.
  const approveAllReady = async () => {
    if (!plan || !plan.phases || released) return;
    const updates: Partial<PhasesMap> = {};
    const ready: PhaseId[] = [];
    for (const p of PHASES.slice(0, -1)) {
      const ph = plan.phases[p.id];
      if (ph && ph.status === 'ready') {
        updates[p.id] = { ...ph, status: 'approved' };
        ready.push(p.id);
      }
    }
    if (ready.length === 0) return;
    await persistManyPhases(updates);
    await Promise.all(ready.map((id) => recordReview(id, 'approve')));
  };

  const rejectPhase = async (id: PhaseId) => {
    if (!plan || released) return;
    const comment = rejectComment;
    setActiveRejectPhase(null);
    setRejectComment('');
    await persistPhase(id, { ...plan.phases[id], status: 'rejected', comment });
    await recordReview(id, 'reject', comment);
  };

  const releaseDispatch = async () => {
    if (!plan || released) return;
    const releasedAt = new Date().toISOString();
    const next: FlightPlan = {
      ...plan,
      status: 'released',
      releasedAt,
      releasedBy: reviewerId,
      phases: { ...plan.phases, release: { status: 'approved', summary: `Dispatch released ${new Date(releasedAt).toLocaleTimeString()} by ${reviewerId}` } },
    };
    setPlan(next);
    await fetch(`/api/planner/plans/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'released', releasedAt, releasedBy: reviewerId, phases: next.phases }),
    });
    await recordReview('release', 'release');
  };

  const reviewablePhases = PHASES.slice(0, -1);
  const approvedCount = phases ? reviewablePhases.filter((p) => phases[p.id]?.status === 'approved').length : 0;
  const readyCount    = phases ? reviewablePhases.filter((p) => phases[p.id]?.status === 'ready').length    : 0;
  const allApproved   = approvedCount === reviewablePhases.length;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />
      <div className="grid grid-cols-12 gap-6">
      {/* Flights to plan */}
      <aside className="col-span-4 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Flights Needing Plan</h2>
        {MOCK_FLIGHTS.map((f) => (
          <button
            key={f.externalId}
            onClick={() => setSelectedId(f.externalId)}
            className={`w-full text-left p-4 rounded-xl border transition-colors ${
              f.externalId === selectedId
                ? 'border-amber-300 bg-amber-50/40'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm">{displayFlightNo(f)}</span>
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock size={11} /> {displayDepartureTime(f.scheduledDeparture)}
              </span>
            </div>
            <p className="text-sm text-gray-600">{f.origin} → {f.destination}</p>
            <p className="text-xs text-gray-400 mt-1">{f.aircraftType ?? f.aircraftIcao} · {f.paxLoad} pax</p>
          </button>
        ))}
      </aside>

      {/* Workflow stepper */}
      <section className="col-span-8 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{displayFlightNo(selected)}</h1>
            <p className="text-sm text-gray-500">
              {selected.origin} → {selected.destination} · {selected.aircraftType ?? selected.aircraftIcao} · STD {displayDepartureTime(selected.scheduledDeparture)}
            </p>
          </div>
          {released ? (
            <span className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold flex items-center gap-1.5">
              <FileSignature size={13} /> Released
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {approvedCount}/{reviewablePhases.length} approved
              </span>
              <button
                onClick={startAutoPrepare}
                disabled={autoBusy || loading}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400 hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                title="Run brief / route / aircraft / fuel / W&B / crew / slot in parallel and present for review"
              >
                {autoBusy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Auto-prepare
              </button>
              <button
                onClick={approveAllReady}
                disabled={readyCount === 0 || loading}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400 hover:bg-green-700 transition-colors flex items-center gap-1.5"
                title="One-click approve every phase still in `ready` status — bypasses individual review"
              >
                <Check size={13} /> Approve all ready{readyCount > 0 ? ` (${readyCount})` : ''}
              </button>
              <button
                onClick={releaseDispatch}
                disabled={!allApproved || loading}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400 hover:bg-amber-700 transition-colors"
              >
                Release Dispatch
              </button>
            </div>
          )}
        </header>

        {persistError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Save not persisted to the deployed Postgres.</p>
              <p className="text-xs mt-1 font-mono">{persistError}</p>
              <p className="text-xs mt-1 text-red-600">
                Common cause: signed in with a role that lacks <code>flight_planner</code>/<code>admin</code>.
                Check your role badge in the top nav. If 403, sign in as <code>admin@airline.com</code> /
                <code>password</code> or <code>planner@airline.com</code> / <code>password</code>.
                If 401, your <code>NEXTAUTH_SECRET</code> doesn&apos;t match the deployed Lambda&apos;s.
              </p>
            </div>
            <button onClick={() => setPersistError(null)} className="text-red-600 hover:text-red-800 text-xs">
              dismiss
            </button>
          </div>
        )}

        {autoRun && <AutoPrepareProgress run={autoRun} />}

        {loading || !phases ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
            <Loader2 size={14} className="animate-spin" /> Loading plan…
          </div>
        ) : (
          <ol className="space-y-3">
            {PHASES.map((p, i) => {
              const ph = phases[p.id] ?? { status: 'pending' as const };
              const isReleasePhase = p.id === 'release';
              return (
                <li key={p.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-400 w-6">{String(i + 1).padStart(2, '0')}</span>
                        <h3 className="font-semibold text-sm">{p.label}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_PILL[ph.status]}`}>
                          {ph.status}
                        </span>
                        {released && <Lock size={10} className="text-gray-400" />}
                      </div>
                      <p className="text-xs text-gray-500 ml-8">{p.description}</p>

                      {ph.summary && (
                        <div className="mt-3 ml-8 p-3 rounded-lg bg-gray-50 text-sm text-gray-700 whitespace-pre-wrap">
                          {ph.summary}
                          {ph.source && (
                            <p className="text-[11px] text-gray-400 mt-2">source: {ph.source}</p>
                          )}
                        </div>
                      )}

                      {ph.status === 'rejected' && ph.comment && (
                        <div className="mt-2 ml-8 p-2 rounded-lg bg-red-50 text-xs text-red-700 flex items-start gap-1.5">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          <span>{ph.comment}</span>
                        </div>
                      )}

                      {activeRejectPhase === p.id && !released && (
                        <div className="mt-2 ml-8 flex gap-2">
                          <input
                            autoFocus
                            value={rejectComment}
                            onChange={(e) => setRejectComment(e.target.value)}
                            placeholder="Why is this being rejected?"
                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded"
                          />
                          <button
                            onClick={() => rejectPhase(p.id)}
                            disabled={!rejectComment}
                            className="px-2 py-1 text-xs rounded bg-red-600 text-white disabled:bg-gray-200"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => { setActiveRejectPhase(null); setRejectComment(''); }}
                            className="px-2 py-1 text-xs rounded border border-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {!isReleasePhase && !released && (
                      <div className="flex gap-2 shrink-0">
                        {ph.status === 'pending' && (
                          <button
                            onClick={() => generatePhase(p.id)}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors flex items-center gap-1"
                          >
                            <Sparkles size={11} /> Generate
                          </button>
                        )}
                        {ph.status === 'generating' && (
                          <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium flex items-center gap-1">
                            <Loader2 size={11} className="animate-spin" /> Working
                          </span>
                        )}
                        {ph.status === 'ready' && (
                          <>
                            <button
                              onClick={() => approvePhase(p.id)}
                              className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1"
                            >
                              <Check size={11} /> Approve
                            </button>
                            <button
                              onClick={() => setActiveRejectPhase(p.id)}
                              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {ph.status === 'rejected' && (
                          <button
                            onClick={() => generatePhase(p.id)}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50 transition-colors"
                          >
                            Re-generate
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      </div>
    </div>
  );
}
