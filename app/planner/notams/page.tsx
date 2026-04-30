'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, AlertCircle, Info, RefreshCw, FileText } from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';
import {
  CATEGORY_LABEL, SEVERITY_TONE,
  type NotamCategory, type NotamSeverity, type ClassifiedNotam,
} from '@/lib/notam-classifier';
import type { NotamBoardResponse } from '@/app/api/planner/notams/route';

const CATEGORIES: NotamCategory[] = ['runway', 'taxiway', 'navaid', 'airspace', 'procedure', 'other'];
const SEVERITIES: NotamSeverity[] = ['critical', 'warn', 'info'];

const SEV_ICON: Record<NotamSeverity, React.ReactNode> = {
  critical: <AlertTriangle size={12} />,
  warn:     <AlertCircle size={12} />,
  info:     <Info size={12} />,
};

export default function NotamsPage() {
  const [data, setData] = useState<NotamBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [airportFilter, setAirportFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<NotamCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<NotamSeverity | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/planner/notams')
      .then((r) => r.json())
      .then((d: NotamBoardResponse) => setData(d))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Auto-refresh every 15 min while the page is open.
  useEffect(() => {
    const i = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  const flatNotams = useMemo(() => {
    if (!data) return [];
    return data.airports.flatMap((a) => a.notams.map((n) => ({ ...n, airportFlights: a.flights })));
  }, [data]);

  const filtered = useMemo(() => {
    return flatNotams.filter((n) => {
      if (airportFilter !== 'all' && n.location !== airportFilter) return false;
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && n.severity !== severityFilter) return false;
      return true;
    });
  }, [flatNotams, airportFilter, categoryFilter, severityFilter]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />

      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NOTAM Briefing Board</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active NOTAMs across every airport in today&apos;s rotation, classified and sorted.
            {data?.source === 'mock' && (
              <span className="ml-2 text-amber-700 text-xs">
                (mock data — set <code>FAA_CLIENT_ID</code> + <code>FAA_CLIENT_SECRET</code> for real)
              </span>
            )}
            {data?.generatedAt && (
              <span className="ml-2 text-xs text-gray-400">
                refreshed {new Date(data.generatedAt).toLocaleTimeString()}
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

      {data && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total',    value: data.totals.notams,    tone: 'bg-gray-50 text-gray-700' },
            { label: 'Critical', value: data.totals.critical,  tone: 'bg-red-50 text-red-700' },
            { label: 'Warn',     value: data.totals.warn,      tone: 'bg-amber-50 text-amber-700' },
            { label: 'Info',     value: data.totals.info,      tone: 'bg-gray-50 text-gray-600' },
          ].map(({ label, value, tone }) => (
            <div key={label} className={`rounded-xl p-4 ${tone}`}>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs uppercase tracking-wide mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <label className="text-xs text-gray-500 uppercase tracking-wide">Airport</label>
        <select
          value={airportFilter}
          onChange={(e) => setAirportFilter(e.target.value)}
          className="px-2 py-1 rounded border border-gray-200 bg-white text-sm"
        >
          <option value="all">all ({data?.airports.length ?? 0})</option>
          {data?.airports.map((a) => (
            <option key={a.icao} value={a.icao}>
              {a.icao} ({a.notams.length})
            </option>
          ))}
        </select>

        <label className="text-xs text-gray-500 uppercase tracking-wide">Category</label>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          className="px-2 py-1 rounded border border-gray-200 bg-white text-sm"
        >
          <option value="all">all</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>

        <label className="text-xs text-gray-500 uppercase tracking-wide">Severity</label>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="px-2 py-1 rounded border border-gray-200 bg-white text-sm"
        >
          <option value="all">all</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <span className="ml-auto text-xs text-gray-500">
          {filtered.length}/{flatNotams.length} matching
        </span>
      </div>

      {/* List */}
      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading NOTAMs…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">
          {flatNotams.length === 0
            ? 'No NOTAMs across today’s rotation.'
            : 'No NOTAMs match the current filters.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <NotamRow
              key={`${n.location}-${n.number}`}
              n={n}
              expanded={expanded === `${n.location}-${n.number}`}
              onToggle={() => setExpanded(expanded === `${n.location}-${n.number}` ? null : `${n.location}-${n.number}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotamRow({
  n,
  expanded,
  onToggle,
}: {
  n: ClassifiedNotam & { airportFlights: string[] };
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-xl border ${SEVERITY_TONE[n.severity]}`}>
      <button onClick={onToggle} className="w-full text-left p-3 flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{SEV_ICON[n.severity]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold">{n.location}</span>
            <span className="text-[10px] uppercase tracking-wide bg-white/70 px-1.5 py-0.5 rounded">
              {CATEGORY_LABEL[n.category]}
            </span>
            <span className="text-[10px] text-gray-500">{n.number}</span>
            {n.airportFlights.length > 0 && (
              <span className="text-[10px] text-gray-500">
                · affects {n.airportFlights.join(', ')}
              </span>
            )}
          </div>
          <p className="text-sm mt-1 truncate">{n.headline}</p>
          {n.effectiveStart && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              {n.effectiveStart}{n.effectiveEnd ? ` → ${n.effectiveEnd}` : ''}
            </p>
          )}
        </div>
        <FileText size={14} className="text-gray-400 shrink-0 mt-0.5" />
      </button>
      {expanded && (
        <div className="border-t border-current/20 p-3 text-xs font-mono whitespace-pre-wrap text-gray-800 bg-white/60">
          {n.text}
        </div>
      )}
    </div>
  );
}
