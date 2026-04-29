'use client';

import { useState } from 'react';
import { Loader2, Wrench, Plane, ShieldCheck, ShieldAlert, AlertTriangle, Info } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';

const FLIGHTS = [
  { flight: 'BA1000', origin: 'JFK', destination: 'LHR', aircraft: 'Boeing 777-300ER' },
  { flight: 'AA2111', origin: 'JFK', destination: 'CDG', aircraft: 'Airbus A330-300' },
  { flight: 'LH4410', origin: 'JFK', destination: 'FRA', aircraft: 'Airbus A380-800' },
  { flight: 'EK5500', origin: 'JFK', destination: 'DXB', aircraft: 'Airbus A380-800' },
];

interface DeferredView {
  melId: string;
  ataChapter: number;
  ataName: string;
  item: string;
  category: 'A' | 'B' | 'C' | 'D';
  daysDeferred: number;
  restrictions: Array<{ kind: string; [k: string]: unknown }>;
  description?: string;
  dueAt?: string;
  partsOnOrder?: boolean;
  placardInstalled?: boolean;
  releasedBy?: string;
}

interface MELResponse {
  flight: string;
  tail: string | null;
  aircraft: string;
  distanceNM: number;
  routeContext: {
    oceanic: boolean;
    etopsRequired: boolean;
    knownIcing: boolean;
    thunderstormsForecast: boolean;
    imcBelowFreezing: boolean;
    destCatIIIRequired: boolean;
    arrivalIsNight: boolean;
    destRunwayFt: number;
    requiredRunwayFt: number;
  };
  deferred: DeferredView[];
  conflicts: Array<{ melId: string; item: string; reason: string; severity: 'block' | 'warn' }>;
  advisories: Array<{ melId: string; item: string; note: string }>;
  mtowReductionKg: number;
  flCeiling: number | null;
  dispatchAllowed: boolean;
  source: string;
}

const CAT_PILL: Record<string, string> = {
  A: 'bg-red-100 text-red-700',
  B: 'bg-orange-100 text-orange-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-gray-100 text-gray-600',
};

type ToggleKey = 'knownIcing' | 'thunderstormsForecast' | 'imcBelowFreezing' | 'destCatIIIRequired' | 'arrivalIsNight';

