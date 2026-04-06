import { queryOne } from './db';

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  config: Record<string, unknown>;
}

/** In-memory cache per Lambda execution environment. */
const cache = new Map<string, TenantRow>();

/** Resolve tenant slug → full row (cached). Returns null for unknown slugs. */
export async function resolveTenant(slug: string): Promise<TenantRow | null> {
  if (cache.has(slug)) return cache.get(slug)!;
  const row = await queryOne<TenantRow>(
    'SELECT id, slug, name, config FROM tenants WHERE slug = $1',
    [slug],
  );
  if (row) cache.set(slug, row);
  return row ?? null;
}

/** Convenience: resolve tenant slug → UUID only. */
export async function resolveTenantId(slug: string): Promise<string | null> {
  const t = await resolveTenant(slug);
  return t?.id ?? null;
}
