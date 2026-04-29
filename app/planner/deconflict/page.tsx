'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, ShieldCheck, ShieldAlert, Users, Wrench, Plane, AlertTriangle,
} from 'lucide-react';
import { PlannerTabs } from '@/components/PlannerTabs';

type ConflictType =
  | 'maintenance' | 'unstaffed' | 'unqualified' | 'fdp_exceeded'
  | 'flight_time_exceeded' | 'insufficient_rest' | 'double_booked' | 'base_mismatch';

interface Conflict {
  type: ConflictType;
  severity: 'block' | 'warn';
  detail: string;
  tail?: string;
  flight?: string;
  crewId?: string;
}

interface CrewSummary {
  id: string;
  name: string;
  role: 'CAP' | 'FO';
  base: string;
  typeRatings: string[];
  flights: string[];
  totalFdpMin: number;
  totalFlightTimeMin: number;
  conflicts: number;
}

interface RotationView {
  tail: string;
  aircraft: string;
  legs: Array<{
    flight: string; origin: string; destination: string; std: string; sta: string;
    crew: Array<{ id: string; name: string; role: 'CAP' | 'FO' }>;
    conflicts: number;
  }>;
  maintenance: Array<{ airport: string; startHHMM: string; endHHMM: string; reason: string }>;
}

interface DeconflictResponse {
  generatedAt: string;
  fleet:    { tails: number; legs: number; maintenanceWindows: number; crew: number; assignments: number };
  summary:  { total: number; blockers: number; warnings: number; dispatchableLegs: number };
  rotations: RotationView[];
  crew:      CrewSummary[];
  conflicts: Conflict[];
  source:    string;
}

const TYPE_LABEL: Record<ConflictType, string> = {
  maintenance:          'Maintenance overlap',
  unstaffed:            'Unstaffed leg',
  unqualified:          'Crew unqualified',
  fdp_exceeded:         'FDP exceeded',
  flight_time_exceeded: 'Flight time exceeded',
  insufficient_rest:    'Insufficient rest',
  double_booked:        'Double-booked',
  base_mismatch:        'Base mismatch',
};

const fmtHM = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

