import type { FuelPrice, FuelPriceProvider } from './types';
import type { ProviderHealthResult } from '../types';

/**
 * In-repo mock price table. Q1 2026 hub ballparks. Same data as the original
 * `lib/fuelprices.ts` TABLE — moved here so the domain façade can pick a
 * provider rather than hard-code the table.
 */
const TABLE: Record<string, number> = {
  // North America
  KJFK: 3.45, KLAX: 3.55, KORD: 3.40, KATL: 3.35, KDFW: 3.30,
  KSFO: 3.60, KMIA: 3.50, KBOS: 3.55, KSEA: 3.45, KIAH: 3.25,
  KDEN: 3.40, KPHX: 3.45, KEWR: 3.50, KIAD: 3.45, KMSP: 3.40,
  CYYZ: 3.65, CYUL: 3.70, CYVR: 3.60,
  // Europe
  EGLL: 4.10, EGKK: 4.05, EGCC: 4.00, EHAM: 4.00, EDDF: 4.05,
  EDDM: 4.00, LFPG: 4.15, LFPB: 4.20, LIRF: 4.20, LEMD: 4.05,
  LEBL: 4.10, LSZH: 4.30, LOWW: 4.10, EKCH: 4.15, ESSA: 4.20,
  ENGM: 4.25, EFHK: 4.20, EIDW: 4.05, BIKF: 4.30,
  // Middle East
  OMDB: 3.20, OMAA: 3.20, OERK: 3.10, OTHH: 3.15, OOMS: 3.25, OBBI: 3.20,
  // Asia / Pacific
  RJTT: 4.50, RJAA: 4.55, RJBB: 4.45, RKSI: 4.40, ZBAA: 4.20,
  ZSPD: 4.25, ZGGG: 4.20, VHHH: 4.35, RCTP: 4.30, WSSS: 4.30,
  WMKK: 4.10, VTBS: 4.00, VABB: 4.15, VOMM: 4.05, VIDP: 4.20, VOBL: 4.10,
  // Oceania
  YSSY: 4.45, YMML: 4.40, YBBN: 4.40, NZAA: 4.50,
  // South America
  SBGR: 3.95, SAEZ: 4.10, SCEL: 4.05, SKBO: 4.00, SPJC: 4.05,
  // Africa
  HECA: 3.80, FAOR: 4.00, HKJK: 3.90, GMMN: 3.95, DNMM: 4.10,
};

const POSTED_DATE = '2026-04-15T00:00:00Z';

function row(icao: string, usd: number): FuelPrice {
  return {
    icao,
    totalPerUSG: usd,
    currency: 'USD',
    asOf: POSTED_DATE,
    source: 'mock',
  };
}

export class MockFuelPriceProvider implements FuelPriceProvider {
  readonly name = 'mock';

  async getFuelPrice(icao: string): Promise<FuelPrice | undefined> {
    const code = icao.toUpperCase();
    const usd = TABLE[code];
    return usd === undefined ? undefined : row(code, usd);
  }

  async listFuelPrices(): Promise<FuelPrice[]> {
    return Object.entries(TABLE)
      .map(([icao, usd]) => row(icao, usd))
      .sort((a, b) => a.icao.localeCompare(b.icao));
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    return {
      ok: true,
      recordCount: Object.keys(TABLE).length,
      checkedAt: new Date().toISOString(),
    };
  }
}
