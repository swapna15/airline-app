'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Sparkles, Users, ChevronDown } from 'lucide-react';
import { AIRPORTS } from '@/utils/mockData';
import { useBooking } from '@/utils/bookingStore';
import type { SearchParams, CabinClass } from '@/types/flight';

function PassengerPicker({
  passengers,
  onChange,
}: {
  passengers: SearchParams['passengers'];
  onChange: (p: SearchParams['passengers']) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const total = passengers.adults + passengers.children + passengers.infants;

  const adjust = (key: keyof typeof passengers, delta: number) => {
    const next = { ...passengers, [key]: Math.max(key === 'adults' ? 1 : 0, passengers[key] + delta) };
    // infants cannot exceed adults
    if (next.infants > next.adults) next.infants = next.adults;
    onChange(next);
  };

  const rows: { key: keyof typeof passengers; label: string; sub: string; min: number }[] = [
    { key: 'adults', label: 'Adults', sub: 'Age 12+', min: 1 },
    { key: 'children', label: 'Children', sub: 'Age 2–11', min: 0 },
    { key: 'infants', label: 'Infants', sub: 'Under 2', min: 0 },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 bg-white"
      >
        <span className="flex items-center gap-1.5 text-gray-700">
          <Users size={14} className="text-gray-400" />
          {total} passenger{total !== 1 ? 's' : ''}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-4">
          {rows.map(({ key, label, sub, min }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => adjust(key, -1)}
                  disabled={passengers[key] <= min}
                  className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center text-base leading-none hover:bg-gray-50 disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-4 text-center text-sm font-medium text-gray-800">{passengers[key]}</span>
                <button
                  type="button"
                  onClick={() => adjust(key, 1)}
                  className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center text-base leading-none hover:bg-gray-50"
                >
                  +
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export function SearchForm() {
  const router = useRouter();
  const { setSearchParams } = useBooking();
  const [nlQuery, setNlQuery] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState('');
  const [form, setForm] = useState<SearchParams>({
    origin: null,
    destination: null,
    departureDate: '',
    returnDate: '',
    passengers: { adults: 1, children: 0, infants: 0 },
    class: 'economy',
    tripType: 'oneWay',
  });

  const isRoundTrip = form.tripType === 'roundTrip';

  const handleNlSearch = async () => {
    if (!nlQuery.trim()) return;
    setNlLoading(true);
    setNlError('');
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'search', payload: nlQuery }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const { result, error } = await res.json();
      if (error) throw new Error(error);

      const json = result.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(json);

      setForm((prev) => ({
        ...prev,
        origin: AIRPORTS.find((a) => a.code === parsed.origin?.code) ?? prev.origin,
        destination: AIRPORTS.find((a) => a.code === parsed.destination?.code) ?? prev.destination,
        departureDate: parsed.departureDate ?? prev.departureDate,
        returnDate: parsed.returnDate ?? prev.returnDate,
        passengers: parsed.passengers ?? prev.passengers,
        class: (parsed.class as CabinClass) ?? prev.class,
        tripType: parsed.tripType ?? prev.tripType,
      }));
    } catch (err) {
      setNlError(err instanceof Error ? err.message : 'AI search failed. Try again.');
    } finally {
      setNlLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.origin || !form.destination || !form.departureDate) return;
    if (isRoundTrip && !form.returnDate) return;
    const params = { ...form };
    if (!isRoundTrip) delete params.returnDate;
    setSearchParams(params);
    router.push('/search/results');
  };

  const canSubmit =
    !!form.origin && !!form.destination && !!form.departureDate && (!isRoundTrip || !!form.returnDate);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* NL search bar */}
      <div className="flex gap-2">
        <input
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
          placeholder='Try: "return flights NYC to London next Friday, 2 adults 1 child"'
          value={nlQuery}
          onChange={(e) => setNlQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleNlSearch())}
        />
        <button
          type="button"
          onClick={handleNlSearch}
          disabled={nlLoading}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          <Sparkles size={14} />
          {nlLoading ? 'Parsing…' : 'AI Search'}
        </button>
      </div>

      {nlError && <p className="text-sm text-red-600 -mt-2">{nlError}</p>}

      {/* Trip type toggle */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {(['oneWay', 'roundTrip'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setForm((p) => ({ ...p, tripType: type, returnDate: '' }))}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              form.tripType === type
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {type === 'oneWay' ? 'One Way' : 'Round Trip'}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
        {/* Origin */}
        <div>
          <label htmlFor="origin" className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <select
            id="origin"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            value={form.origin?.code ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, origin: AIRPORTS.find((a) => a.code === e.target.value) ?? null }))}
          >
            <option value="">Select origin</option>
            {AIRPORTS.map((a) => <option key={a.code} value={a.code}>{a.city} ({a.code})</option>)}
          </select>
        </div>

        {/* Destination */}
        <div>
          <label htmlFor="destination" className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <select
            id="destination"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            value={form.destination?.code ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, destination: AIRPORTS.find((a) => a.code === e.target.value) ?? null }))}
          >
            <option value="">Select destination</option>
            {AIRPORTS.map((a) => <option key={a.code} value={a.code}>{a.city} ({a.code})</option>)}
          </select>
        </div>

        {/* Departure date */}
        <div>
          <label htmlFor="departure" className="block text-xs font-medium text-gray-500 mb-1">Departure</label>
          <input
            id="departure"
            type="date"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            value={form.departureDate}
            onChange={(e) => setForm((p) => ({ ...p, departureDate: e.target.value }))}
          />
        </div>

        {/* Return date — only when round trip */}
        <div>
          <label htmlFor="return-date" className="block text-xs font-medium text-gray-500 mb-1">
            Return {!isRoundTrip && <span className="text-gray-300">(one way)</span>}
          </label>
          <input
            id="return-date"
            type="date"
            disabled={!isRoundTrip}
            min={form.departureDate || undefined}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-300"
            value={form.returnDate ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, returnDate: e.target.value }))}
          />
        </div>

        {/* Passengers */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Passengers</label>
          <PassengerPicker
            passengers={form.passengers}
            onChange={(passengers) => setForm((p) => ({ ...p, passengers }))}
          />
        </div>

        {/* Cabin class */}
        <div>
          <label htmlFor="cabin-class" className="block text-xs font-medium text-gray-500 mb-1">Class</label>
          <select
            id="cabin-class"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            value={form.class}
            onChange={(e) => setForm((p) => ({ ...p, class: e.target.value as CabinClass }))}
          >
            <option value="economy">Economy</option>
            <option value="business">Business</option>
            <option value="first">First Class</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
      >
        <Search size={16} />
        Search Flights
      </button>
    </form>
  );
}