export default function DeconflictPage() {
  const [data, setData]       = useState<DeconflictResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planner/deconflict');
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); }, []);

  const grouped: Record<string, Conflict[]> = {};
  if (data) for (const c of data.conflicts) (grouped[c.type] ??= []).push(c);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PlannerTabs />

      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="text-amber-600" size={22} /> Schedule Deconfliction
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Walks every rotation + crew pairing, flags maintenance overlaps, qualification gaps,
            FDP/flight-time/rest violations, broken chains, and unstaffed legs.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-200 transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Plane size={14} />}
          Re-run
        </button>
      </header>

      {data && (
        <>
          {/* Verdict banner */}
          <section
            className={`border rounded-xl p-5 flex items-center justify-between mb-6 ${
              data.summary.blockers === 0
                ? 'border-green-300 bg-green-50/50'
                : 'border-red-300 bg-red-50/50'
            }`}
          >
            <div className="flex items-center gap-3">
              {data.summary.blockers === 0
                ? <ShieldCheck className="text-green-600" size={28} />
                : <ShieldAlert className="text-red-600" size={28} />}
              <div>
                <div className={`text-xl font-bold ${data.summary.blockers === 0 ? 'text-green-800' : 'text-red-800'}`}>
                  {data.summary.blockers === 0 ? 'SCHEDULE CLEAN' : `${data.summary.blockers} BLOCKER${data.summary.blockers === 1 ? '' : 'S'}`}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {data.fleet.tails} tails · {data.fleet.legs} legs · {data.fleet.crew} crew · {data.fleet.assignments} assignments ·
                  {' '}{data.summary.warnings} warning{data.summary.warnings === 1 ? '' : 's'} ·
                  {' '}{data.summary.dispatchableLegs}/{data.fleet.legs} legs dispatchable
                </div>
              </div>
            </div>
          </section>

          {/* Rotations */}
          <section className="mb-8">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Rotations</h2>
            <div className="space-y-3">
              {data.rotations.map((r) => (
                <div key={r.tail} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-semibold">{r.tail}</span>
                      <span className="text-xs text-gray-500 ml-2">{r.aircraft}</span>
                    </div>
                    {r.maintenance.length > 0 && (
                      <span className="text-xs text-amber-700 flex items-center gap-1">
                        <Wrench size={12} />
                        {r.maintenance.map((m, i) => (
                          <span key={i}>{m.airport} {m.startHHMM}-{m.endHHMM} {m.reason}{i < r.maintenance.length - 1 ? ' · ' : ''}</span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {r.legs.map((l) => (
                      <div
                        key={l.flight}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                          l.conflicts > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                        }`}
                      >
                        <span className="text-sm font-medium w-20">{l.flight}</span>
                        <span className="text-sm text-gray-600 w-32">{l.origin} → {l.destination}</span>
                        <span className="text-xs text-gray-500 w-24">{l.std} → {l.sta}</span>
                        <span className="flex-1 flex flex-wrap gap-1">
                          {l.crew.length === 0 ? (
                            <span className="text-xs italic text-red-600">no crew assigned</span>
                          ) : (
                            l.crew.map((c) => (
                              <span key={c.id} className="text-[11px] bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                <span className="text-gray-400 font-medium">{c.role}</span> {c.name}
                              </span>
                            ))
                          )}
                        </span>
                        {l.conflicts > 0 && (
                          <span className="text-xs font-semibold text-red-700 flex items-center gap-1">
                            <AlertTriangle size={12} /> {l.conflicts}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Crew table */}
          <section className="mb-8">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Crew</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left py-2 font-medium">Crew</th>
                  <th className="text-left py-2 font-medium">Role</th>
                  <th className="text-left py-2 font-medium">Base</th>
                  <th className="text-left py-2 font-medium">Ratings</th>
                  <th className="text-left py-2 font-medium">Flights</th>
                  <th className="text-left py-2 font-medium">FDP</th>
                  <th className="text-left py-2 font-medium">Flight time</th>
                  <th className="text-left py-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {data.crew.map((c) => (
                  <tr key={c.id} className={`border-t border-gray-100 ${c.conflicts > 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="py-2"><span className="text-xs text-gray-400 mr-2">{c.id}</span>{c.name}</td>
                    <td className="py-2">{c.role}</td>
                    <td className="py-2">{c.base}</td>
                    <td className="py-2 text-xs text-gray-500">{c.typeRatings.join(', ')}</td>
                    <td className="py-2 text-xs text-gray-500">{c.flights.join(', ') || '—'}</td>
                    <td className={`py-2 ${c.totalFdpMin > 14 * 60 ? 'text-red-700 font-semibold' : ''}`}>{fmtHM(c.totalFdpMin)}</td>
                    <td className={`py-2 ${c.totalFlightTimeMin > 9 * 60 ? 'text-red-700 font-semibold' : ''}`}>{fmtHM(c.totalFlightTimeMin)}</td>
                    <td className="py-2 text-red-700 font-semibold">{c.conflicts || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Conflicts grouped by type */}
          {data.conflicts.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Conflicts</h2>
              <div className="space-y-4">
                {Object.entries(grouped).map(([type, items]) => (
                  <div key={type} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{TYPE_LABEL[type as ConflictType]}</span>
                      <span className="text-xs text-gray-500">{items.length}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((c, i) => (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <span
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                              c.severity === 'block' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            {c.severity}
                          </span>
                          <span className="flex-1">{c.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-[11px] text-gray-400 mt-6">
            generated {new Date(data.generatedAt).toLocaleTimeString()} · source: {data.source}
          </p>
        </>
      )}
    </div>
  );
}
