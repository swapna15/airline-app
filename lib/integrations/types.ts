/**
 * Generic provider primitives for pluggable enterprise integrations.
 *
 * Each domain (fuel prices, MEL, crew, fleet) ships a `XxxProvider` interface
 * that extends `Provider<T>`, plus implementations for each transport (mock,
 * CSV/S3, REST API + JWT). The resolver picks one based on per-tenant config.
 *
 * Phase 1: provider selection comes from env vars. Phase 2: from the
 * `integration_configs` table populated by the admin UI.
 */

export interface ProviderHealthResult {
  ok: boolean;
  /** Round-trip time of the health probe, milliseconds. */
  latencyMs?: number;
  /** Number of records returned by the health probe (where applicable). */
  recordCount?: number;
  /** ISO timestamp when the probe ran. */
  checkedAt: string;
  /** Error message when `ok` is false. */
  error?: string;
}

export interface Provider {
  /** Stable name for telemetry / source-of-record reporting. */
  readonly name: string;
  /** Active probe — returns ok=false rather than throwing. */
  healthCheck(): Promise<ProviderHealthResult>;
  /** Optional explicit refresh hook for cache-backed providers. */
  refresh?(): Promise<void>;
}
