'use client';

import { useState } from 'react';
import { Loader2, Fuel, Plane, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';

const FLIGHTS = [
  { flight: 'BA1000', origin: 'JFK', destination: 'LHR', aircraft: 'Boeing 777-300ER' },
  { flight: 'AA2111', origin: 'JFK', destination: 'CDG', aircraft: 'Airbus A330-300' },
  { flight: 'LH4410', origin: 'JFK', destination: 'FRA', aircraft: 'Airbus A380-800' },
  { flight: 'EK5500', origin: 'JFK', destination: 'DXB', aircraft: 'Airbus A380-800' },
];

interface PriceSide {
  icao: string;
  iata: string;
  priceUsdPerUSG: number;
  currency?: string;
  components?: { base: number; differential: number; intoPlane: number; tax: number };
  supplier?: string;
  contractRef?: string;
  asOf?: string;
}

interface TankeringResponse {
  flight: string;
  origin: PriceSide;
  destination: PriceSide;
  tripHours: number;
  tripFuelKg: number;
  blockFuelKg: number;
  tankerKg: number;
  tankerUSG: number;
  carryPenaltyKg: number;
  carryPenaltyUsd: number;
  grossSavingsUsd: number;
  netSavingsUsd: number;
  recommend: boolean;
  risks: string[];
  source: string;
}

interface TankeringError { error: string; hint?: string }

export default function TankeringPage() {
  const [selected, setSelected] = useState(FLIGHTS[0]);
  const [tankerKg, setTankerKg] = useState<number | ''>('');
  const [result, setResult]     = useState<TankeringResponse | null>(null);
  const [error, setError]       = useState<TankeringError | null>(null);
  const [loading, setLoading]   = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/planner/tankering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selected,
          tankerKg: tankerKg === '' ? undefined : Number(tankerKg),
        }),
      });
      const data = await res.json();
      if (res.ok) setResult(data); else setError(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Fuel className="text-amber-600" size={22} /> Tankering Advisor
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Compare origin vs. destination jet-A prices and the burn-to-carry penalty for the trip.
          Recommends only when net savings exceed the extra burn.
        </p>
      </header>

      <section className="grid grid-cols-12 gap-4 mb-6">
        <div className="col-span-6">
          <label className="block text-xs font-medium text-gray-500 mb-1">Flight</label>
          <select
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            value={selected.flight}
            onChange={(e) => setSelected(FLIGHTS.find((f) => f.flight === e.target.value)!)}
          >
            {FLIGHTS.map((f) => (
              <option key={f.flight} value={f.flight}>
                {f.flight} · {f.origin}→{f.destination} · {f.aircraft}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Tanker amount (kg) <span className="text-gray-400 font-normal">— blank = trip fuel</span>
          </label>
          <input
            type="number"
            min={0}
            step={500}
            value={tankerKg}
            onChange={(e) => setTankerKg(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="auto"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
        </div>

        <div className="col-span-3 flex items-end">
          <button
            onClick={run}
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plane size={14} />}
            {loading ? 'Calculating' : 'Evaluate Tankering'}
          </button>
        </div>
      </section>

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-red-700">{error.error}</p>
          {error.hint && <p className="text-xs text-red-600 mt-1">{error.hint}</p>}
        </div>
      )}

      {result && (
        <section className="space-y-6">
          {/* Verdict banner */}
          <div
            className={`border rounded-xl p-5 flex items-center justify-between ${
              result.recommend
                ? 'border-green-300 bg-green-50/50'
                : 'border-red-200 bg-red-50/50'
            }`}
          >
            <div className="flex items-center gap-3">
              {result.recommend
                ? <TrendingUp className="text-green-600" size={28} />
                : <TrendingDown className="text-red-600" size={28} />}
              <div>
                <div className={`text-xl font-bold ${result.recommend ? 'text-green-800' : 'text-red-800'}`}>
                  {result.recommend ? 'TANKER' : 'DO NOT TANKER'}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  net {result.netSavingsUsd >= 0 ? '+' : ''}${result.netSavingsUsd.toLocaleString()} ·
                  gross ${result.grossSavingsUsd.toLocaleString()} − carry ${result.carryPenaltyUsd.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Tanker</div>
              <div className="text-lg font-semibold">{result.tankerKg.toLocaleString()} kg</div>
              <div className="text-xs text-gray-500">{result.tankerUSG.toLocaleString()} USG</div>
            </div>
          </div>

          {/* Price grid */}
          <div className="grid grid-cols-2 gap-4">
            <PriceCard label="Origin" side={result.origin} />
            <PriceCard label="Destination" side={result.destination} />
          </div>

          {/* Numbers panel */}
          <div className="border border-gray-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="Trip time"      value={`${result.tripHours} h`} />
            <Stat label="Trip fuel"      value={`${result.tripFuelKg.toLocaleString()} kg`} />
            <Stat label="Block fuel"     value={`${result.blockFuelKg.toLocaleString()} kg`} />
            <Stat label="Carry penalty"  value={`${result.carryPenaltyKg.toLocaleString()} kg`} sub={`$${result.carryPenaltyUsd.toLocaleString()}`} />
            <Stat label="Gross savings"  value={`$${result.grossSavingsUsd.toLocaleString()}`} />
            <Stat label="Net savings"
                  value={`${result.netSavingsUsd >= 0 ? '+' : ''}$${result.netSavingsUsd.toLocaleString()}`}
                  emphasize={result.recommend ? 'good' : 'bad'} />
            <Stat label="Δ price/USG"
                  value={`$${(result.destination.priceUsdPerUSG - result.origin.priceUsdPerUSG).toFixed(2)}`} />
          </div>

          {result.risks.length > 0 && (
            <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-4">
              <div className="text-xs font-medium text-amber-700 uppercase tracking-wide flex items-center gap-1 mb-2">
                <AlertTriangle size={12} /> Risks to weigh
              </div>
              <ul className="space-y-1">
                {result.risks.map((r, i) => (
                  <li key={i} className="text-xs text-amber-800">⚠ {r}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-gray-400">source: {result.source}</p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, emphasize }: { label: string; value: string; sub?: string; emphasize?: 'good' | 'bad' }) {
  const color = emphasize === 'good' ? 'text-green-700' : emphasize === 'bad' ? 'text-red-700' : 'text-gray-900';
  return (
    <div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`mt-0.5 font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

function PriceCard({ label, side }: { label: string; side: PriceSide }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label} · {side.iata}</div>
      <div className="mt-1 text-2xl font-bold">
        ${side.priceUsdPerUSG.toFixed(2)}
        <span className="text-sm font-normal text-gray-500">/USG</span>
      </div>
      <div className="text-xs text-gray-400 mt-0.5">{side.icao}</div>

      {side.components && (
        <ul className="mt-3 space-y-0.5 text-[11px] text-gray-600">
          <li>base <span className="font-medium float-right">${side.components.base.toFixed(2)}</span></li>
          <li>differential <span className="font-medium float-right">${side.components.differential.toFixed(2)}</span></li>
          <li>into-plane <span className="font-medium float-right">${side.components.intoPlane.toFixed(2)}</span></li>
          <li>tax <span className="font-medium float-right">${side.components.tax.toFixed(2)}</span></li>
        </ul>
      )}

      {(side.supplier || side.contractRef) && (
        <div className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-500 flex flex-wrap gap-x-3">
          {side.supplier   && <span>supplier <span className="font-medium text-gray-700">{side.supplier}</span></span>}
          {side.contractRef && <span>contract <span className="font-medium text-gray-700">{side.contractRef}</span></span>}
        </div>
      )}
    </div>
  );
}
