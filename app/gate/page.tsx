'use client';

import { useState } from 'react';
import { Plane, Users, CheckCircle, Clock, DoorOpen } from 'lucide-react';

interface GateFlight {
  id: string;
  flight: string;
  airline: string;
  route: string;
  gate: string;
  departure: string;
  totalPax: number;
  checkedIn: number;
  boarded: number;
  status: 'Scheduled' | 'Boarding' | 'Final Call' | 'Closed' | 'Departed';
}

const MOCK_FLIGHTS: GateFlight[] = [
  { id: '1', flight: 'BA1000', airline: 'British Airways', route: 'JFK → LHR', gate: 'B22', departure: '09:45', totalPax: 312, checkedIn: 290, boarded: 245, status: 'Boarding' },
  { id: '2', flight: 'AA2111', airline: 'American Airlines', route: 'JFK → CDG', gate: 'C14', departure: '11:15', totalPax: 256, checkedIn: 180, boarded: 0, status: 'Scheduled' },
  { id: '3', flight: 'UA3322', airline: 'United Airlines', route: 'JFK → NRT', gate: 'A08', departure: '07:30', totalPax: 388, checkedIn: 388, boarded: 388, status: 'Departed' },
  { id: '4', flight: 'LH4410', airline: 'Lufthansa', route: 'JFK → FRA', gate: 'D31', departure: '14:00', totalPax: 298, checkedIn: 42, boarded: 0, status: 'Scheduled' },
];

const STATUS_STYLES: Record<GateFlight['status'], string> = {
  Scheduled: 'bg-gray-100 text-gray-600',
  Boarding: 'bg-green-100 text-green-700',
  'Final Call': 'bg-orange-100 text-orange-700',
  Closed: 'bg-red-100 text-red-700',
  Departed: 'bg-blue-100 text-blue-700',
};

const NEXT_STATUS: Record<GateFlight['status'], GateFlight['status'] | null> = {
  Scheduled: 'Boarding',
  Boarding: 'Final Call',
  'Final Call': 'Closed',
  Closed: 'Departed',
  Departed: null,
};

export default function GatePage() {
  const [flights, setFlights] = useState(MOCK_FLIGHTS);
  const [selectedId, setSelectedId] = useState<string>(MOCK_FLIGHTS[0].id);

  const selected = flights.find((f) => f.id === selectedId)!;

  const advanceStatus = (id: string) => {
    setFlights((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = NEXT_STATUS[f.status];
        return next ? { ...f, status: next } : f;
      }),
    );
  };

  const boardAll = (id: string) => {
    setFlights((prev) =>
      prev.map((f) => (f.id === id ? { ...f, boarded: f.checkedIn } : f)),
    );
  };

  const manifest = Array.from({ length: selected.checkedIn }, (_, i) => ({
    seat: `${Math.floor(i / 6) + 1}${['A', 'B', 'C', 'D', 'E', 'F'][i % 6]}`,
    name: ['Alice Johnson', 'Bob Martinez', 'Carol White', 'David Lee', 'Emma Davis', 'Frank Brown'][i % 6],
    boarded: i < selected.boarded,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gate Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Today&apos;s departures — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Flight List */}
        <div className="space-y-3">
          {flights.map((f) => (
            <div
              key={f.id}
              onClick={() => setSelectedId(f.id)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                selectedId === f.id ? 'border-blue-400 shadow-md' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-900">{f.flight}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[f.status]}`}>
                  {f.status}
                </span>
              </div>
              <p className="text-xs text-gray-500">{f.route} · Gate {f.gate}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                <Clock size={11} /> {f.departure}
                <span className="ml-1">· {f.boarded}/{f.totalPax} boarded</span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail Panel */}
        <div className="col-span-2 space-y-4">
          {/* Flight header */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Plane size={18} className="text-blue-600" />
                  <h2 className="text-xl font-bold text-gray-900">{selected.flight}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[selected.status]}`}>
                    {selected.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{selected.airline} · {selected.route} · Gate {selected.gate} · Dep {selected.departure}</p>
              </div>
              <div className="flex gap-2">
                {NEXT_STATUS[selected.status] && (
                  <button
                    onClick={() => advanceStatus(selected.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <DoorOpen size={13} /> → {NEXT_STATUS[selected.status]}
                  </button>
                )}
                {selected.status === 'Boarding' && (
                  <button
                    onClick={() => boardAll(selected.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle size={13} /> Board All
                  </button>
                )}
              </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'Total Pax', value: selected.totalPax, icon: <Users size={14} /> },
                { label: 'Checked In', value: selected.checkedIn, icon: <CheckCircle size={14} className="text-green-500" /> },
                { label: 'Boarded', value: selected.boarded, icon: <Plane size={14} className="text-blue-500" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">{icon}</div>
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            {/* Boarding progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Boarding progress</span>
                <span>{Math.round((selected.boarded / selected.totalPax) * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(selected.boarded / selected.totalPax) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Manifest (truncated) */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Passenger Manifest (showing {Math.min(8, manifest.length)} of {manifest.length})</h3>
            <div className="space-y-2">
              {manifest.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400 w-8">{p.seat}</span>
                    <span className="text-gray-800">{p.name}</span>
                  </div>
                  {p.boarded ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={11} /> Boarded</span>
                  ) : (
                    <span className="text-xs text-gray-400">Not boarded</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
