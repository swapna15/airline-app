'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { useBooking } from '@/utils/bookingStore';

export default function ConfirmationPage() {
  const router = useRouter();
  const { confirmation, selectedFlight, passengers, priceBreakdown, searchParams, reset } = useBooking();

  useEffect(() => {
    if (!confirmation) router.replace('/');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!confirmation || !selectedFlight) return null;

  const segment = selectedFlight.segments[0];

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-6">
      <div className="flex justify-center">
        <CheckCircle size={64} className="text-green-500" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
        <p className="text-gray-500 mt-1">A confirmation has been sent to your email.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-left space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Booking Reference</span>
          <span className="font-bold text-blue-600 text-lg tracking-widest">{confirmation.pnr}</span>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{segment.airline.logo}</span>
            <div className="text-sm">
              <p className="font-medium">{segment.airline.name} {segment.flightNumber}</p>
              <p className="text-gray-500">
                {segment.departure.airport.city} ({segment.departure.airport.code}) →{' '}
                {segment.arrival.airport.city} ({segment.arrival.airport.code})
              </p>
              <p className="text-gray-500">{searchParams?.departureDate} · {selectedFlight.totalDuration}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Passengers</p>
          {passengers.map((p) => (
            <p key={p.id} className="text-sm text-gray-800">{p.title} {p.firstName} {p.lastName}</p>
          ))}
        </div>
        {priceBreakdown && (
          <div className="border-t border-gray-100 pt-4 flex justify-between font-bold">
            <span>Total Paid</span>
            <span className="text-green-600">${priceBreakdown.total.toLocaleString()}</span>
          </div>
        )}
      </div>

      <Link href="/" onClick={reset}
        className="inline-block px-8 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors">
        Book Another Flight
      </Link>
    </div>
  );
}
