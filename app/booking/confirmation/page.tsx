'use client';

import { useEffect, useState } from 'react';
import { AirlineLogo } from '@/components/AirlineLogo';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Mail, Loader2 } from 'lucide-react';
import { useBooking } from '@/utils/bookingStore';

export default function ConfirmationPage() {
  const router = useRouter();
  const { confirmation, selectedFlight, passengers, priceBreakdown, searchParams, contactInfo, selectedSeats, reset } = useBooking();
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (!confirmation) { router.replace('/'); return; }

    // Send confirmation email if we have a contact email
    if (contactInfo?.email && emailStatus === 'idle') {
      setEmailStatus('sending');

      const segment = selectedFlight?.segments[0];
      fetch('/api/email/booking-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contactInfo.email,
          pnr: confirmation.pnr,
          bookingId: confirmation.bookingId,
          flight: {
            airline: { code: segment?.airline.code ?? '', name: segment?.airline.name ?? '' },
            flightNumber: segment?.flightNumber ?? '',
            origin: { code: segment?.departure.airport.code ?? '', city: segment?.departure.airport.city ?? '' },
            destination: { code: segment?.arrival.airport.code ?? '', city: segment?.arrival.airport.city ?? '' },
            departureTime: segment?.departure.time ?? '',
            arrivalTime: segment?.arrival.time ?? '',
            totalDuration: selectedFlight?.totalDuration ?? '',
          },
          passengers: passengers.map((p, i) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            seat: selectedSeats[i]?.id,
          })),
          priceBreakdown: priceBreakdown ?? { baseFare: 0, taxes: 0, fees: 0, seatFees: 0, baggageFees: 0, total: 0 },
          baggage: selectedFlight?.baggage
            ? {
                carry: selectedFlight.baggage.carry,
                carryIncluded: selectedFlight.baggage.carryIncluded,
                checked: selectedFlight.baggage.checked,
                checkedIncluded: selectedFlight.baggage.checkedIncluded ||
                  ((priceBreakdown?.baggageFees ?? 0) > 0),
              }
            : undefined,
          cabinClass: searchParams?.class ?? 'economy',
          bookedAt: new Date().toISOString(),
          appUrl: window.location.origin,
        }),
      })
        .then((r) => r.ok ? setEmailStatus('sent') : setEmailStatus('error'))
        .catch(() => setEmailStatus('error'));
    }
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
        {emailStatus === 'sending' && (
          <p className="text-gray-400 mt-1 flex items-center justify-center gap-1.5 text-sm">
            <Loader2 size={13} className="animate-spin" /> Sending confirmation email…
          </p>
        )}
        {emailStatus === 'sent' && (
          <p className="text-green-600 mt-1 flex items-center justify-center gap-1.5 text-sm">
            <Mail size={13} /> Confirmation sent to {contactInfo?.email}
          </p>
        )}
        {emailStatus === 'error' && (
          <p className="text-gray-400 mt-1 text-sm">
            Email could not be sent — use the link below to access your booking.
          </p>
        )}
        {emailStatus === 'idle' && (
          <p className="text-gray-500 mt-1 text-sm">Use the reference below to manage your booking.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-left space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Booking Reference</span>
          <span className="font-bold text-blue-600 text-lg tracking-widest">{confirmation.pnr}</span>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center gap-3">
            <AirlineLogo code={segment.airline.code} name={segment.airline.name} size={36} />
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
          {passengers.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between text-sm text-gray-800 py-0.5">
              <span>{p.title} {p.firstName} {p.lastName}</span>
              {selectedSeats[i] && (
                <span className="text-xs font-bold text-blue-600">Seat {selectedSeats[i].id}</span>
              )}
            </div>
          ))}
        </div>
        {priceBreakdown && (
          <div className="border-t border-gray-100 pt-4 flex justify-between font-bold">
            <span>Total Paid</span>
            <span className="text-green-600">${priceBreakdown.total.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href={`/bookings/${confirmation.pnr}`}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors text-center"
        >
          View Full Booking Details
        </Link>
        <Link href="/" onClick={reset}
          className="w-full py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors text-center">
          Book Another Flight
        </Link>
      </div>
    </div>
  );
}
