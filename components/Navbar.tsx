'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useBooking } from '@/utils/bookingStore';
import type { UserRole } from '@/types/roles';
import { ROLE_LABELS } from '@/types/roles';

const NAV_LINKS: Record<UserRole, { label: string; href: string }[]> = {
  passenger: [
    { label: 'Search Flights', href: '/' },
    { label: 'My Bookings', href: '/my-bookings' },
  ],
  checkin_agent: [
    { label: 'Check-in Desk', href: '/checkin' },
  ],
  gate_manager: [
    { label: 'Gate Dashboard', href: '/gate' },
  ],
  coordinator: [
    { label: 'Flight Operations', href: '/coordinator' },
  ],
  admin: [
    { label: 'Admin', href: '/admin' },
    { label: 'Operations', href: '/coordinator' },
    { label: 'Gate', href: '/gate' },
    { label: 'Check-in', href: '/checkin' },
  ],
};

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  passenger: 'bg-blue-50 text-blue-700',
  checkin_agent: 'bg-green-50 text-green-700',
  gate_manager: 'bg-orange-50 text-orange-700',
  coordinator: 'bg-purple-50 text-purple-700',
  admin: 'bg-red-50 text-red-700',
};

export function Navbar() {
  const { adapter } = useBooking();
  const { brand } = adapter;
  const { data: session } = useSession();
  const role = (session?.user?.role ?? 'passenger') as UserRole;
  const links = NAV_LINKS[role];

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
      <Link href="/" className="flex items-center gap-2 font-bold text-xl" style={{ color: brand.primaryColor }}>
        <span>{brand.logo}</span>
        <span>{brand.name}</span>
      </Link>

      <div className="flex items-center gap-6 text-sm font-medium text-gray-600">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-gray-900 transition-colors">
            {l.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3 text-sm">
        {session ? (
          <>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_COLORS[role]}`}>
              {ROLE_LABELS[role]}
            </span>
            <span className="text-gray-500">{session.user?.name ?? session.user?.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="hover:text-gray-900 transition-colors">Sign In</Link>
            <Link href="/register" className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs">
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
