'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Zap, Loader2, Clock, ArrowRight } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';
import { AutoPrepareProgress, usePollRun, type AutoPrepareRun } from '@/components/AutoPrepareProgress';

interface FlightRow {
  id: string;
  flight: string;
  origin: string;
  destination: string;
  scheduled: string;
  aircraft: string;
  paxLoad: number;
}

// Mock day's rotation. Replace with /api/planner/eod or fleet feed.
const TODAY: FlightRow[] = [
  { id: '1', flight: 'BA1000', origin: 'JFK', destination: 'LHR', scheduled: '09:45', aircraft: 'Boeing 777-300ER', paxLoad: 287 },
  { id: '2', flight: 'AA2111', origin: 'JFK', destination: 'CDG', scheduled: '11:15', aircraft: 'Airbus A330-300', paxLoad: 244 },
  { id: '3', flight: 'LH4410', origin: 'JFK', destination: 'FRA', scheduled: '14:00', aircraft: 'Airbus A380-800', paxLoad: 489 },
  { id: '4', flight: 'EK5500', origin: 'JFK', destination: 'DXB', scheduled: '16:30', aircraft: 'Airbus A380-800', paxLoad: 502 },
  { id: '5', flight: 'AF7700', origin: 'BOS', destination: 'CDG', scheduled: '19:50', aircraft: 'Airbus A350-900', paxLoad: 312 },
  { id: '6', flight: 'KL6612', origin: 'BOS', destination: 'AMS', scheduled: '21:10', aircraft: 'Boeing 787-9', paxLoad: 296 },
];

type Window = 'next2h' | 'next4h' | 'today';

const WINDOWS: { id: Window; label: string; minutes: number | null }[] = [
  { id: 'next2h', label: 'Next 2h',  minutes: 120 },
  { id: 'next4h', label: 'Next 4h',  minutes: 240 },
  { id: 'today',  label: 'All today', minutes: null },
];

function minutesUntil(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

function FlightProgressRow({ flight, runId }: { flight: FlightRow; runId: string | null }) {
  const [run, setRun] = useState<AutoPrepareRun | null>(null);
  const onUpdate = useCallback((r: AutoPrepareRun) => setRun(r), []);
  usePollRun(runId, onUpdate);

  const eta = minutesUntil(flight.scheduled);
  const etaLabel = eta < 0 ? `${-eta}m ago` : `T-${eta}m`;

  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{flight.flight}</span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock size={11} /> {flight.scheduled} · {etaLabel}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {flight.origin} → {flight.destination} · {flight.aircraft} · {flight.paxLoad} pax
          </p>
        </div>
        <Link
          href="/planner"
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
        >
          Review <ArrowRight size={12} />
        </Link>
      </div>
      {run ? <AutoPrepareProgress run={run} /> : (
        <p className="text-xs text-gray-400">Not started.</p>
      )}
    </div>
  );
}

export default function PlannerBatchPage() {
  const [windowSel, setWindowSel] = useState<Window>('next4h');
  const [runIdsByFlight, setRunIdsByFlight] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(TODAY.map((f) => f.id)));

  const filtered = useMemo(() => {
    const win = WINDOWS.find((w) => w.id === windowSel)!;
    return TODAY
      .filter((f) => {
        if (win.minutes === null) return true;
        const m = minutesUntil(f.scheduled);
        return m >= -30 && m <= win.minutes; // include flights up to 30 min in the past
      })
      .sort((a, b) => a.scheduled.localeCompare(b.scheduled));
  }, [windowSel]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const startBatch = async () => {
    const flights = filtered.filter((f) => selected.has(f.id));
    if (flights.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/planner/auto-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flights }),
      });
      const json = (await res.json()) as { runs: { runId: string; flight: string; scheduled: string }[] };
      const map: Record<string, string> = { ...runIdsByFlight };
      // Match returned runs back to flight rows by flight number + scheduled time.
      for (const r of json.runs ?? []) {
        const row = flights.find((f) => f.flight === r.flight && f.scheduled === r.scheduled);
        if (row) map[row.id] = r.runId;
      }
      setRunIdsByFlight(map);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Bank Auto-Prepare</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pre-plan a wave of flights at once. Standard dispatcher practice: kick off T-4h for the whole bank,
          review individually as STD approaches.
        </p>
      </header>

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWindowSel(w.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                windowSel === w.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">
            {selected.size}/{filtered.length} selected
          </p>
          <button
            onClick={startBatch}
            disabled={busy || selected.size === 0}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400 hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Auto-prepare batch
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">No flights in the selected window.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((f) => (
            <div key={f.id} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
                className="mt-5 ml-2 accent-indigo-600"
                aria-label={`select ${f.flight}`}
              />
              <div className="flex-1 min-w-0">
                <FlightProgressRow flight={f} runId={runIdsByFlight[f.id] ?? null} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
