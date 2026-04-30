/**
 * Shared helper for forwarding the NextAuth JWT to the deployed API.
 *
 * The API Gateway authorizer Lambda verifies bearer tokens with
 * `jwt.verify(token, NEXTAUTH_SECRET)` — i.e. it expects the same JWT
 * NextAuth issues for the session cookie. We pull that raw token straight
 * off the request via `getToken({ raw: true })` and forward it.
 *
 * Earlier code read `session.accessToken`, but `auth.ts` never populates
 * that field, so every authed bridge call 401'd in API_URL mode.
 */

import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

const SECRET = process.env.NEXTAUTH_SECRET;

export async function getApiBearer(req: NextRequest | Request): Promise<string | null> {
  if (!SECRET) return null;
  // next-auth's getToken accepts either NextRequest or a `req`-like object;
  // typing is loose so we cast to satisfy both call sites.
  const token = await getToken({
    req: req as unknown as NextRequest,
    secret: SECRET,
    raw: true,
  });
  return typeof token === 'string' && token.length > 0 ? token : null;
}
