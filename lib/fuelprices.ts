/**
 * Public façade for jet-fuel price lookups.
 *
 * Behind the scenes a provider chosen by env var (mock by default; CSV/S3
 * when configured) actually serves the data. Callers don't see the provider
 * — they just call `getFuelPrice(icao)` / `listFuelPrices()`.
 *
 * Switching to a real enterprise feed:
 *   FUEL_PRICE_PROVIDER=csv FUEL_PRICE_CSV_URI=s3://airline-fms/prices.csv
 *
 * See `lib/integrations/fuelprices/resolver.ts` for the full env contract.
 */

import { getFuelPriceProvider } from './integrations/fuelprices/resolver';

export type { FuelPrice } from './integrations/fuelprices/types';
export { getFuelPriceProvider, resetFuelPriceProvider } from './integrations/fuelprices/resolver';

import type { FuelPrice } from './integrations/fuelprices/types';
import type { ProviderHealthResult } from './integrations/types';

export async function getFuelPrice(icao: string): Promise<FuelPrice | undefined> {
  return getFuelPriceProvider().getFuelPrice(icao);
}

export async function listFuelPrices(): Promise<FuelPrice[]> {
  return getFuelPriceProvider().listFuelPrices();
}

export async function fuelPriceProviderHealth(): Promise<ProviderHealthResult> {
  return getFuelPriceProvider().healthCheck();
}
