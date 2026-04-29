/**
 * Persistent (process-scoped) integration config store.
 *
 * Mirrors the columns of the future `integration_configs` migration so
 * swapping the body for `pg.Pool` queries (phase 5) is mechanical. For now
 * configs live in an HMR-safe `globalThis` Map — the same convention as
 * `planner-store.ts`. Restart-clean.
 *
 * The resolvers in `lib/integrations/<domain>/resolver.ts` read from here
 * before falling back to env vars. So:
 *   - empty store → behaviour identical to phases 1–3 (env-driven)
 *   - admin saves a config row → that domain switches to the saved provider
 *   - admin deletes the row → falls back to env again
 */

import type { ProviderHealthResult } from './types';

export type IntegrationKind = 'fuel_price' | 'mel' | 'crew';

export const ALL_KINDS: IntegrationKind[] = ['fuel_price', 'mel', 'crew'];

export interface IntegrationConfig {
  kind: IntegrationKind;
  provider: string;                   // 'mock' | 'csv' | 'api_*' (per-domain)
  config: Record<string, unknown>;    // provider-specific shape
  enabled: boolean;
  lastHealth?: ProviderHealthResult;
  updatedAt: string;
  updatedBy?: string;
}

interface Store {
  byKind: Map<IntegrationKind, IntegrationConfig>;
}

const STORE: Store =
  ((globalThis as unknown) as { __integrationConfigStore?: Store }).__integrationConfigStore
  ?? { byKind: new Map() };
((globalThis as unknown) as { __integrationConfigStore?: Store }).__integrationConfigStore = STORE;

export function getIntegrationConfig(kind: IntegrationKind): IntegrationConfig | undefined {
  return STORE.byKind.get(kind);
}

export function listIntegrationConfigs(): IntegrationConfig[] {
  return Array.from(STORE.byKind.values()).sort((a, b) => a.kind.localeCompare(b.kind));
}

export function setIntegrationConfig(
  cfg: Omit<IntegrationConfig, 'updatedAt'>,
): IntegrationConfig {
  const next: IntegrationConfig = { ...cfg, updatedAt: new Date().toISOString() };
  STORE.byKind.set(cfg.kind, next);
  return next;
}

export function deleteIntegrationConfig(kind: IntegrationKind): boolean {
  return STORE.byKind.delete(kind);
}

export function setLastHealth(kind: IntegrationKind, health: ProviderHealthResult): void {
  const cur = STORE.byKind.get(kind);
  if (!cur) return;
  STORE.byKind.set(kind, { ...cur, lastHealth: health });
}

/**
 * Stable JSON hash for cache invalidation in the resolvers.
 * Sort keys recursively so semantically-equal configs hash the same regardless
 * of property order in the JSONB.
 */
export function configHash(cfg: IntegrationConfig | { provider: string; config: Record<string, unknown> } | null | undefined): string {
  if (!cfg) return 'env';
  const sorted = stableStringify({ provider: cfg.provider, config: cfg.config });
  // Cheap non-cryptographic hash — only needs collision resistance per-process.
  let h = 0;
  for (let i = 0; i < sorted.length; i++) h = (Math.imul(31, h) + sorted.charCodeAt(i)) | 0;
  return `c_${h}`;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}
