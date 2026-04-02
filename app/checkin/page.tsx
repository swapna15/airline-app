'use client';

import { useState } from 'react';
import { Search, CheckCircle, Luggage, Printer, User } from 'lucide-react';

interface Passenger {
  pnr: string;
  name: string;
  flight: string;
  route: string;
  seat: string;
  class: 'Economy' | 'Business' | 'First';
  bags: number;
  checkedIn: boolean;
  boardingGroup: string;
}

const MOCK_PASSENGERS: Passenger[] = [
  { pnr: 'ABC123', name: 'Alice Johnson', flight: 'BA1000', route: 'JFK → LHR', seat: '14A', class: 'Economy', bags: 1, checkedIn: false, boardingGroup: 'B' },
  { pnr: 'DEF456', name: 'Bob Martinez', flight: 'BA1000', route: 'JFK → LHR', seat: '3C', class: 'Business', bags: 2, checkedIn: true, boardingGroup: 'A' },
  { pnr: 'GHI789', name: 'Carol White', flight: 'AA2111', route: 'LAX → CDG', seat: '22F', class: 'Economy', bags: 0, checkedIn: false, boardingGroup: 'C' },
  { pnr: 'JKL012', name: 'David Lee', flight: 'AA2111', route: 'LAX → CDG', seat: '1A', class: 'First', bags: 1, checkedIn: false, boardingGroup: 'A' },
  { pnr: 'MNO345', name: 'Emma Davis', flight: 'BA1000', route: 'JFK → LHR', seat: '28B', class: 'Economy', bags: 2, checkedIn: true, boardingGroup: 'C' },
];

const CLASS_COLORS = {
  Economy: 'bg-gray-100 text-gray-700',
  Business: 'bg-blue-100 text-blue-700',
  First: 'bg-amber-100 text-amber-700',
};

export default function CheckinPage() {
  const [query, setQuery] = useState('');
  const [passengers, setPassengers] = useState(MOCK_PASSENGERS);
  const [selectedPnr, setSelectedPnr] = useState<string | null>(null);

  const results = query.trim()
    ? passengers.filter(
        (p) =>
          p.pnr.toLowerCase().includes(query.toLowerCase()) ||
          p.name.toLowerCase().includes(query.toLowerCase()),
      )
    : passengers;

  const selected = passengers.find((p) => p.pnr === selectedPnr);

  const checkIn = (pnr: string) => {
    setPassengers((prev) =>
      prev.map((p) => (p.pnr === pnr ? { ...p, checkedIn: true } : p)),
    );
  };

  const stats = {
    total: passengers.length,
    checkedIn: passengers.filter((p) => p.checkedIn).length,
    pending: passengers.filter((p) => !p.checkedIn).length,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Check-in Desk</h1>
        <p className="text-sm text-gray-500 mt-1">Search by PNR or passenger name</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Passengers', value: stats.total, color: 'text-gray-900' },
          { label: 'Checked In', value: stats.checkedIn, color: 'text-green-600' },
          { label: 'Pending', value: stats.pending, color: 'text-orange-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Passenger List */}
        <div className="col-span-2 space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              placeholder="Search PNR or name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            {results.map((p) => (
              <div
                key={p.pnr}
                onClick={() => setSelectedPnr(p.pnr)}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                  selectedPnr === p.pnr ? 'border-blue-400 shadow-md' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <User size={14} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.pnr} · {p.flight} · {p.route}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CLASS_COLORS[p.class]}`}>
                      {p.class}
                    </span>
                    {p.checkedIn ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <CheckCircle size={13} /> Checked in
                      </span>
                    ) : (
                      <span className="text-xs text-orange-500 font-medium">Pending</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {selected ? (
            <div className="space-y-4">
              <div className="text-center pb-4 border-b border-gray-100">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-2">
                  <User size={20} className="text-blue-600" />
                </div>
                <p className="font-semibold text-gray-900">{selected.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">PNR: {selected.pnr}</p>
              </div>

              <div className="space-y-2 text-sm">
                {[
                  { label: 'Flight', value: selected.flight },
                  { label: 'Route', value: selected.route },
                  { label: 'Seat', value: selected.seat },
                  { label: 'Class', value: selected.class },
                  { label: 'Bags', value: `${selected.bags} checked` },
                  { label: 'Group', value: selected.boardingGroup },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-900">{value}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2">
                {!selected.checkedIn && (
                  <button
                    onClick={() => checkIn(selected.pnr)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle size={15} /> Check In
                  </button>
                )}
                <button className="w-full flex items-center justify-center gap-2 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                  <Luggage size={15} /> Add Baggage
                </button>
                <button className="w-full flex items-center justify-center gap-2 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                  <Printer size={15} /> Print Boarding Pass
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center text-gray-400 text-sm py-12">
              Select a passenger to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
