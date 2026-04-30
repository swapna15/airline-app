'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';
import {
  CATEGORY_LABEL, CATEGORY_COLOR,
  type HazardCategory, type ClassifiedSigmet,
} from '@/lib/sigmet-classifier';
import type { SigmetBoardResponse } from '@/app/api/planner/sigmet/route';

// Leaflet touches `window` at module load, so the map must be client-only.
const SigmetMap = dynamic(() => import('@/components/SigmetMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <Loader2 size={20} className="animate-spin text-gray-400" />
    </div>
  ),
});

const CATEGORIES: HazardCategory[] = ['turbulence', 'icing', 'volcanic-ash', 'other'];

export default function SigmetPage() {
  const [data, setData] = useState<SigmetBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<HazardCategory | 'all'>('all');
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/planner/sigmet')
      .then((r) => r.json())
      .then((d: SigmetBoardResponse) => setData(d))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Auto-refresh every 10 min while page open (Req 7.5).
  useEffect(() => {
    const i = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [] as ClassifiedSigmet[];
    return filterCat === 'all'
      ? data.sigmets
      : data.sigmets.filter((s) => s.category === filterCat);
  }, [data, filterCat]);

  // When selection changes from a polygon click, scroll the sidebar row into view.
  useEffect(() => {
    if (selectedIndex === null) return;
    const el = sidebarRef.current?.querySelector(`[data-sigmet-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <PlannerTabs />

      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SIGMET / Airspace Overlay</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active international SIGMETs from AviationWeather, color-coded by hazard.
            {data?.generatedAt && (
              <span className="ml-2 text-xs text-gray-400">
                fetched {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </header>

      {data?.source === 'stale' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 mb-4 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong>Stale data.</strong> AviationWeather is currently unavailable
            ({data.error ?? 'unknown error'}). Showing the last successful fetch.
          </span>
        </div>
      )}
      {data?.source === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 mb-4 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Could not fetch SIGMETs and no cached set is available: {data.error ?? 'unknown error'}
          </span>
        </div>
      )}

      {/* Legend + filter */}
      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <span className="text-xs text-gray-500 uppercase tracking-wide">Hazards</span>
        {CATEGORIES.map((c) => {
          const count = data?.sigmets.filter((s) => s.category === c).length ?? 0;
          const active = filterCat === c;
          return (
            <button
              key={c}
              onClick={() => setFilterCat(active ? 'all' : c)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: CATEGORY_COLOR[c] }}
              />
              {CATEGORY_LABEL[c]} ({count})
            </button>
          );
        })}
        <span className="ml-auto text-xs text-gray-500">
          {filtered.length}/{data?.sigmets.length ?? 0} matching
        </span>
      </div>

      <div className="grid grid-cols-12 gap-4 h-[640px]">
        {/* Map */}
        <div className="col-span-8 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
          <SigmetMap
            sigmets={filtered}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
        </div>

        {/* Sidebar */}
        <div ref={sidebarRef} className="col-span-4 overflow-y-auto rounded-xl border border-gray-200 bg-white">
          {loading && !data ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500 gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 p-4 text-center">No SIGMETs match the filter.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((s, i) => {
                const isSel = i === selectedIndex;
                return (
                  <li
                    key={`${s.firId ?? 'unk'}-${i}`}
                    data-sigmet-idx={i}
                    onClick={() => setSelectedIndex(isSel ? null : i)}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSel ? 'bg-gray-50' : 'hover:bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-xs font-semibold uppercase tracking-wide">{s.hazard ?? 'unknown'}</span>
                      <span className="text-xs text-gray-500">· {s.firId ?? '—'}</span>
                    </div>
                    <p className="text-xs text-gray-700">
                      FL {s.minFL ?? '?'}–{s.maxFL ?? '?'}
                      {s.validTimeFrom && (
                        <span className="text-gray-500 ml-2">
                          · {new Date(s.validTimeFrom).toLocaleTimeString()} → {s.validTimeTo ? new Date(s.validTimeTo).toLocaleTimeString() : '?'}
                        </span>
                      )}
                    </p>
                    {s.rawSigmet && isSel && (
                      <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap text-gray-600 bg-gray-50 rounded p-2 max-h-40 overflow-y-auto">
                        {s.rawSigmet}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
