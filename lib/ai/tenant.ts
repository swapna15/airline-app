/**
 * Lightweight tenant-id extractor for the GAAS layer.
 *
 * The vector store / RAG retrieval need a stable per-tenant key. For the
 * in-memory backend any string works (and we use the JWT's tenantSlug);
 * for pgvector the tenant_id UUID is enforced by RLS so we'd resolve via
 * shared/tenant.ts. This file gives planner-phases a single function to
 * call regardless of backend.
 */

import { decodeJwt } from 'jose';

const DEFAULT_TENANT = 'default';

/**
 * Best-effort tenant slug extraction from the NextAuth JWT. We never verify
 * the signature here — only consume — because the upstream API Gateway
 * authorizer has already verified for any request that reaches us.
 */
export function tenantFromToken(token: string | null | undefined): string {
  if (!token) return DEFAULT_TENANT;
  try {
    const payload = decodeJwt(token) as { tenantSlug?: string; tenantId?: string };
    return payload.tenantSlug ?? payload.tenantId ?? DEFAULT_TENANT;
  } catch {
    return DEFAULT_TENANT;
  }
}
