import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { jwtVerify } from 'jose';
import { createHash } from 'crypto';

/**
 * Auth diagnostic — admin-only in spirit but open in dev. Lets us see exactly
 * where 401s come from when NEXTAUTH_SECRET is supposedly synced. Reveals:
 *
 *   - whether the session cookie is even reaching this handler
 *   - the JWT's `alg` header (HS256 vs the legacy A256GCM JWE)
 *   - whether the FRONTEND can verify with its own NEXTAUTH_SECRET
 *   - SHA-256 of NEXTAUTH_SECRET on the FRONTEND (to compare against the
 *     value baked into the deployed Lambda — same hex → same secret)
 *   - what the LAMBDA returns when forwarded the same token (status + body)
 *
 * No secret value is exposed. Only the hash and the JWT payload (which is
 * already in your cookie).
 */

const SECRET  = process.env.NEXTAUTH_SECRET ?? '';
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function decodeJwtSegments(token: string): { header?: unknown; payload?: unknown } {
  const parts = token.split('.');
  if (parts.length < 2) return {};
  const dec = (s: string) => {
    try { return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
    catch { return undefined; }
  };
  return { header: dec(parts[0]), payload: dec(parts[1]) };
}

export async function GET(req: NextRequest) {
  const result: Record<string, unknown> = {
    nextauth_secret_present: SECRET.length > 0,
    nextauth_secret_sha256:  SECRET ? sha256Hex(SECRET) : null,
    nextauth_secret_length:  SECRET.length,
    api_url: API_URL ?? null,
  };

  // Raw cookie token (this is the same string getApiBearer forwards to the Lambda).
  const rawToken = await getToken({
    req: req as unknown as NextRequest,
    secret: SECRET,
    raw: true,
  });

  result.cookie_present = !!rawToken;
  if (typeof rawToken === 'string' && rawToken.length > 0) {
    const { header, payload } = decodeJwtSegments(rawToken);
    result.jwt_header  = header;
    result.jwt_payload = payload;
    result.jwt_first_segment_preview = rawToken.slice(0, 24) + '…';

    // Try to verify locally with the same secret the cookie was signed by.
    try {
      const key = new TextEncoder().encode(SECRET);
      const { payload: verified } = await jwtVerify(rawToken, key, { algorithms: ['HS256'] });
      result.frontend_local_verify = { ok: true, payload: verified };
    } catch (err) {
      result.frontend_local_verify = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Forward to the deployed Lambda (any authed endpoint) and report status.
    if (API_URL) {
      try {
        const res = await fetch(`${API_URL}/planning/eod-stats`, {
          headers: { Authorization: `Bearer ${rawToken}` },
        });
        const txt = await res.text();
        result.lambda_response = {
          status: res.status,
          body: txt.slice(0, 400),  // truncate
        };
      } catch (err) {
        result.lambda_response = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  return NextResponse.json(result, { status: 200 });
}
