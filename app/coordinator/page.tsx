'use client';

import { useState } from 'react';
import { AlertTriangle, Clock, Sparkles, Loader2 } from 'lucide-react';
import { AirlineLogo } from '@/components/AirlineLogo';

interface CoordFlight {
  id: string;
  flight: string;
  airline: string;
  origin: string;
  destination: string;
  scheduled: string;
  status: 'On Time' | 'Delayed' | 'Cancelled' | 'Departed' | 'Boarding';
  delayMinutes: number;
  aircraft: string;
  availableSeats: { economy: number; business: number; first: number };
}

const MOCK_FLIGHTS: CoordFlight[] = [
  { id: '1', flight: 'BA1000', airline: 'British Airways', origin: 'JFK', destination: 'LHR', scheduled: '09:45', status: 'Boarding' as CoordFlight['status'], delayMinutes: 0, aircraft: 'Boeing 777', availableSeats: { economy: 22, business: 3, first: 2 } },
  { id: '2', flight: 'AA2111', airline: 'American Airlines', origin: 'JFK', destination: 'CDG', scheduled: '11:15', status: 'Delayed', delayMinutes: 45, aircraft: 'Airbus A330', availableSeats: { economy: 76, business: 12, first: 0 } },
  { id: '3', flight: 'UA3322', airline: 'United Airlines', origin: 'JFK', destination: 'NRT', scheduled: '07:30', status: 'Departed', delayMinutes: 0, aircraft: 'Boeing 787', availableSeats: { economy: 0, business: 0, first: 0 } },
  { id: '4', flight: 'LH4410', airline: 'Lufthansa', origin: 'JFK', destination: 'FRA', scheduled: '14:00', status: 'On Time', delayMinutes: 0, aircraft: 'Airbus A380', availableSeats: { economy: 120, business: 24, first: 8 } },
  { id: '5', flight: 'EK5500', airline: 'Emirates', origin: 'JFK', destination: 'DXB', scheduled: '16:30', status: 'Cancelled', delayMinutes: 0, aircraft: 'Airbus A380', availableSeats: { economy: 0, business: 0, first: 0 } },
];

const STATUS_STYLES: Record<string, string> = {
  'On Time': 'bg-green-100 text-green-700',
  Delayed: 'bg-orange-100 text-orange-700',
  Cancelled: 'bg-red-100 text-red-700',
  Departed: 'bg-blue-100 text-blue-700',
  Boarding: 'bg-green-100 text-green-700',
};

export default function CoordinatorPage() {
  const [flights, setFlights] = useState(MOCK_FLIGHTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const selected = flights.find((f) => f.id === selectedId);

  const getAiAdvice = async () => {
    if (!selected) return;
    setAiLoading(true);
    setAiAdvice('');
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'disruption',
          payload: `Flight ${selected.flight} from ${selected.origin} to ${selected.destination} is ${selected.status}${selected.delayMinutes > 0 ? ` with a ${selected.delayMinutes}-minute delay` : ''}. Aircraft: ${selected.aircraft}. Available alternatives: LH4410 JFK→FRA 14:00 (120 economy seats), EK5500 JFK→DXB 16:30 (cancelled — use as context). What should we do for affected passengers?`,
          context: { airlineName: 'SkyMock Airlines', flightId: selected.flight },
        }),
      });
      const data = await res.json();
      setAiAdvice(data.result);
    } catch {
      setAiAdvice('Unable to fetch AI advice. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const updateDelay = (id: string, minutes: number) => {
    setFlights((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, delayMinutes: minutes, status: minutes > 0 ? 'Delayed' : 'On Time' }
          : f,
      ),
    );
  };

  const counts = {
    onTime: flights.filter((f) => f.status === 'On Time' || f.status === 'Departed' || f.status === 'Boarding').length,
    delayed: flights.filter((f) => f.status === 'Delayed').length,
    cancelled: flights.filter((f) => f.status === 'Cancelled').length,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Flight Operations</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor and manage today&apos;s departures</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'On Time / Departed', value: counts.onTime, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Delayed', value: counts.delayed, color: 'text-orange-500', bg: 'bg-orange-50' },
          { label: 'Cancelled', value: counts.cancelled, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Flight table */}
        <div className="col-span-2 space-y-2">
          {flights.map((f) => (
            <div
              key={f.id}
              onClick={() => setSelectedId(f.id)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                selectedId === f.id ? 'border-blue-400 shadow-md' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  <AirlineLogo code={f.flight.match(/^[A-Z]+/)?.[0] ?? ''} name={f.airline} size={20} />
                  <p className="font-bold text-gray-900 text-sm">{f.flight}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[f.status]}`}>
                  {f.status}
                </span>
              </div>
              <p className="text-xs text-gray-500">{f.origin} → {f.destination}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                <Clock size={10} /> {f.scheduled}
                {f.delayMinutes > 0 && (
                  <span className="text-orange-500 font-medium">+{f.delayMinutes}m</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="col-span-3 space-y-4">
          {selected ? (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <AirlineLogo code={selected.flight.match(/^[A-Z]+/)?.[0] ?? ''} name={selected.airline} size={28} />
                      <h2 className="font-bold text-gray-900">{selected.flight}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[selected.status]}`}>
                        {selected.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{selected.airline} · {selected.origin} → {selected.destination} · {selected.aircraft}</p>
                  </div>
                </div>

                {/* Seat availability */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Available Seats</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Economy', count: selected.availableSeats.economy },
                      { label: 'Business', count: selected.availableSeats.business },
                      { label: 'First', count: selected.availableSeats.first },
                    ].map(({ label, count }) => (
                      <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-gray-900">{count}</p>
                        <p className="text-xs text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Delay control */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Delay Management</p>
                  <div className="flex gap-2">
                    {[0, 15, 30, 45, 60, 90].map((min) => (
                      <button
                        key={min}
                        onClick={() => updateDelay(selected.id, min)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          selected.delayMinutes === min
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {min === 0 ? 'On Time' : `+${min}m`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Disruption Advice */}
              {(selected.status === 'Delayed' || selected.status === 'Cancelled') && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={15} className="text-orange-500" />
                      <h3 className="font-semibold text-sm text-gray-900">AI Disruption Advice</h3>
                    </div>
                    <button
                      onClick={getAiAdvice}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {aiLoading ? 'Thinking…' : 'Get AI Advice'}
                    </button>
                  </div>
                  {aiAdvice ? (
                    <p className="text-sm text-gray-700 leading-relaxed">{aiAdvice}</p>
                  ) : (
                    <p className="text-xs text-gray-400">Click &quot;Get AI Advice&quot; for rebooking recommendations powered by Claude.</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 h-48 flex items-center justify-center text-gray-400 text-sm">
              Select a flight to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
