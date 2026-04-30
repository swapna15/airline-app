'use client';

import { useState } from 'react';
import { Loader2, AlertOctagon, MapPin, Wind, Fuel, Shield, Plane } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';

type Reason = 'medical' | 'mechanical' | 'weather' | 'fuel';

const FLIGHTS = [
  { flight: 'BA1000', origin: 'JFK', destination: 'LHR', aircraft: 'Boeing 777-300ER' },
  { flight: 'AA2111', origin: 'JFK', destination: 'CDG', aircraft: 'Airbus A330-300' },
  { flight: 'LH4410', origin: 'JFK', destination: 'FRA', aircraft: 'Airbus A380-800' },
  { flight: 'EK5500', origin: 'JFK', destination: 'DXB', aircraft: 'Airbus A380-800' },
];

const REASONS: { value: Reason; label: string }[] = [
  { value: 'medical',    label: 'Medical' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'weather',    label: 'Weather' },
  { value: 'fuel',       label: 'Fuel' },
];

interface Alternate {
  airport: {
    iata: string;
    icao: string;
    name: string;
    runwayLengthFt: number;
    fireCat: number;
    dataQuality?: 'verified' | 'heuristic';
    fuelTypes?: string[];
  };
  distanceFromOriginNM: number;
  distanceFromDestNM: number;
  fltCat?: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
  metar?: string;
  ceilingFt: number | null;
  visSm: number | null;
  minimaSource: 'taf' | 'metar' | 'none';
  tafWorstSource?: 'BASE' | 'FM' | 'BECMG' | 'TEMPO' | 'PROB' | 'none';
  etaIso: string;
  meetsAlternateMinima: 'yes' | 'no' | 'unknown';
  runwayAdequate: boolean;
  customs: boolean;
  fuel: boolean;
  fireCatOk: boolean;
  etopsAlternate: boolean;
  authorized: boolean;
  score: number;
  notes: string[];
}

interface DivertResponse {
  flight: string;
  reason: Reason;
  requiredRunwayFt: number;
  etopsRequired: boolean;
  candidatePoolSize: number;
  etopsAdequateCount: number;
  meetsMinimaCount: number;
  authorizedRankedCount: number;
  tafSourceCount: number;
  metarSourceCount: number;
  destAuthorized: boolean;
  alternateMinima: { alternateCeilingFt: number; alternateVisSm: number };
  authorizedAirportsCount: number;
  cruiseSpeedKt: number;
  ranked: Alternate[];
  source: string;
}

const FLT_CAT_PILL: Record<string, string> = {
  VFR:  'bg-green-100 text-green-700',
  MVFR: 'bg-blue-100 text-blue-700',
  IFR:  'bg-orange-100 text-orange-700',
  LIFR: 'bg-red-100 text-red-700',
};

