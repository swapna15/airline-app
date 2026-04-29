import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { UserRole } from '@/types/roles';

const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/admin': ['admin'],
  '/coordinator': ['coordinator', 'admin'],
  '/planner': ['flight_planner', 'admin'],
  '/gate': ['gate_manager', 'admin'],
  '/checkin': ['checkin_agent', 'admin'],
  '/my-bookings': ['passenger', 'admin'],
};

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token?.role ?? 'passenger') as UserRole;
    const pathname = req.nextUrl.pathname;

    for (const [prefix, allowed] of Object.entries(ROUTE_ROLES)) {
      if (pathname.startsWith(prefix) && !allowed.includes(role)) {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  },
);

export const config = {
  matcher: [
    '/admin/:path*',
    '/coordinator/:path*',
    '/planner/:path*',
    '/gate/:path*',
    '/checkin/:path*',
    '/my-bookings/:path*',
  ],
};
