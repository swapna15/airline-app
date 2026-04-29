/**
 * Tiny TTL cache for integration providers.
 *
 * Attached to globalThis so it survives Next.js HMR — same convention as
 * `lib/planner-store.ts`. Per-instance state isolation comes from the cache
 * key, which providers should namespace (e.g. `fuelprices:s3://bucket/key`).
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

interface Store {
  entries: Map<string, Entry<unknown>>;
}

const STORE: Store =
  ((globalThis as unknown) as { __integrationCache?: Store }).__integrationCache
  ?? { entries: new Map() };
((globalThis as unknown) as { __integrationCache?: Store }).__integrationCache = STORE;

/**
 * Read-through TTL cache. Concurrent calls for the same key share a single
 * in-flight promise so we don't refetch on burst.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function ttlCached<T>(
  key: string,
  ttlSec: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = STORE.entries.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await loader();
      STORE.entries.set(key, { value, expiresAt: now + ttlSec * 1000 });
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function invalidate(key: string): void {
  STORE.entries.delete(key);
}