export default function DivertPage() {
  const [selected, setSelected] = useState(FLIGHTS[0]);
  const [reason, setReason] = useState<Reason>('medical');
  const [result, setResult] = useState<DivertResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const visibleAlternates = result?.ranked.filter(
    (a) => !verifiedOnly || a.airport.dataQuality === 'verified',
  ) ?? [];

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planner/divert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selected, reason }),
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
          <AlertOctagon className="text-amber-600" size={22} /> Diversion Advisor
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Rank alternates by current WX, runway adequacy for the type, customs availability, and fuel uplift.
        </p>
      </header>

      <section className="grid grid-cols-12 gap-4 mb-6">
        <div className="col-span-5">
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

        <div className="col-span-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
          <div className="flex gap-1">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  reason === r.value
                    ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-3 flex items-end">
          <button
            onClick={run}
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plane size={14} />}
            {loading ? 'Scoring' : 'Rank Alternates'}
          </button>
        </div>
      </section>

      {result && (
        <section>
          <p className="text-xs text-gray-400 mb-3">
            {result.ranked.length} alternates · req runway {result.requiredRunwayFt.toLocaleString()} ft
            {result.etopsRequired && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                ETOPS required · {result.etopsAdequateCount}/{result.candidatePoolSize} adequate in pool
              </span>
            )}
            <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
              alt minima ≥{result.alternateMinima.alternateCeilingFt} ft / ≥{result.alternateMinima.alternateVisSm} SM · {result.meetsMinimaCount} pass
            </span>
            <span
              className="ml-2 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium"
              title="How each candidate's ceiling/vis was assessed: TAF forecast at ETA ±1hr (preferred) or current METAR fallback"
            >
              wx source: {result.tafSourceCount} TAF · {result.metarSourceCount} METAR
            </span>
            <span
              className={`ml-2 px-1.5 py-0.5 rounded font-medium ${
                result.authorizedAirportsCount > 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
              title={
                result.authorizedAirportsCount > 0
                  ? 'OpsSpec authorized-airports list is set and filtering candidates'
                  : 'OpsSpec authorized list empty — no restriction applied'
              }
            >
              authorized list: {result.authorizedAirportsCount}
              {result.authorizedAirportsCount > 0
                ? ` stations · ${result.authorizedRankedCount} match`
                : ' (no restriction)'}
            </span>
            <span className="ml-2">· source: {result.source}</span>
          </p>
          {!result.destAuthorized && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-start gap-2">
              <AlertOctagon size={14} className="mt-0.5 shrink-0" />
              <span>
                Filed destination is not in the OpsSpec authorized-airports list — request a station authorization
                amendment before dispatch.
              </span>
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">
              {visibleAlternates.length}/{result.ranked.length} alternates
              {verifiedOnly && ' (verified-data only)'}
            </p>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="accent-emerald-600"
              />
              Verified data only
            </label>
          </div>
          <ol className="space-y-2">
            {visibleAlternates.map((alt, i) => (
              <li
                key={alt.airport.iata}
                className={`border rounded-xl p-4 ${
                  i === 0 ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-400 w-6">{String(i + 1).padStart(2, '0')}</span>
                      <span className="font-semibold text-sm">
                        {alt.airport.iata} <span className="text-gray-400 font-normal">/ {alt.airport.icao}</span>
                      </span>
                      <span className="text-xs text-gray-500">— {alt.airport.name}</span>
                      {alt.fltCat && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${FLT_CAT_PILL[alt.fltCat]}`}>
                          {alt.fltCat}
                        </span>
                      )}
                      {alt.etopsAlternate && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                          ETOPS
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          alt.airport.dataQuality === 'verified'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`}
                        title={
                          alt.airport.dataQuality === 'verified'
                            ? 'fireCat / customs / fuel verified from supplements file'
                            : 'fireCat / customs / fuel derived from OurAirports heuristic'
                        }
                      >
                        {alt.airport.dataQuality === 'verified' ? '✓ verified' : 'heuristic'}
                      </span>
                      {result.authorizedAirportsCount > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            alt.authorized
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                          title={
                            alt.authorized
                              ? 'on OpsSpec authorized-airports list'
                              : 'NOT on OpsSpec authorized-airports list — score –100'
                          }
                        >
                          {alt.authorized ? '✓ authorized' : '✕ unauthorized'}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          alt.meetsAlternateMinima === 'yes'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : alt.meetsAlternateMinima === 'no'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`}
                        title={
                          alt.minimaSource === 'taf'
                            ? `TAF forecast at ETA ${new Date(alt.etaIso).toLocaleTimeString()} ±1h (worst-case ${alt.tafWorstSource}): ceiling ${alt.ceilingFt ?? '—'} ft / vis ${alt.visSm ?? '—'} SM vs OpsSpec C055 floor`
                            : alt.minimaSource === 'metar'
                              ? `Current METAR (TAF unavailable / out-of-window): ceiling ${alt.ceilingFt ?? '—'} ft / vis ${alt.visSm ?? '—'} SM vs OpsSpec C055 floor`
                              : 'no WX data — minima unverified'
                        }
                      >
                        {alt.meetsAlternateMinima === 'yes' && '✓ alt min'}
                        {alt.meetsAlternateMinima === 'no'  && '✕ below alt min'}
                        {alt.meetsAlternateMinima === 'unknown' && '? alt min'}
                        {alt.minimaSource !== 'none' && (
                          <span className="ml-1 text-[9px] opacity-70 uppercase">
                            {alt.minimaSource}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="ml-8 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <MapPin size={11} /> {alt.distanceFromDestNM} nm from {selected.destination}
                      </span>
                      <span className="flex items-center gap-1">
                        <Plane size={11} /> {alt.airport.runwayLengthFt.toLocaleString()} ft
                        {!alt.runwayAdequate && <span className="text-red-600">·short</span>}
                      </span>
                      <span className="flex items-center gap-1">
                        <Shield size={11} /> RFF {alt.airport.fireCat}
                      </span>
                      <span className="flex items-center gap-1">
                        <Fuel size={11} className={alt.fuel ? 'text-green-600' : 'text-red-500'} />
                        {alt.fuel ? 'fuel' : 'no fuel'}
                      </span>
                      <span className="flex items-center gap-1">
                        {alt.customs ? '🛂 customs' : '✕ no customs'}
                      </span>
                      {(alt.ceilingFt !== null || alt.visSm !== null) && (
                        <span className="flex items-center gap-1 text-gray-500">
                          ceil {alt.ceilingFt !== null ? `${alt.ceilingFt} ft` : '∞'} · vis {alt.visSm !== null ? `${alt.visSm} SM` : '?'}
                          {alt.minimaSource === 'taf' && alt.tafWorstSource && alt.tafWorstSource !== 'none' && (
                            <span className="text-indigo-600">({alt.tafWorstSource})</span>
                          )}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-gray-400">
                        ETA {new Date(alt.etaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}Z
                      </span>
                    </div>

                    {alt.metar && (
                      <p className="ml-8 mt-2 font-mono text-[11px] text-gray-500 truncate">
                        <Wind size={10} className="inline mr-1" />{alt.metar}
                      </p>
                    )}

                    {alt.notes.length > 0 && (
                      <ul className="ml-8 mt-2 space-y-0.5">
                        {alt.notes.map((n, idx) => (
                          <li key={idx} className="text-[11px] text-amber-700">⚠ {n}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-gray-900">{alt.score}</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">score</div>
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
