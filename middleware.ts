import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { jwtConfig } from '@/lib/auth-jwt';
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
    // Pass the same HS256 encode/decode used in auth.ts so withAuth's
    // internal getToken() can read the cookie. Without this, withAuth
    // falls back to the default JWE decoder, sees null, and redirects
    // the user to /login on every protected route.
    jwt: jwtConfig,
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
