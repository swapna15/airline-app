'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useBooking } from '@/utils/bookingStore';
import { FlightCard } from '@/components/FlightCard';
import type { Flight } from '@/types/flight';

export default function ResultsPage() {
  const router = useRouter();
  const { searchParams, setSelectedFlight } = useBooking();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!searchParams?.origin || !searchParams?.destination) {
      router.replace('/');
      return;
    }
    fetch('/api/flights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchParams),
    })
      .then((r) => r.json())
      .then(({ flights }) => setFlights(flights))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (flight: Flight) => {
    setSelectedFlight(flight);
    router.push('/booking/seats');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {searchParams?.origin?.city} → {searchParams?.destination?.city}
          {searchParams?.tripType === 'roundTrip' && ' (Return)'}
        </h2>
        <p className="text-sm text-gray-500">
          {searchParams?.departureDate}
          {searchParams?.tripType === 'roundTrip' && searchParams?.returnDate && ` → ${searchParams.returnDate}`}
          {' · '}
          {[
            searchParams?.passengers.adults && `${searchParams.passengers.adults} adult${searchParams.passengers.adults !== 1 ? 's' : ''}`,
            searchParams?.passengers.children ? `${searchParams.passengers.children} child${searchParams.passengers.children !== 1 ? 'ren' : ''}` : null,
            searchParams?.passengers.infants ? `${searchParams.passengers.infants} infant${searchParams.passengers.infants !== 1 ? 's' : ''}` : null,
          ].filter(Boolean).join(', ')}
          {' · '}{searchParams?.class}
        </p>
      </div>

      <div className="space-y-3">
        {flights.map((flight) => (
          <FlightCard
            key={flight.id}
            flight={flight}
            selectedClass={searchParams?.class ?? 'economy'}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
