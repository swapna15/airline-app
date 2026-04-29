'use client';

import { useEffect, useState } from 'react';
import { FileText, RefreshCw, CheckCircle2, XCircle, Plane, Users } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';

interface EodReport {
  generatedAt: string;
  fleet: { tails: number; legs: number; paxPlanned: number };
  plans: { released: number; inProgress: number; untouched: number };
  activity: { totalApprovals: number; totalRejections: number; rejByPhase: Record<string, number> };
  flights: Array<{ flight: string; origin: string; destination: string; std: string; paxLoad: number }>;
  source: string;
}

export default function EodPage() {
  const [report, setReport] = useState<EodReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planner/eod', { cache: 'no-store' });
      setReport(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />

      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="text-amber-600" size={22} /> End-of-Day Ops Report
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {report ? `Generated ${new Date(report.generatedAt).toLocaleString()}` : 'Aggregating planner activity…'}
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {report && (
        <>
          <section className="grid grid-cols-4 gap-3 mb-6">
            <Stat label="Tails" value={String(report.fleet.tails)} icon={<Plane size={12} />} />
            <Stat label="Legs planned" value={String(report.fleet.legs)} />
            <Stat label="Pax planned" value={report.fleet.paxPlanned.toLocaleString()} icon={<Users size={12} />} />
            <Stat label="Plans released" value={`${report.plans.released} / 4`} sub={`${report.plans.inProgress} in progress · ${report.plans.untouched} untouched`} />
          </section>

          <section className="grid grid-cols-2 gap-6 mb-6">
            <div className="border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-600" /> Approvals
              </h2>
              <div className="text-3xl font-bold">{report.activity.totalApprovals}</div>
              <p className="text-xs text-gray-500 mt-1">phase approvals across all plans</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <XCircle size={14} className="text-red-600" /> Rejections by phase
              </h2>
              {report.activity.totalRejections === 0 ? (
                <p className="text-xs text-gray-400">No rejections today.</p>
              ) : (
                <ul className="space-y-1">
                  {Object.entries(report.activity.rejByPhase)
                    .filter(([, n]) => n > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([phase, n]) => (
                      <li key={phase} className="flex items-center justify-between text-xs">
                        <span className="capitalize">{phase.replace('_', ' ')}</span>
                        <span className="font-semibold text-red-600">{n}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">All scheduled legs</h2>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              {report.flights.map((f) => (
                <div key={f.flight} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold w-16">{f.flight}</span>
                    <span className="text-gray-500">{f.origin} → {f.destination}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="font-mono">{f.std}</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {f.paxLoad}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-[10px] text-gray-400 mt-4">source: {report.source}</p>
        </>
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
