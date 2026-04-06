'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Plane, LogIn } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getBookingHistory } from '@/utils/bookingStore';

export default function BookingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [pnr, setPnr] = useState('');
  const [error, setError] = useState('');

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pnr.trim().toUpperCase();
    if (!trimmed) return;

    const history = getBookingHistory();
    const found = history.find((b) => b.pnr === trimmed);
    if (found) {
      router.push(`/bookings/${trimmed}`);
    } else {
      setError(`No booking found for reference "${trimmed}" in this browser. Check the PNR in your confirmation email.`);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-16 space-y-8">
      <div className="text-center">
        <Plane size={36} className="mx-auto mb-3 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Find Your Booking</h1>
        <p className="text-gray-500 text-sm mt-2">
          Enter your booking reference (PNR) from your confirmation email.
        </p>
      </div>

      <form onSubmit={handleLookup} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Booking Reference (PNR)</label>
          <input
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-mono uppercase tracking-widest focus:outline-none focus:border-blue-400 text-center text-lg font-bold"
            placeholder="e.g. ABC123"
            value={pnr}
            onChange={(e) => { setPnr(e.target.value.toUpperCase()); setError(''); }}
            maxLength={10}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={!pnr.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          <Search size={15} />
          Find Booking
        </button>
      </form>

      {session ? (
        <div className="text-center">
          <Link href="/my-bookings" className="text-sm text-blue-600 hover:underline">
            View all your bookings →
          </Link>
        </div>
      ) : (
        <div className="bg-blue-50 rounded-xl p-4 flex items-start gap-3">
          <LogIn size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Have an account?</p>
            <p className="text-xs text-blue-700 mt-0.5">
              <Link href="/login" className="underline">Sign in</Link> to see all your bookings in one place.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
