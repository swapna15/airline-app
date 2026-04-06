'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Plane, ChevronRight, Clock, CalendarCheck, History, XCircle } from 'lucide-react';
import Link from 'next/link';
import { AirlineLogo } from '@/components/AirlineLogo';
import { getBookingHistory, type SavedBooking } from '@/utils/bookingStore';

type Tab = 'upcoming' | 'past' | 'cancelled';

function daysUntil(iso: string): number {
  if (!iso) return -Infinity;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function isFuture(b: SavedBooking) {
  if (!b.flight.departureTime) return false;
  return new Date(b.flight.departureTime).getTime() > Date.now();
}

function categorise(bookings: SavedBooking[]) {
  const upcoming: SavedBooking[] = [];
  const past: SavedBooking[]     = [];
  const cancelled: SavedBooking[] = [];

  for (const b of bookings) {
    if (b.status === 'cancelled') { cancelled.push(b); continue; }
    if (isFuture(b)) upcoming.push(b);
    else             past.push(b);
  }

  upcoming.sort((a, b) =>
    new Date(a.flight.departureTime).getTime() - new Date(b.flight.departureTime).getTime(),
  );
  past.sort((a, b) =>
    new Date(b.flight.departureTime).getTime() - new Date(a.flight.departureTime).getTime(),
  );
  cancelled.sort((a, b) =>
    new Date(b.cancelledAt ?? b.bookedAt).getTime() - new Date(a.cancelledAt ?? a.bookedAt).getTime(),
  );

  return { upcoming, past, cancelled };
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy: Record<Tab, { icon: React.ReactNode; heading: string; sub: string }> = {
    upcoming: {
      icon: <CalendarCheck size={36} className="mx-auto mb-3 text-gray-300" />,
      heading: 'No upcoming trips',
      sub: 'Book a flight and it will appear here.',
    },
    past: {
      icon: <History size={36} className="mx-auto mb-3 text-gray-300" />,
      heading: 'No past trips yet',
      sub: 'Your completed flights will appear here.',
    },
    cancelled: {
      icon: <XCircle size={36} className="mx-auto mb-3 text-gray-300" />,
      heading: 'No cancelled bookings',
      sub: "You haven't cancelled any trips.",
    },
  };
  const { icon, heading, sub } = copy[tab];
  return (
    <div className="text-center py-16">
      {icon}
      <p className="font-medium text-gray-500">{heading}</p>
      <p className="text-sm text-gray-400 mt-1">{sub}</p>
      {tab === 'upcoming' && (
        <Link href="/" className="inline-block mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
          Search Flights
        </Link>
      )}
    </div>
  );
}

function BookingCard({ b, tab }: { b: SavedBooking; tab: Tab }) {
  const days = daysUntil(b.flight.departureTime);
  const isCancelled = tab === 'cancelled';
  const isPast = tab === 'past';

  let daysLabel: React.ReactNode = null;
  if (!isCancelled && b.flight.departureTime) {
    if (days === 0)       daysLabel = <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Today</span>;
    else if (days === 1)  daysLabel = <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">Tomorrow</span>;
    else if (days > 1)    daysLabel = <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{days}d away</span>;
    else if (isPast)      daysLabel = <span className="text-xs text-gray-400">{Math.abs(days)}d ago</span>;
  }

  return (
    <Link
      href={`/bookings/${b.pnr}`}
      className={`block bg-white rounded-xl border p-5 hover:shadow-sm transition-all ${
        isCancelled ? 'border-gray-200 opacity-70 hover:opacity-100' :
        days >= 0 && days <= 1 ? 'border-orange-200 hover:border-orange-300' :
        'border-gray-200 hover:border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <AirlineLogo code={b.flight.airline.code} name={b.flight.airline.name} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900">
                {b.flight.origin.city} → {b.flight.destination.city}
              </p>
              {daysLabel}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {b.flight.airline.name}
              {b.flight.flightNumber && ` · ${b.flight.flightNumber}`}
              {b.flight.departureTime && (
                <> · {new Date(b.flight.departureTime).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</>
              )}
            </p>
            {b.passengers.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {b.passengers.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
              </p>
            )}
            {isCancelled && b.cancelledAt && (
              <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
                <XCircle size={10} />
                Cancelled {new Date(b.cancelledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0 flex items-start gap-2">
          <div>
            <p className="font-bold text-blue-600 tracking-widest text-sm">{b.pnr}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isCancelled ? 'bg-red-50 text-red-600' :
              isPast ? 'bg-gray-100 text-gray-500' :
              'bg-green-50 text-green-700'
            }`}>
              {isCancelled ? 'cancelled' : isPast ? 'completed' : b.status}
            </span>
            {b.total > 0 && (
              <p className="text-xs text-gray-400 mt-1">${b.total.toLocaleString()}</p>
            )}
          </div>
          <ChevronRight size={15} className="text-gray-300 mt-0.5" />
        </div>
      </div>
    </Link>
  );
}

export default function MyBookingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [bookings, setBookings] = useState<SavedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('upcoming');

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status !== 'authenticated') return;

    const local = getBookingHistory();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (apiUrl) {
      fetch('/api/bookings')
        .then((r) => r.json())
        .then((data) => {
          const serverBookings: SavedBooking[] = (data.bookings ?? []).map((b: Record<string, unknown>) => ({
            bookingId: b.id as string,
            pnr: b.pnr as string,
            status: b.status as SavedBooking['status'],
            bookedAt: b.created_at as string,
            cabinClass: (b.cabin_class as string) ?? 'economy',
            total: parseFloat(b.total_amount as string) || 0,
            flight: {
              airline: { code: (b.airline_code as string) ?? '', name: (b.airline_name as string) ?? '' },
              flightNumber: (b.flight_number as string) ?? '',
              origin: { code: (b.origin_code as string) ?? '', city: (b.origin_city as string) ?? '' },
              destination: { code: (b.destination_code as string) ?? '', city: (b.destination_city as string) ?? '' },
              departureTime: (b.departure_time as string) ?? '',
              totalDuration: '',
            },
            passengers: [],
          }));
          const serverPNRs = new Set(serverBookings.map((b) => b.pnr));
          setBookings([...serverBookings, ...local.filter((b) => !serverPNRs.has(b.pnr))]);
        })
        .catch(() => setBookings(local))
        .finally(() => setLoading(false));
    } else {
      setBookings(local);
      setLoading(false);
    }
  }, [status, router]);

  // Default to 'past' if nothing upcoming
  useEffect(() => {
    if (!loading && bookings.length > 0) {
      const { upcoming } = categorise(bookings);
      if (upcoming.length === 0) setActiveTab('past');
    }
  }, [loading, bookings]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const { upcoming, past, cancelled } = categorise(bookings);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'upcoming',  label: 'Upcoming',  icon: <Clock size={14} />,         count: upcoming.length },
    { key: 'past',      label: 'Past',       icon: <History size={14} />,       count: past.length },
    { key: 'cancelled', label: 'Cancelled',  icon: <XCircle size={14} />,       count: cancelled.length },
  ];

  const list = activeTab === 'upcoming' ? upcoming : activeTab === 'past' ? past : cancelled;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">My Trips</h1>
        <Link href="/" className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
          <Plane size={14} /> Book a flight
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-16">
          <Plane size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No bookings yet</p>
          <p className="text-sm text-gray-400 mt-1">Your confirmed flights will appear here.</p>
          <Link href="/" className="inline-block mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
            Search Flights
          </Link>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5">
            {tabs.map(({ key, label, icon, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {icon}
                {label}
                {count > 0 && (
                  <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    activeTab === key
                      ? key === 'cancelled' ? 'bg-red-100 text-red-600'
                        : key === 'upcoming' ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-200 text-gray-600'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Trip count summary for upcoming */}
          {activeTab === 'upcoming' && upcoming.length > 0 && (
            <p className="text-xs text-gray-400 mb-3">
              {upcoming.length} upcoming trip{upcoming.length !== 1 ? 's' : ''} · next departure{' '}
              {upcoming[0].flight.departureTime
                ? new Date(upcoming[0].flight.departureTime).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
                : '—'}
            </p>
          )}

          {/* List */}
          {list.length === 0 ? (
            <EmptyState tab={activeTab} />
          ) : (
            <div className="space-y-3">
              {list.map((b) => (
                <BookingCard key={b.bookingId} b={b} tab={activeTab} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
