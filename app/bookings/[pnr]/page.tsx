'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle, Plane, User, CreditCard, ArrowLeft, Clock,
  XCircle, AlertTriangle, Loader2, Sparkles, Search, ChevronRight,
  Briefcase, Luggage,
} from 'lucide-react';
import { AirlineLogo } from '@/components/AirlineLogo';
import {
  getBookingHistory, cancelBookingLocally, type SavedBooking,
} from '@/utils/bookingStore';
import { useBooking } from '@/utils/bookingStore';
import { useTenant } from '@/core/tenant/context';
import type { TenantConfig } from '@/types/tenant';

// ─── Refund policy (driven by tenant config) ──────────────────────────────────
interface RefundInfo {
  percentage: number;
  amount: number;
  reason: string;
}

function calcRefund(
  departureTime: string,
  total: number,
  policy: TenantConfig['policies']['cancellation'],
): RefundInfo {
  if (!departureTime || !total) {
    return { percentage: 0, amount: 0, reason: 'No departure time on record.' };
  }
  const hoursLeft = (new Date(departureTime).getTime() - Date.now()) / 3_600_000;
  if (hoursLeft <= 0) {
    return { percentage: 0, amount: 0, reason: policy.noRefundMessage };
  }
  // Tiers are sorted descending by hoursThreshold — first match wins
  for (const tier of policy.refundTiers) {
    if (hoursLeft > tier.hoursThreshold) {
      return {
        percentage: tier.percentage,
        amount: Math.round(total * (tier.percentage / 100)),
        reason: `${tier.percentage}% refund — more than ${tier.hoursThreshold}h before departure.`,
      };
    }
  }
  return { percentage: 0, amount: 0, reason: policy.noRefundMessage };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDateTime(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

// ─── Cancel modal ─────────────────────────────────────────────────────────────
function CancelModal({
  booking,
  refund,
  onConfirm,
  onClose,
  loading,
}: {
  booking: SavedBooking;
  refund: RefundInfo;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <AlertTriangle size={22} className="text-red-500 flex-shrink-0" />
          <h2 className="text-lg font-bold text-gray-900">Cancel this booking?</h2>
        </div>

        <p className="text-sm text-gray-600">
          You are about to cancel{' '}
          <span className="font-mono font-bold text-blue-600">{booking.pnr}</span> —{' '}
          {booking.flight.origin.city} → {booking.flight.destination.city}.
          This action cannot be undone.
        </p>

        {/* Refund preview */}
        <div className={`rounded-xl p-4 ${refund.amount > 0 ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
          <p className={`text-xs font-semibold mb-1 ${refund.amount > 0 ? 'text-green-700' : 'text-orange-700'}`}>
            {refund.amount > 0 ? `Refund: $${refund.amount.toLocaleString()} (${refund.percentage}%)` : 'No refund applicable'}
          </p>
          <p className={`text-xs ${refund.amount > 0 ? 'text-green-600' : 'text-orange-600'}`}>
            {refund.reason}
          </p>
          {refund.amount > 0 && (
            <p className="text-xs text-green-600 mt-1">
              Allow 5–10 business days for the refund to appear on your original payment method.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Keep Booking
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Cancelling…</> : 'Confirm Cancellation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function BookingDetailPage() {
  const { pnr } = useParams<{ pnr: string }>();
  const router = useRouter();
  const { setSearchParams } = useBooking();
  const { tenant, preferences } = useTenant();

  const [booking, setBooking] = useState<SavedBooking | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const found = getBookingHistory().find((b) => b.pnr === pnr);
    if (found) {
      setBooking(found);
      if (found.status === 'cancelled') setCancelled(true);
    } else {
      setNotFound(true);
    }
  }, [pnr]);

  // ── AI rebooking advice ──────────────────────────────────────────────────────
  const fetchAiAdvice = useCallback(async (b: SavedBooking) => {
    setAiLoading(true);
    setAiAdvice('');
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'disruption',
          payload: `A passenger has cancelled their booking (PNR: ${b.pnr}) for flight ${b.flight.flightNumber} from ${b.flight.origin.city} (${b.flight.origin.code}) to ${b.flight.destination.city} (${b.flight.destination.code}) scheduled for ${b.flight.departureTime ? new Date(b.flight.departureTime).toLocaleDateString() : 'unknown date'}. Cabin class: ${b.cabinClass}. Total paid: $${b.total}. Provide 3–4 concise rebooking recommendations including: best times to search for lower fares, flexible date tips, and alternative routing if applicable.`,
          context: { tenantId: tenant.id, airlineName: b.flight.airline.name, userPreferences: preferences },
        }),
      });
      const data = await res.json();
      setAiAdvice(data.result ?? '');
    } catch {
      setAiAdvice('Unable to load recommendations right now.');
    } finally {
      setAiLoading(false);
    }
  }, [tenant.id, preferences]);

  // ── Cancellation ─────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!booking) return;
    setCancelling(true);

    // 1. Try Lambda if configured (best-effort — we always do local cancel)
    if (process.env.NEXT_PUBLIC_API_URL && !booking.bookingId.startsWith('mock-')) {
      await fetch(`/api/bookings/${booking.bookingId}`, { method: 'DELETE' }).catch(() => {});
    }

    // 2. Update localStorage
    cancelBookingLocally(booking.pnr);
    const updated = { ...booking, status: 'cancelled' as const, cancelledAt: new Date().toISOString() };
    setBooking(updated);
    setCancelled(true);

    // 3. Cancellation email (best-effort)
    if (booking.contactEmail) {
      const refund = calcRefund(booking.flight.departureTime, booking.total, tenant.policies.cancellation);
      fetch('/api/email/booking-cancellation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: booking.contactEmail,
          pnr: booking.pnr,
          bookingId: booking.bookingId,
          flight: booking.flight,
          passengers: booking.passengers,
          refundAmount: refund.amount,
          refundPercentage: refund.percentage,
          refundReason: refund.reason,
          total: booking.total,
          cancelledAt: updated.cancelledAt,
          appUrl: window.location.origin,
        }),
      }).catch(() => {});
    }

    setCancelling(false);
    setShowModal(false);

    // 4. Auto-fetch AI rebooking advice
    fetchAiAdvice(updated);
  };

  // ── Rebook ────────────────────────────────────────────────────────────────────
  const handleRebook = () => {
    if (!booking) return;
    setSearchParams({
      origin: { code: booking.flight.origin.code, name: booking.flight.origin.city, city: booking.flight.origin.city, country: '' },
      destination: { code: booking.flight.destination.code, name: booking.flight.destination.city, city: booking.flight.destination.city, country: '' },
      departureDate: '',
      returnDate: '',
      passengers: { adults: Math.max(1, booking.passengers.length), children: 0, infants: 0 },
      class: (booking.cabinClass as 'economy' | 'business' | 'first') ?? 'economy',
      tripType: 'oneWay',
    });
    router.push('/');
  };

  // ── Not found ────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <Plane size={40} className="mx-auto mb-4 text-gray-300" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Booking not found</h2>
        <p className="text-gray-500 text-sm mb-6">
          We couldn&apos;t find booking{' '}
          <span className="font-mono font-bold text-blue-600">{pnr}</span> in this browser.
          If you booked on another device, please check that device or contact support.
        </p>
        <Link href="/bookings" className="text-sm text-blue-600 hover:underline">
          ← Search for another booking
        </Link>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const refund = calcRefund(booking.flight.departureTime, booking.total, tenant.policies.cancellation);
  const seatsAssigned = booking.passengers.some((p) => p.seat);
  const cabinLabel = booking.cabinClass.charAt(0).toUpperCase() + booking.cabinClass.slice(1);
  const isCancelled = booking.status === 'cancelled' || cancelled;

  return (
    <>
      {showModal && (
        <CancelModal
          booking={booking}
          refund={refund}
          onConfirm={handleCancel}
          onClose={() => setShowModal(false)}
          loading={cancelling}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Back */}
        <Link href="/my-bookings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> My Bookings
        </Link>

        {/* ── Post-cancellation banner ── */}
        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <XCircle size={20} className="text-red-500" />
              <h2 className="font-bold text-red-800">This booking has been cancelled</h2>
            </div>
            {booking.cancelledAt && (
              <p className="text-sm text-red-600">
                Cancelled on {formatDateTime(booking.cancelledAt)}
              </p>
            )}
            {refund.amount > 0 ? (
              <div className="bg-white rounded-xl border border-green-200 p-4">
                <p className="text-sm font-semibold text-green-700">
                  Refund: ${refund.amount.toLocaleString()} ({refund.percentage}%)
                </p>
                <p className="text-xs text-green-600 mt-0.5">{refund.reason}</p>
                <p className="text-xs text-green-500 mt-1">
                  Allow 5–10 business days for the refund to appear on your original payment method.
                </p>
              </div>
            ) : (
              <p className="text-sm text-red-600">{refund.reason}</p>
            )}
          </div>
        )}

        {/* ── Header ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {isCancelled
                ? <XCircle size={28} className="text-red-400 flex-shrink-0" />
                : <CheckCircle size={28} className="text-green-500 flex-shrink-0" />}
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {isCancelled ? 'Cancelled Booking' : 'Booking Confirmed'}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Booked {new Date(booking.bookedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">Reference</p>
              <p className="text-2xl font-extrabold tracking-widest text-blue-600">{booking.pnr}</p>
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                isCancelled ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                {isCancelled ? 'cancelled' : booking.status}
              </span>
            </div>
          </div>
        </div>

        {/* ── Flight ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Plane size={15} className="text-blue-600" />
            <h2 className="font-semibold text-gray-900">Flight Details</h2>
          </div>

          <div className="flex items-center gap-3">
            <AirlineLogo code={booking.flight.airline.code} name={booking.flight.airline.name} size={40} />
            <div>
              <p className="font-semibold text-gray-900">{booking.flight.airline.name}</p>
              <p className="text-sm text-gray-500">{booking.flight.flightNumber} · {cabinLabel}</p>
            </div>
          </div>

          <div className={`rounded-xl p-4 ${isCancelled ? 'bg-red-50' : 'bg-blue-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-extrabold text-gray-900">{booking.flight.origin.code}</p>
                <p className="text-sm text-gray-500 mt-0.5">{booking.flight.origin.city}</p>
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <Clock size={11} />{formatDateTime(booking.flight.departureTime)}
                </p>
              </div>
              <div className="text-center px-4">
                <p className="text-xs text-gray-400">{booking.flight.totalDuration}</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-2 h-2 rounded-full bg-blue-300" />
                  <div className="h-px bg-blue-200 w-12" />
                  <Plane size={13} className="text-blue-400" />
                  <div className="h-px bg-blue-200 w-12" />
                  <div className="w-2 h-2 rounded-full bg-blue-300" />
                </div>
                <p className="text-xs text-blue-500 mt-1">Non-stop</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold text-gray-900">{booking.flight.destination.code}</p>
                <p className="text-sm text-gray-500 mt-0.5">{booking.flight.destination.city}</p>
                {booking.flight.arrivalTime && (
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1 justify-end">
                    <Clock size={11} />{formatDateTime(booking.flight.arrivalTime)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Passengers ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={15} className="text-blue-600" />
            <h2 className="font-semibold text-gray-900">Passengers</h2>
          </div>
          <div className="space-y-3">
            {booking.passengers.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm">
                    {p.firstName[0]}{p.lastName[0]}
                  </div>
                  <p className="font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                </div>
                {seatsAssigned && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Seat</p>
                    <p className="font-bold text-blue-600">{p.seat ?? '—'}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Baggage ── */}
        {booking.baggage && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase size={15} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">Baggage</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-700">
                  <Briefcase size={14} className="text-gray-400" /> Carry-on
                </span>
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <CheckCircle size={13} /> {booking.baggage.carry}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-700">
                  <Luggage size={14} className="text-gray-400" /> Checked bag
                </span>
                {booking.baggage.checkedIncluded ? (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <CheckCircle size={13} /> {booking.baggage.checked}
                  </span>
                ) : (
                  <span className="text-gray-400">Not included</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Price breakdown ── */}
        {booking.priceBreakdown && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={15} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">Payment</h2>
            </div>
            <div className="space-y-2">
              {[
                ['Base Fare', booking.priceBreakdown.baseFare],
                ['Taxes & Charges', booking.priceBreakdown.taxes],
                ['Booking Fee', booking.priceBreakdown.fees],
                ...(booking.priceBreakdown.seatFees > 0
                  ? [['Seat Selection', booking.priceBreakdown.seatFees] as [string, number]]
                  : []),
              ].map(([label, amount]) => (
                <div key={label as string} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="text-gray-800">${(amount as number).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-base pt-3 border-t border-gray-100">
                <span className="text-gray-900">Total Paid</span>
                <span className={isCancelled ? 'text-red-500 line-through' : 'text-green-600'}>
                  ${booking.priceBreakdown.total.toLocaleString()}
                </span>
              </div>
              {isCancelled && refund.amount > 0 && (
                <div className="flex justify-between font-bold text-base">
                  <span className="text-green-700">Refund</span>
                  <span className="text-green-600">+${refund.amount.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AI Rebooking Recommendations ── */}
        {isCancelled && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-purple-600" />
                <h2 className="font-semibold text-gray-900">Rebooking Recommendations</h2>
              </div>
              {!aiLoading && !aiAdvice && (
                <button
                  onClick={() => fetchAiAdvice(booking)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Sparkles size={11} /> Get AI Tips
                </button>
              )}
            </div>

            {aiLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" /> Generating recommendations…
              </div>
            )}

            {aiAdvice && !aiLoading && (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{aiAdvice}</p>
            )}

            {!aiAdvice && !aiLoading && (
              <p className="text-sm text-gray-400">
                Click &quot;Get AI Tips&quot; for personalised rebooking advice powered by Claude.
              </p>
            )}

            <button
              onClick={handleRebook}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Search size={15} />
              Search Similar Flights
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* ── Actions ── */}
        {!isCancelled && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <Link
                href="/"
                className="flex-1 py-3 text-center border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Book Another Flight
              </Link>
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Print / Save PDF
              </button>
            </div>

            {/* Cancellation eligibility hint */}
            <div className="bg-gray-50 rounded-xl p-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Need to cancel?</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {refund.percentage > 0
                    ? `You are eligible for a ${refund.percentage}% refund ($${refund.amount.toLocaleString()}).`
                    : refund.reason}
                </p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex-shrink-0 px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50 transition-colors font-medium"
              >
                Cancel Booking
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
