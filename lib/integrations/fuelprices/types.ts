import type { Provider } from '../types';

/**
 * Per-station jet-fuel price record.
 *
 * Shape mirrors what an airline's Fuel Management System (FMS) typically
 * exports: a base benchmark (e.g. Platts USGC) plus contract differential,
 * into-plane fee, and tax — totalled per US gallon. Mock and external feeds
 * (IATA, Platts) may omit `components` and `supplier`/`contractRef`.
 */
export interface FuelPrice {
  icao: string;
  /** USD-equivalent total per US gallon. Always present. */
  totalPerUSG: number;
  /** Currency for any local-denominated fields. ISO 4217. */
  currency: string;
  /** Cost decomposition; absent on mock / market-only feeds. */
  components?: {
    base: number;
    differential: number;
    intoPlane: number;
    tax: number;
  };
  /** Total in local currency (e.g. GBP at LHR), if the feed provides it. */
  totalLocal?: number;
  /** Counterparty name (WFS, Air BP, Shell Aviation, …). */
  supplier?: string;
  /** Contract reference for audit (e.g. `WFS-2026-Q2`). */
  contractRef?: string;
  /** ISO timestamp the price was published. */
  asOf: string;
  /** ISO timestamp after which the price should not be used. */
  validUntil?: string;
  /** Provenance — which provider produced this record. */
  source: 'mock' | 'csv' | 's3_csv' | 'api_fms' | 'api_supplier' | 'api_iata' | 'api_platts';
}

export interface FuelPriceProvider extends Provider {
  getFuelPrice(icao: string): Promise<FuelPrice | undefined>;
  listFuelPrices(): Promise<FuelPrice[]>;
}
