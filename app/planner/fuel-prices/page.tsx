'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Download, AlertTriangle, TrendingUp } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';
import type { FuelDashboardResponse, AirportPrice } from '@/app/api/planner/fuel-prices/route';

const FLAG_TONE: Record<NonNullable<AirportPrice['flag']>, string> = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red:   'bg-red-50 text-red-700 border-red-200',
};

export default function FuelPricesPage() {
  const [data, setData] = useState<FuelDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/planner/fuel-prices')
      .then((r) => r.json())
      .then((d: FuelDashboardResponse) => setData(d))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Auto-refresh every 30 min while page open.
  useEffect(() => {
    const i = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  const csvUrl = useMemo(() => {
    if (!data) return null;
    const lines = ['icao,iata,total_per_usg,currency,supplier,source,as_of'];
    for (const a of data.airports) {
      const p = a.price;
      lines.push([
        a.icao, a.iata,
        p?.totalPerUSG ?? '',
        p?.currency ?? '',
        p?.supplier ?? '',
        p?.source ?? '',
        p?.asOf ?? '',
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    return URL.createObjectURL(blob);
  }, [data]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />

      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fuel Price Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Jet-A prices across today&apos;s rotation, plus tankering opportunities sorted by savings.
            {data?.generatedAt && (
              <span className="ml-2 text-xs text-gray-400">
                refreshed {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {csvUrl && (
            <a
              href={csvUrl}
              download={`fuel-prices-${new Date().toISOString().slice(0, 10)}.csv`}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm flex items-center gap-2 hover:bg-gray-50"
            >
              <Download size={14} /> CSV
            </a>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </header>

      {data?.source === 'mock' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} />
          <span>
            <strong>MOCK PRICES — not for release.</strong> Switch the fuel-price provider in
            /admin/integrations to <code>csv</code> or <code>api_fms</code> for real data.
          </span>
        </div>
      )}

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <Tile label="Airports" value={String(data.airports.length)} />
          <Tile label="Fleet avg ($/USG)" value={data.fleetAvgUSG !== undefined ? `$${data.fleetAvgUSG.toFixed(2)}` : '—'} />
          <Tile
            label="Above avg (>15%)"
            value={String(data.airports.filter((a) => a.flag === 'amber').length)}
            tone="bg-amber-50 text-amber-700"
          />
          <Tile
            label="Above avg (>30%)"
            value={String(data.airports.filter((a) => a.flag === 'red').length)}
            tone="bg-red-50 text-red-700"
          />
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading prices…
        </div>
      ) : !data ? null : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Per-airport price table */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Prices by airport
            </h2>
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-2 font-medium">Airport</th>
                    <th className="px-3 py-2 font-medium">$ / USG</th>
                    <th className="px-3 py-2 font-medium">vs. avg</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">As of</th>
                  </tr>
                </thead>
                <tbody>
                  {data.airports.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      No airports in today&apos;s rotation.
                    </td></tr>
                  ) : data.airports.map((a) => (
                    <tr key={a.icao} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{a.icao}</span>
                        <span className="text-xs text-gray-400 ml-1">/ {a.iata}</span>
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {a.price ? `$${a.price.totalPerUSG.toFixed(3)}` : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {a.vsAvgPct !== undefined ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            a.flag ? FLAG_TONE[a.flag] : 'text-gray-500'
                          }`}>
                            {a.vsAvgPct > 0 ? '+' : ''}{a.vsAvgPct}%
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{a.price?.source ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {a.price?.asOf ? new Date(a.price.asOf).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Tankering opportunities */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <TrendingUp size={12} /> Tankering opportunities
            </h2>
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-2 font-medium">Flight</th>
                    <th className="px-3 py-2 font-medium">Route</th>
                    <th className="px-3 py-2 font-medium">Δ price</th>
                    <th className="px-3 py-2 font-medium">Trip fuel</th>
                    <th className="px-3 py-2 font-medium text-right">Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tankering.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      No flights show net savings after carry-burn penalty.
                    </td></tr>
                  ) : data.tankering.map((t) => (
                    <tr key={t.flight} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono text-xs">{t.flight}</td>
                      <td className="px-3 py-2 text-xs">{t.origin} → {t.destination}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        ${t.originPriceUSG.toFixed(2)} → ${t.destPriceUSG.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {t.tripFuelUSG.toLocaleString()} USG · {t.blockTimeHours}h
                      </td>
                      <td className="px-3 py-2 font-mono text-right text-green-700 font-semibold">
                        ${t.savingsUSD.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`rounded-xl p-4 ${tone ?? 'bg-gray-50 text-gray-700'}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}
