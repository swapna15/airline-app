/**
 * Shared HS256 encode/decode for the NextAuth session cookie.
 *
 * NextAuth defaults to A256GCM JWE — which the API Gateway authorizer Lambda
 * (and any consumer using `jsonwebtoken.verify`) cannot read. We override
 * with HS256 signing via `jose` (already pulled in transitively by next-auth).
 *
 * Both `auth.ts` (handler + getServerSession) AND `middleware.ts` (withAuth)
 * must use the same callbacks; otherwise one side encodes HS256 and the
 * other side tries to decode JWE and the user gets logged out.
 */

import { SignJWT, jwtVerify } from 'jose';
import type { JWT } from 'next-auth/jwt';

const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function key(secret: string | Buffer): Uint8Array {
  return new TextEncoder().encode(typeof secret === 'string' ? secret : secret.toString());
}

export const jwtConfig = {
  async encode({
    token,
    secret,
    maxAge,
  }: {
    token?: JWT;
    secret: string | Buffer;
    maxAge?: number;
  }): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + (maxAge ?? DEFAULT_MAX_AGE);
    return new SignJWT({ ...(token ?? {}) })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(key(secret));
  },
  async decode({
    token,
    secret,
  }: {
    token?: string;
    secret: string | Buffer;
  }): Promise<JWT | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
      return payload as JWT;
    } catch {
      return null;
    }
  },
};
