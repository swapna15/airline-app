/**
 * Per-tenant Operations Specifications loader.
 *
 * Schema lives in the deployed Postgres (migration 010). When
 * NEXT_PUBLIC_API_URL is set, this fetches via the integrations Lambda's
 * /admin/ops-specs endpoint with the caller's bearer JWT. Without API_URL
 * (local dev), returns the same defaults the SQL seed uses so the planner
 * keeps behaving identically.
 *
 * Concrete consumers today:
 *   - lib/planner-phases.ts → fuel phase reads contingencyPct / alternateMinutes /
 *     finalReserveMinutes / taxiKg from fuelPolicy
 *
 * Future consumers (already plumbed into the schema):
 *   - alternate selection rules (alternate_minima)
 *   - ETOPS approval check at release (etops_approval)
 *   - PBN authorization filter on filed routes (pbn_authorizations)
 *   - cost-index lookup per type (cost_index)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export interface FuelPolicy {
  contingencyPct: number;          // % of trip fuel
  alternateMinutes: number;        // minutes at cruise burn
  finalReserveMinutes: number;     // 30 min EU / 45 min FAA domestic
  taxiKg: number;                  // flat
  captainsFuelMinutes: number;     // discretionary
  tankeringEnabled: boolean;
}

export interface AlternateMinima {
  destinationCeilingFt: number;
  destinationVisSm: number;
  alternateCeilingFt: number;
  alternateVisSm: number;
}

export interface EtopsApproval {
  maxMinutes: number;              // 0 / 60 / 120 / 138 / 180 / 207 / 240 / 330 / 370
  authorizedTypes: string[];       // ICAO type codes
}

export interface CostIndex {
  default: number;
  byType: Record<string, number>;
}

export interface OpsSpecs {
  fuelPolicy:        FuelPolicy;
  alternateMinima:   AlternateMinima;
  etopsApproval:     EtopsApproval;
  pbnAuthorizations: { rnavLevels: string[]; rnpLevels: string[] };
  costIndex:         CostIndex;
  authorizedAirports: string[];
  notes:             string | null;
  updatedAt:         string | null;
}

// Match the seed in migration 010 so local-dev behavior == deployed default.
export const DEFAULT_OPS_SPECS: OpsSpecs = {
  fuelPolicy: {
    contingencyPct: 5,
    alternateMinutes: 45,
    finalReserveMinutes: 30,
    taxiKg: 600,
    captainsFuelMinutes: 0,
    tankeringEnabled: true,
  },
  alternateMinima: {
    destinationCeilingFt: 2000,
    destinationVisSm: 3,
    alternateCeilingFt: 600,
    alternateVisSm: 2,
  },
  etopsApproval: {
    maxMinutes: 180,
    authorizedTypes: ['B77W', 'B789', 'A333', 'A359'],
  },
  pbnAuthorizations: {
    rnavLevels: ['RNAV-1', 'RNAV-2', 'RNAV-5'],
    rnpLevels:  ['RNP-2', 'RNP-AR'],
  },
  costIndex: { default: 30, byType: {} },
  authorizedAirports: [],
  notes: null,
  updatedAt: null,
};

/**
 * Fetches the tenant's OpsSpecs from the deployed integrations Lambda.
 * Falls back to DEFAULT_OPS_SPECS on any failure (no API_URL, missing
 * token, network error, schema drift) so the planner never blocks on
 * the config plane.
 */
export async function loadOpsSpecs(authToken: string | null): Promise<OpsSpecs> {
  if (!API_URL || !authToken) return DEFAULT_OPS_SPECS;
  try {
    const res = await fetch(`${API_URL}/admin/ops-specs`, {
      headers: { Authorization: `Bearer ${authToken}` },
      // Without this, Next.js caches the response per-URL forever in Route
      // Handlers — saving a new authorized list in /admin/ops-specs would
      // never take effect for the divert route until the server restarted.
      cache: 'no-store',
    });
    if (!res.ok) return DEFAULT_OPS_SPECS;
    const raw = await res.json() as Partial<OpsSpecs>;
    return {
      ...DEFAULT_OPS_SPECS,
      ...raw,
      fuelPolicy:        { ...DEFAULT_OPS_SPECS.fuelPolicy,        ...(raw.fuelPolicy ?? {}) },
      alternateMinima:   { ...DEFAULT_OPS_SPECS.alternateMinima,   ...(raw.alternateMinima ?? {}) },
      etopsApproval:     { ...DEFAULT_OPS_SPECS.etopsApproval,     ...(raw.etopsApproval ?? {}) },
      pbnAuthorizations: { ...DEFAULT_OPS_SPECS.pbnAuthorizations, ...(raw.pbnAuthorizations ?? {}) },
      costIndex:         { ...DEFAULT_OPS_SPECS.costIndex,         ...(raw.costIndex ?? {}) },
    };
  } catch {
    return DEFAULT_OPS_SPECS;
  }
}
