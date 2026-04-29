import type { Provider } from '../types';

/**
 * Per-tail deferred MEL item.
 *
 * Required fields are the minimum needed to assess dispatch legality:
 * `tail`, `melId`, `deferredAt`. Optional fields are populated by enterprise
 * MIS exports (AMOS, TRAX, FlyDocs, Ramco) — the assessor and the UI
 * gracefully degrade when a feed omits them.
 */
export interface DeferredItem {
  tail: string;
  melId: string;
  /** ISO date the item was opened. */
  deferredAt: string;
  /** Days since `deferredAt`, computed by the provider against "today". */
  daysDeferred: number;

  // ── Optional enterprise fields (FMS/MIS exports populate these) ────────────
  /** Free-text technician note. */
  description?: string;
  /** ISO timestamp the deferral expires (typically `deferredAt + categoryDays`). */
  dueAt?: string;
  /** Airframe-time at the moment the item was opened — used for AT-style limits. */
  airframeHoursAtOpen?: number;
  /** Airframe-cycles at the moment the item was opened — used for AC-style limits. */
  airframeCyclesAtOpen?: number;
  /** True if a replacement part is on order (visibility-only, no dispatch effect). */
  partsOnOrder?: boolean;
  /** True if a cockpit/cabin placard has been installed per CDL/MEL procedure. */
  placardInstalled?: boolean;
  /** Engineer / CAMO ID who released the deferral. */
  releasedBy?: string;
  /** Provenance — which provider produced this record. */
  source?: 'mock' | 'csv' | 's3_csv' | 'api_amos' | 'api_trax' | 'api_camo';
}

export interface MelProvider extends Provider {
  getDeferredItems(tail: string): Promise<DeferredItem[]>;
  /** Used for admin / cross-tail dashboards. Cheap when the provider already
   *  has all rows in cache, never a per-tail fan-out. */
  listAllDeferrals(): Promise<DeferredItem[]>;
}
