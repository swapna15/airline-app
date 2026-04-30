'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Zap, Loader2, Clock, ArrowRight } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';
import { AutoPrepareProgress, type AutoPrepareRun } from '@/components/AutoPrepareProgress';
import { readNdjson } from '@/lib/ndjson';
import type { OwnFlight } from '@shared/schema/flight';
import {
  displayFlightNo,
  displayDepartureTime,
  minutesUntilDeparture,
} from '@/lib/flight-display';

type Window = 'next2h' | 'next4h' | 'today';

const WINDOWS: { id: Window; label: string; minutes: number | null }[] = [
  { id: 'next2h', label: 'Next 2h',  minutes: 120 },
  { id: 'next4h', label: 'Next 4h',  minutes: 240 },
  { id: 'today',  label: 'All today', minutes: null },
];

function FlightProgressRow({ flight, run }: { flight: OwnFlight; run: AutoPrepareRun | null }) {
  const eta = minutesUntilDeparture(flight);
  const etaLabel = eta < 0 ? `${-eta}m ago` : `T-${eta}m`;

  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{displayFlightNo(flight)}</span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock size={11} /> {displayDepartureTime(flight.scheduledDeparture)} · {etaLabel}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {flight.origin} → {flight.destination} · {flight.aircraftType ?? flight.aircraftIcao} · {flight.paxLoad} pax
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
  const [today, setToday] = useState<OwnFlight[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [windowSel, setWindowSel] = useState<Window>('next4h');
  const [runsByFlight, setRunsByFlight] = useState<Record<string, AutoPrepareRun>>({});
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Load today's airline-owned rotation from /api/flights/own.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/flights/own')
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { flights?: OwnFlight[] };
        return Array.isArray(j.flights) ? j.flights : [];
      })
      .then((fs) => {
        if (cancelled) return;
        setToday(fs);
        setSelected(new Set(fs.map((f) => f.externalId)));
      })
      .finally(() => { if (!cancelled) setTodayLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const win = WINDOWS.find((w) => w.id === windowSel)!;
    return today
      .filter((f) => {
        if (win.minutes === null) return true;
        const m = minutesUntilDeparture(f);
        return m >= -30 && m <= win.minutes; // include flights up to 30 min in the past
      })
      .sort((a, b) => a.scheduledDeparture.localeCompare(b.scheduledDeparture));
  }, [windowSel, today]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const startBatch = async () => {
    const flights = filtered.filter((f) => selected.has(f.externalId));
    if (flights.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/planner/auto-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flights }),
      });
      if (!res.ok) return;

      type Line =
        | {
            type: 'update';
            runId: string;
            externalId: string;
            carrier: string;
            flightNumber: string;
            scheduledDeparture: string;
            run: AutoPrepareRun;
          }
        | { type: 'done' }
        | { type: 'error'; error: string };

      // Each NDJSON line carries one flight's current run snapshot — dispatch
      // back to the right row by canonical externalId.
      for await (const line of readNdjson<Line>(res)) {
        if (line.type !== 'update') continue;
        setRunsByFlight((prev) => ({ ...prev, [line.externalId]: line.run }));
      }
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

      {todayLoading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-12">
          <Loader2 size={14} className="animate-spin" /> Loading today&apos;s rotation…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">No flights in the selected window.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((f) => (
            <div key={f.externalId} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(f.externalId)}
                onChange={() => toggle(f.externalId)}
                className="mt-5 ml-2 accent-indigo-600"
                aria-label={`select ${displayFlightNo(f)}`}
              />
              <div className="flex-1 min-w-0">
                <FlightProgressRow flight={f} run={runsByFlight[f.externalId] ?? null} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
