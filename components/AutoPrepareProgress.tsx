'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle, CircleDashed, ChevronDown, ChevronRight } from 'lucide-react';

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
  startedAt?: string;
  finishedAt?: string;
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

const PHASE_DESC: Record<PhaseId, string> = {
  brief:          'METAR/TAF/SIGMET + NOTAM digest, AI-summarized',
  route:          'Great-circle distance, heading, block time',
  crew:           'Pilot + cabin crew currency and FDP check',
  slot_atc:       'CTOT confirmation + ICAO FPL filing',
  aircraft:       'Tail assignment, ETOPS + MEL applicability',
  fuel:           'Trip + contingency + alternate + reserve + taxi',
  weight_balance: 'ZFW / TOW / LDW + CG envelope check',
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

function PhaseRow({ id, state }: { id: PhaseId; state: RunPhaseState }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(state.summary || state.error || state.source);
  const dur = state.durationMs ? `${(state.durationMs / 1000).toFixed(1)}s` : null;

  let icon: JSX.Element;
  let rowTone: string;
  if (state.status === 'running') {
    icon = <Loader2 size={13} className="animate-spin text-blue-600" />;
    rowTone = 'border-blue-200 bg-blue-50/40';
  } else if (state.status === 'ready') {
    icon = <Check size={13} className="text-green-600" />;
    rowTone = 'border-green-200';
  } else if (state.status === 'failed') {
    icon = <AlertTriangle size={13} className="text-red-600" />;
    rowTone = 'border-red-200 bg-red-50/30';
  } else {
    icon = <CircleDashed size={13} className="text-gray-400" />;
    rowTone = 'border-gray-200';
  }

  return (
    <div className={`border rounded-lg ${rowTone}`}>
      <button
        onClick={() => hasDetail && setOpen((v) => !v)}
        disabled={!hasDetail}
        className="w-full flex items-center gap-2 px-3 py-2 text-left disabled:cursor-default"
      >
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{PHASE_LABEL[id]}</span>
            {dur && <span className="text-[10px] text-gray-400">{dur}</span>}
          </div>
          <p className="text-[11px] text-gray-500 truncate">{PHASE_DESC[id]}</p>
        </div>
        {hasDetail && (open ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />)}
      </button>
      {open && hasDetail && (
        <div className="border-t border-gray-200 px-3 py-2 space-y-1.5 bg-white">
          {state.summary && (
            <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{state.summary}</p>
          )}
          {state.error && (
            <p className="text-xs text-red-700 font-mono whitespace-pre-wrap">{state.error}</p>
          )}
          {state.source && (
            <p className="text-[10px] text-gray-400">source: {state.source}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AutoPrepareProgress({ run }: { run: AutoPrepareRun | null }) {
  const [expanded, setExpanded] = useState(true);
  if (!run) return null;
  const ready  = ORDER.filter((p) => run.phases[p].status === 'ready').length;
  const failed = ORDER.filter((p) => run.phases[p].status === 'failed').length;
  return (
    <div className="rounded-xl border border-gray-200 p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 hover:text-gray-900"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Auto-prepare · {ready}/{ORDER.length} ready
          {failed > 0 ? ` · ${failed} failed` : ''}
          {run.status !== 'running' && run.totalMs ? ` · ${(run.totalMs / 1000).toFixed(1)}s` : ''}
        </button>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
          run.status === 'running'   ? 'bg-blue-50 text-blue-700' :
          run.status === 'completed' ? 'bg-green-50 text-green-700' :
          run.status === 'partial'   ? 'bg-amber-50 text-amber-700' :
                                       'bg-red-50 text-red-700'
        }`}>
          {run.status}
        </span>
      </div>
      {/* Compact pills always visible — quick at-a-glance progress */}
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((p) => <PhasePill key={p} id={p} state={run.phases[p]} />)}
      </div>
      {/* Detailed per-phase rows; expandable to keep the strip compact when not needed */}
      {expanded && (
        <div className="mt-3 space-y-1.5">
          {ORDER.map((p) => <PhaseRow key={p} id={p} state={run.phases[p]} />)}
        </div>
      )}
    </div>
  );
}
