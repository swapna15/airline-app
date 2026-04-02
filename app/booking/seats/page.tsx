'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useBooking } from '@/utils/bookingStore';
import { SeatMap } from '@/components/SeatMap';
import type { Seat } from '@/types/flight';

export default function SeatsPage() {
  const router = useRouter();
  const { selectedFlight, searchParams, selectedSeats, setSelectedSeats, adapter } = useBooking();
  const [seatMap, setSeatMap] = useState<Seat[][]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedFlight) { router.replace('/'); return; }
    adapter
      .getSeatMap(selectedFlight.id, searchParams?.class ?? 'economy')
      .then(setSeatMap)
      .finally(() => setLoading(false));
  }, []);

  const toggleSeat = (seat: Seat) => {
    setSelectedSeats(
      selectedSeats.some((s) => s.id === seat.id)
        ? selectedSeats.filter((s) => s.id !== seat.id)
        : [...selectedSeats, seat]
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Select Your Seat</h2>
      <p className="text-sm text-gray-500 mb-6">
        {selectedFlight?.segments[0].airline.name} · {selectedFlight?.segments[0].flightNumber} · {searchParams?.class}
      </p>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <SeatMap seats={seatMap} selectedSeats={selectedSeats} onSeatToggle={toggleSeat} />
      </div>

      {selectedSeats.length > 0 && (
        <div className="mt-4 flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-blue-700">
            Selected: {selectedSeats.map((s) => s.id).join(', ')}
          </p>
          <button
            onClick={() => router.push('/booking/passengers')}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
