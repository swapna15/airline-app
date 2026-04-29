'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { UserRole } from '@/types/roles';
import { ROLE_LABELS } from '@/types/roles';
import { useTenant } from '@/core/tenant/context';

const NAV_LINKS: Record<UserRole, { label: string; href: string }[]> = {
  passenger:      [{ label: 'Search Flights', href: '/' }, { label: 'My Trips', href: '/my-bookings' }],
  checkin_agent:  [{ label: 'Check-in Desk', href: '/checkin' }],
  gate_manager:   [{ label: 'Gate Dashboard', href: '/gate' }],
  coordinator:    [{ label: 'Flight Operations', href: '/coordinator' }],
  flight_planner: [{ label: 'Planner Dashboard', href: '/planner' }],
  admin:          [
    { label: 'Admin', href: '/admin' },
    { label: 'Operations', href: '/coordinator' },
    { label: 'Planner', href: '/planner' },
    { label: 'Gate', href: '/gate' },
    { label: 'Check-in', href: '/checkin' },
  ],
};

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  passenger:      'bg-blue-50 text-blue-700',
  checkin_agent:  'bg-green-50 text-green-700',
  gate_manager:   'bg-orange-50 text-orange-700',
  coordinator:    'bg-purple-50 text-purple-700',
  flight_planner: 'bg-amber-50 text-amber-700',
  admin:          'bg-red-50 text-red-700',
};

/** Tenant switcher — shown when NEXT_PUBLIC_MULTI_TENANT_DEMO=true or in dev */
function TenantSwitcher() {
  const { tenant, setTenantId, allTenants } = useTenant();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span>{tenant.brand.logo}</span>
        <span className="max-w-[120px] truncate">{tenant.brand.name}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Switch Airline</p>
          {allTenants.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTenantId(t.id); setOpen(false); window.location.reload(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors"
            >
              <span className="text-base">{t.brand.logo}</span>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900 text-sm">{t.brand.name}</p>
                <p className="text-xs text-gray-400 capitalize">{t.aiPreferences.tone} · {t.features.loyaltyProgram ? 'loyalty' : 'no loyalty'}</p>
              </div>
              {t.id === tenant.id && <Check size={14} className="text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { data: session } = useSession();
  const { tenant } = useTenant();
  const role  = ((session?.user as { role?: string })?.role ?? 'passenger') as UserRole;
  const links = session ? NAV_LINKS[role] : [];
  const showDemo = process.env.NEXT_PUBLIC_MULTI_TENANT_DEMO === 'true' ||
                   process.env.NODE_ENV === 'development';

  return (
    <nav
      className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white"
      style={{ borderBottomColor: `${tenant.brand.primaryColor}22` }}
    >
      {/* Brand */}
      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-xl"
        style={{ color: tenant.brand.primaryColor, fontFamily: tenant.brand.fontFamily }}
      >
        <span>{tenant.brand.logo}</span>
        <span>{tenant.brand.name}</span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-6 text-sm font-medium text-gray-600">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-gray-900 transition-colors">
            {l.label}
          </Link>
        ))}
        {!session && (
          <Link href="/bookings" className="hover:text-gray-900 transition-colors">
            Find Booking
          </Link>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 text-sm">
        {showDemo && <TenantSwitcher />}

        {session ? (
          <>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_COLORS[role]}`}>
              {ROLE_LABELS[role]}
            </span>
            <span className="text-gray-500">
              {(session.user as { name?: string; email?: string }).name ??
               (session.user as { email?: string }).email}
            </span>
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
            <Link
              href="/register"
              className="px-3 py-1.5 text-white rounded-lg hover:opacity-90 transition-opacity text-xs font-medium"
              style={{ backgroundColor: tenant.brand.primaryColor }}
            >
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