export default function MELPage() {
  const [selected, setSelected] = useState(FLIGHTS[0]);
  const [overrides, setOverrides] = useState<Record<ToggleKey, boolean>>({
    knownIcing: false,
    thunderstormsForecast: false,
    imcBelowFreezing: false,
    destCatIIIRequired: false,
    arrivalIsNight: false,
  });
  const [result, setResult]   = useState<MELResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planner/mel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selected, overrides }),
      });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="text-amber-600" size={22} /> MEL Impact Assessment
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Cross-references the tail&rsquo;s deferred maintenance items against the planned route.
          Surfaces blockers that prevent dispatch and procedural workarounds the crew will need.
        </p>
      </header>

      <section className="grid grid-cols-12 gap-4 mb-4">
        <div className="col-span-9">
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
        <div className="col-span-3 flex items-end">
          <button
            onClick={run}
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plane size={14} />}
            {loading ? 'Assessing' : 'Assess MEL Impact'}
          </button>
        </div>
      </section>

      <fieldset className="border border-gray-200 rounded-xl p-3 mb-6">
        <legend className="text-[10px] font-medium text-gray-500 uppercase tracking-wide px-1">
          Brief overrides — toggle on to simulate conditions normally fed from the brief phase
        </legend>
        <div className="flex flex-wrap gap-2 mt-1">
          {[
            { key: 'knownIcing',            label: 'Known/forecast icing' },
            { key: 'imcBelowFreezing',      label: 'IMC below freezing' },
            { key: 'thunderstormsForecast', label: 'Thunderstorms en-route' },
            { key: 'destCatIIIRequired',    label: 'CAT III at destination' },
            { key: 'arrivalIsNight',        label: 'Night arrival' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setOverrides((s) => ({ ...s, [key as ToggleKey]: !s[key as ToggleKey] }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                overrides[key as ToggleKey]
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {result && (
        <section className="space-y-5">
          {/* Verdict */}
          <div
            className={`border rounded-xl p-5 flex items-center justify-between ${
              result.dispatchAllowed
                ? 'border-green-300 bg-green-50/50'
                : 'border-red-300 bg-red-50/50'
            }`}
          >
            <div className="flex items-center gap-3">
              {result.dispatchAllowed
                ? <ShieldCheck className="text-green-600" size={28} />
                : <ShieldAlert className="text-red-600" size={28} />}
              <div>
                <div className={`text-xl font-bold ${result.dispatchAllowed ? 'text-green-800' : 'text-red-800'}`}>
                  {result.dispatchAllowed ? 'DISPATCH ALLOWED' : 'DISPATCH BLOCKED'}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  tail {result.tail ?? '—'} · {result.deferred.length} deferred item{result.deferred.length === 1 ? '' : 's'} ·
                  {' '}{result.conflicts.filter((c) => c.severity === 'block').length} blocker(s),{' '}
                  {result.conflicts.filter((c) => c.severity === 'warn').length} warning(s),{' '}
                  {result.advisories.length} advisor{result.advisories.length === 1 ? 'y' : 'ies'}
                </div>
              </div>
            </div>
            <div className="text-right">
              {result.flCeiling !== null && (
                <div className="text-xs">cruise ceiling <span className="font-semibold">FL{result.flCeiling}</span></div>
              )}
              {result.mtowReductionKg > 0 && (
                <div className="text-xs">MTOW −<span className="font-semibold">{result.mtowReductionKg.toLocaleString()} kg</span></div>
              )}
            </div>
          </div>

          {/* Conflicts */}
          {result.conflicts.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Conflicts</h2>
              <ul className="space-y-2">
                {result.conflicts.map((c, i) => (
                  <li
                    key={i}
                    className={`border rounded-lg p-3 flex items-start gap-2 ${
                      c.severity === 'block' ? 'border-red-200 bg-red-50/40' : 'border-orange-200 bg-orange-50/40'
                    }`}
                  >
                    <AlertTriangle size={14} className={c.severity === 'block' ? 'text-red-600 mt-0.5' : 'text-orange-600 mt-0.5'} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.item} <span className="text-gray-400 font-normal">— {c.melId}</span></div>
                      <div className="text-xs text-gray-600 mt-0.5">{c.reason}</div>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      c.severity === 'block' ? 'text-red-700' : 'text-orange-700'
                    }`}>
                      {c.severity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Advisories */}
          {result.advisories.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Advisories</h2>
              <ul className="space-y-1">
                {result.advisories.map((a, i) => (
                  <li key={i} className="border border-gray-200 rounded-lg p-2 flex items-start gap-2">
                    <Info size={12} className="text-blue-600 mt-1" />
                    <div className="text-xs">
                      <span className="font-medium">{a.item}</span>
                      <span className="text-gray-400"> — {a.melId}</span>
                      <div className="text-gray-700 mt-0.5">{a.note}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Deferred items table */}
          <div>
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Deferred items ({result.deferred.length})
            </h2>
            {result.deferred.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No open MEL deferrals against this tail.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-2 font-medium">ATA</th>
                    <th className="text-left py-2 font-medium">Item</th>
                    <th className="text-left py-2 font-medium">Cat</th>
                    <th className="text-left py-2 font-medium">Days</th>
                    <th className="text-left py-2 font-medium">Restrictions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.deferred.map((d) => (
                    <tr key={d.melId} className="border-t border-gray-100 align-top">
                      <td className="py-2 text-xs text-gray-500">{d.ataChapter} <span className="text-gray-400">— {d.ataName}</span></td>
                      <td className="py-2">
                        <div>{d.item}</div>
                        {d.description && <div className="text-[11px] text-gray-500 mt-0.5">{d.description}</div>}
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
                          {d.dueAt && <span>due {new Date(d.dueAt).toISOString().slice(0, 10)}</span>}
                          {d.partsOnOrder     && <span className="text-amber-700">parts on order</span>}
                          {d.placardInstalled && <span className="text-blue-700">placarded</span>}
                          {d.releasedBy       && <span>by {d.releasedBy}</span>}
                        </div>
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${CAT_PILL[d.category]}`}>{d.category}</span>
                      </td>
                      <td className="py-2 text-gray-600">{d.daysDeferred}d</td>
                      <td className="py-2 text-xs text-gray-500">{d.restrictions.map((r) => r.kind).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[11px] text-gray-400">source: {result.source}</p>
        </section>
      )}
    </div>
  );
}
