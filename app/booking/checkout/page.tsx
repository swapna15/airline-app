'use client';

import { useState, useEffect } from 'react';
import { AirlineLogo } from '@/components/AirlineLogo';
import { useRouter } from 'next/navigation';
import { Loader2, Briefcase, Luggage, CheckCircle, AlertCircle, Plus, Minus } from 'lucide-react';
import { useBooking } from '@/utils/bookingStore';
import { PriceSummary } from '@/components/PriceSummary';
import type { PriceBreakdown } from '@/types/booking';

export default function CheckoutPage() {
  const router = useRouter();
  const {
    selectedFlight, searchParams, selectedSeats, passengers,
    contactInfo, adapter, setPriceBreakdown, setConfirmation,
  } = useBooking();
  const [submitting, setSubmitting] = useState(false);
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' });
  const [addCheckedBag, setAddCheckedBag] = useState(false);

  useEffect(() => {
    if (!selectedFlight || !passengers.length) router.replace('/');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!selectedFlight) return null;

  const cabinClass = searchParams?.class ?? 'economy';
  const paxCount   = passengers.length;
  const baggage    = selectedFlight.baggage;

  const baseFare     = selectedFlight.prices[cabinClass] * paxCount;
  const taxes        = Math.round(baseFare * 0.12);
  const fees         = 35;
  const seatFees     = selectedSeats.reduce((sum, s) => sum + (s.price ?? 0), 0);
  const baggageFees  = addCheckedBag && baggage.checkedFee
    ? baggage.checkedFee * paxCount
    : 0;

  const breakdown: PriceBreakdown = {
    baseFare, taxes, fees, seatFees, baggageFees,
    total: baseFare + taxes + fees + seatFees + baggageFees,
  };

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
          <AirlineLogo code={segment.airline.code} name={segment.airline.name} size={36} />
          <div className="text-sm">
            <p className="font-medium">{segment.airline.name} · {segment.flightNumber}</p>
            <p className="text-gray-500">
              {segment.departure.airport.city} → {segment.arrival.airport.city} · {selectedFlight.totalDuration}
            </p>
            <p className="text-gray-500 capitalize">
              {cabinClass} · {paxCount} passenger{paxCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* ── Baggage ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">Baggage</h3>

        {/* Carry-on — always included */}
        <div className="flex items-center justify-between py-2 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <Briefcase size={16} className="text-green-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Carry-on bag</p>
              <p className="text-xs text-gray-400">{baggage.carry}</p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckCircle size={13} /> Included
          </span>
        </div>

        {/* Checked bag */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2.5">
            <Luggage size={16} className={baggage.checkedIncluded ? 'text-green-500' : 'text-gray-400'} />
            <div>
              <p className="text-sm font-medium text-gray-800">Checked bag</p>
              <p className="text-xs text-gray-400">
                {baggage.checkedIncluded ? baggage.checked : '23kg · 1 per passenger'}
              </p>
            </div>
          </div>

          {baggage.checkedIncluded ? (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <CheckCircle size={13} /> Included
            </span>
          ) : baggage.checkedFee ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-orange-600">
                  +${(baggage.checkedFee * paxCount).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400">
                  ${baggage.checkedFee}/pax{paxCount > 1 ? ` × ${paxCount}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddCheckedBag((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  addCheckedBag
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {addCheckedBag ? <><Minus size={12} /> Remove</> : <><Plus size={12} /> Add</>}
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <AlertCircle size={13} /> Not available
            </span>
          )}
        </div>

        {/* Warning banner if checked bag NOT added and NOT included */}
        {!baggage.checkedIncluded && !addCheckedBag && baggage.checkedFee && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-orange-700">
              Your fare does not include a checked bag. Add one now for ${baggage.checkedFee}/passenger,
              or pay at the airport (fees may be higher).
            </p>
          </div>
        )}

        {addCheckedBag && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-start gap-2">
            <CheckCircle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              Checked bag added for all {paxCount} passenger{paxCount > 1 ? 's' : ''} — 1 × 23kg each.
            </p>
          </div>
        )}
      </div>

      <PriceSummary breakdown={breakdown} />

      {/* Payment */}
      <form onSubmit={handlePay} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">Payment (Demo)</h3>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Card Number</label>
          <input
            required
            placeholder="4242 4242 4242 4242"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            value={card.number}
            onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Expiry</label>
            <input
              required
              placeholder="MM/YY"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              value={card.expiry}
              onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">CVV</label>
            <input
              required
              placeholder="123"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              value={card.cvv}
              onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value }))}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {submitting
            ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
            : `Pay $${breakdown.total.toLocaleString()}`}
        </button>
      </form>
    </div>
  );
}
