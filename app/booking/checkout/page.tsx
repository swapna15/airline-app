'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useBooking } from '@/utils/bookingStore';
import { PriceSummary } from '@/components/PriceSummary';
import type { PriceBreakdown } from '@/types/booking';

export default function CheckoutPage() {
  const router = useRouter();
  const { selectedFlight, searchParams, selectedSeats, passengers, contactInfo, adapter, setPriceBreakdown, setConfirmation } = useBooking();
  const [submitting, setSubmitting] = useState(false);
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' });

  useEffect(() => {
    if (!selectedFlight || !passengers.length) { router.replace('/'); }
  }, []);

  if (!selectedFlight) return null;

  const cabinClass = searchParams?.class ?? 'economy';
  const baseFare = selectedFlight.prices[cabinClass] * passengers.length;
  const taxes = Math.round(baseFare * 0.12);
  const fees = 35;
  const seatFees = selectedSeats.reduce((sum, s) => sum + (s.price ?? 0), 0);
  const breakdown: PriceBreakdown = { baseFare, taxes, fees, seatFees, total: baseFare + taxes + fees + seatFees };

  const segment = selectedFlight.segments[0];

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setPriceBreakdown(breakdown);
    try {
      const confirmation = await adapter.createBooking({
        flight: selectedFlight,
        passengers,
        contactInfo: contactInfo!,
        priceBreakdown: breakdown,
      });
      setConfirmation(confirmation);
      router.push('/booking/confirmation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Review & Pay</h2>

      {/* Itinerary */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Your Flight</h3>
        <div className="flex items-center gap-4">
          <span className="text-2xl">{segment.airline.logo}</span>
          <div className="text-sm">
            <p className="font-medium">{segment.airline.name} · {segment.flightNumber}</p>
            <p className="text-gray-500">
              {segment.departure.airport.city} → {segment.arrival.airport.city} · {selectedFlight.totalDuration}
            </p>
            <p className="text-gray-500 capitalize">{cabinClass} · {passengers.length} passenger{passengers.length > 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      <PriceSummary breakdown={breakdown} />

      {/* Payment */}
      <form onSubmit={handlePay} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">Payment (Demo)</h3>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Card Number</label>
          <input required placeholder="4242 4242 4242 4242"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            value={card.number} onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Expiry</label>
            <input required placeholder="MM/YY"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              value={card.expiry} onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">CVV</label>
            <input required placeholder="123"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              value={card.cvv} onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value }))} />
          </div>
        </div>
        <button type="submit" disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors">
          {submitting ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : `Pay $${breakdown.total.toLocaleString()}`}
        </button>
      </form>
    </div>
  );
}
