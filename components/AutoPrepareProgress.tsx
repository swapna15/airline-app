'use client';

import { useEffect } from 'react';
import { Loader2, Check, AlertTriangle, CircleDashed } from 'lucide-react';

type PhaseId =
  | 'brief'
  | 'route'
  | 'crew'
  | 'slot_atc'
  | 'aircraft'
  | 'fuel'
  | 'weight_balance';

type PhaseStatus = 'pending' | 'running' | 'ready' | 'failed';

interface RunPhaseState {
  status: PhaseStatus;
  summary?: string;
  source?: string;
  data?: unknown;
  durationMs?: number;
  error?: string;
}

export interface AutoPrepareRun {
  id: string;
  status: 'running' | 'completed' | 'partial' | 'failed';
  phases: Record<PhaseId, RunPhaseState>;
  totalMs?: number;
}

const PHASE_LABEL: Record<PhaseId, string> = {
  brief:          'Brief',
  route:          'Route',
  crew:           'Crew',
  slot_atc:       'Slot/ATC',
  aircraft:       'Aircraft',
  fuel:           'Fuel',
  weight_balance: 'W&B',
};

const ORDER: PhaseId[] = ['brief', 'route', 'crew', 'slot_atc', 'aircraft', 'fuel', 'weight_balance'];

export function usePollRun(
  runId: string | null,
  onUpdate: (run: AutoPrepareRun) => void,
  intervalMs = 1000,
) {
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/planner/auto-prepare/${runId}`);
        if (!res.ok) return;
        const run = (await res.json()) as AutoPrepareRun;
        if (cancelled) return;
        onUpdate(run);
        if (run.status === 'running') {
          timer = setTimeout(tick, intervalMs);
        }
      } catch {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, intervalMs, onUpdate]);
}

function PhasePill({ id, state }: { id: PhaseId; state: RunPhaseState }) {
  const base = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border';
  if (state.status === 'running') {
    return (
      <span className={`${base} border-blue-200 bg-blue-50 text-blue-700`}>
        <Loader2 size={11} className="animate-spin" /> {PHASE_LABEL[id]}
      </span>
    );
  }
  if (state.status === 'ready') {
    return (
      <span className={`${base} border-green-200 bg-green-50 text-green-700`}>
        <Check size={11} /> {PHASE_LABEL[id]}
      </span>
    );
  }
  if (state.status === 'failed') {
    return (
      <span className={`${base} border-red-200 bg-red-50 text-red-700`} title={state.error}>
        <AlertTriangle size={11} /> {PHASE_LABEL[id]}
      </span>
    );
  }
  return (
    <span className={`${base} border-gray-200 bg-gray-50 text-gray-500`}>
      <CircleDashed size={11} /> {PHASE_LABEL[id]}
    </span>
  );
}

export function AutoPrepareProgress({ run }: { run: AutoPrepareRun | null }) {
  if (!run) return null;
  const ready  = ORDER.filter((p) => run.phases[p].status === 'ready').length;
  return (
    <div className="rounded-xl border border-gray-200 p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Auto-prepare · {ready}/{ORDER.length} ready
          {run.status !== 'running' && run.totalMs ? ` · ${(run.totalMs / 1000).toFixed(1)}s` : ''}
        </p>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
          run.status === 'running'   ? 'bg-blue-50 text-blue-700' :
          run.status === 'completed' ? 'bg-green-50 text-green-700' :
          run.status === 'partial'   ? 'bg-amber-50 text-amber-700' :
                                       'bg-red-50 text-red-700'
        }`}>
          {run.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((p) => <PhasePill key={p} id={p} state={run.phases[p]} />)}
      </div>
    </div>
  );
}
