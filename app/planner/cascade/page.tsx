'use client';

import { useState } from 'react';
import { GitBranch, ArrowRight, Loader2, Users } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';

const FLIGHTS = ['BA1000', 'BA1001', 'AA2110', 'AA2111', 'LH4409', 'LH4410', 'EK5499', 'EK5500'];

interface CascadedLeg {
  flight: string;
  origin: string;
  destination: string;
  originalStd: string;
  originalSta: string;
  newStd: string;
  newSta: string;
  delayMin: number;
  paxLoad: number;
  isOriginating: boolean;
}

interface CascadeResponse {
  rotation: { tail: string; aircraft: string; minGroundMin: number };
  inputDelayMin: number;
  legs: CascadedLeg[];
  downstreamCount: number;
  finalDelayMin: number;
  totalPaxAffected: number;
  source: string;
}

export default function CascadePage() {
  const [flight, setFlight] = useState(FLIGHTS[0]);
  const [delayMin, setDelayMin] = useState(60);
  const [result, setResult] = useState<CascadeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/planner/cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight, delayMin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed');
        setResult(null);
      } else {
        setResult(data);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="text-amber-600" size={22} /> Delay Cascade Simulator
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Propagate a delay forward along the tail&apos;s rotation. Slack between legs absorbs delay where it exists.
        </p>
      </header>

      <section className="grid grid-cols-12 gap-4 mb-6">
        <div className="col-span-5">
          <label className="block text-xs font-medium text-gray-500 mb-1">Originating flight</label>
          <select
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            value={flight}
            onChange={(e) => setFlight(e.target.value)}
          >
            {FLIGHTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="col-span-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Delay (minutes)</label>
          <input
            type="number"
            min={1}
            value={delayMin}
            onChange={(e) => setDelayMin(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
        </div>
        <div className="col-span-3 flex items-end">
          <button
            onClick={run}
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            Simulate
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {result && (
        <section>
          <div className="grid grid-cols-4 gap-3 mb-5">
            <Stat label="Tail" value={result.rotation.tail} sub={result.rotation.aircraft} />
            <Stat label="Min ground time" value={`${result.rotation.minGroundMin} min`} />
            <Stat label="Downstream legs" value={String(result.downstreamCount)} sub={`final delay ${result.finalDelayMin} min`} />
            <Stat label="Pax affected" value={result.totalPaxAffected.toLocaleString()} icon={<Users size={12} />} />
          </div>

          <ol className="space-y-2">
            {result.legs.map((leg, i) => (
              <li
                key={leg.flight}
                className={`border rounded-xl p-4 flex items-center gap-4 ${
                  leg.isOriginating ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                }`}
              >
                <div className="text-xs font-semibold text-gray-400 w-8">{String(i + 1).padStart(2, '0')}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold">{leg.flight}</span>
                    <span className="text-gray-500">{leg.origin} → {leg.destination}</span>
                    {leg.isOriginating && (
                      <span className="text-[10px] uppercase font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">origin</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                    <span>
                      <span className="line-through text-gray-300">{leg.originalStd}/{leg.originalSta}</span>
                      <ArrowRight size={10} className="inline mx-1" />
                      <span className="font-mono font-medium text-gray-700">{leg.newStd}/{leg.newSta}</span>
                    </span>
                    <span className="text-gray-400">·</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {leg.paxLoad}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-lg font-bold ${leg.delayMin > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    +{leg.delayMin}m
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}
