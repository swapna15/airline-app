import { NextRequest, NextResponse } from 'next/server';
import { lookupAirport } from '@/lib/icao';
import { fuelEstimate } from '@/lib/perf';
import { getFuelPrice } from '@/lib/fuelprices';

/**
 * Tankering economics.
 *
 *   savings = (priceDest − priceOrig) × tankerUSG
 *   penalty = priceOrig × extraBurnUSG       (extra burn is uplifted at origin)
 *   net     = savings − penalty
 *
 * Burn-to-carry: industry rule of thumb is ~3-4% of carried weight burned per
 * cruise hour. Using 3.5% as midpoint. Real airlines tune this per type from
 * their own ACARS data.
 */

const KG_PER_USG = 3.04;            // jet-A density 0.81 kg/L → 3.04 kg/USG
const BURN_TO_CARRY_PER_HOUR = 0.035;

interface TankeringRequest {
  flight: string;
  origin: string;
  destination: string;
  aircraft: string;
  /** Extra fuel kg above dispatch minimum to consider tankering. */
  tankerKg?: number;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TankeringRequest;
  const origin = lookupAirport(body.origin);
  const dest   = lookupAirport(body.destination);
  if (!origin || !dest) {
    return NextResponse.json({ error: 'unknown origin or destination' }, { status: 400 });
  }

  const [originPrice, destPrice] = await Promise.all([
    getFuelPrice(origin.icao),
    getFuelPrice(dest.icao),
  ]);
  if (!originPrice || !destPrice) {
    const missing = !originPrice ? origin.icao : dest.icao;
    return NextResponse.json({
      error: `no fuel price for ${missing}`,
      hint: 'configured fuel-price feed has no record for this station; check the FMS export or extend the mock table',
    }, { status: 400 });
  }

  const fuel = fuelEstimate(origin, dest, body.aircraft);
  const tripHours = fuel.blockTimeMin / 60;

  // Default: tanker enough to cover the next leg's trip fuel, i.e. skip a refuel
  // at destination for a like-for-like return. Planner can override.
  const tankerKg  = body.tankerKg ?? fuel.trip;
  const tankerUSG = tankerKg / KG_PER_USG;

  const carryPenaltyKg  = tankerKg * BURN_TO_CARRY_PER_HOUR * tripHours;
  const carryPenaltyUSG = carryPenaltyKg / KG_PER_USG;

  const grossSavingsUsd = (destPrice.totalPerUSG - originPrice.totalPerUSG) * tankerUSG;
  const carryCostUsd    = originPrice.totalPerUSG * carryPenaltyUSG;
  const netSavingsUsd   = grossSavingsUsd - carryCostUsd;

  const recommend = netSavingsUsd > 0;

  // Risk flags — qualitative reasons to tanker less even when math says yes.
  const risks: string[] = [];

  // MTOW headroom — fuel.block already includes contingency/alternate/reserve.
  // Tankered fuel loads on top, eating into payload room.
  const projectedTotalKg = fuel.block + tankerKg;
  if (projectedTotalKg > fuel.mtowKg * 0.95) {
    risks.push(
      `projected ramp fuel ${Math.round(projectedTotalKg).toLocaleString()} kg approaches MTOW ` +
      `${fuel.mtowKg.toLocaleString()} kg — verify with W&B before dispatch`,
    );
  }
  if (Math.abs(destPrice.totalPerUSG - originPrice.totalPerUSG) < 0.10) {
    risks.push('price differential under $0.10/USG — savings sensitive to small uplift rate changes');
  }
  if (recommend && netSavingsUsd < 100) {
    risks.push(`thin margin ($${netSavingsUsd.toFixed(0)}) — operational complexity may not be worth it`);
  }
  if (!recommend && originPrice.totalPerUSG > destPrice.totalPerUSG) {
    risks.push('origin fuel is more expensive than destination — tankering would lose money on every gallon');
  }

  // Stale-price warning — feed-agnostic, fires when either record's asOf is > 24h old.
  const ageHours = (asOf: string) => (Date.now() - new Date(asOf).getTime()) / 3_600_000;
  const oldestAgeH = Math.max(ageHours(originPrice.asOf), ageHours(destPrice.asOf));
  if (oldestAgeH > 24) {
    risks.push(`fuel price snapshot is ${oldestAgeH.toFixed(0)}h old — confirm against today's uplift rate`);
  }

  return NextResponse.json({
    flight: body.flight,
    origin: {
      icao: origin.icao, iata: origin.iata,
      priceUsdPerUSG: originPrice.totalPerUSG,
      currency:   originPrice.currency,
      components: originPrice.components,
      supplier:   originPrice.supplier,
      contractRef: originPrice.contractRef,
      asOf:       originPrice.asOf,
    },
    destination: {
      icao: dest.icao, iata: dest.iata,
      priceUsdPerUSG: destPrice.totalPerUSG,
      currency:   destPrice.currency,
      components: destPrice.components,
      supplier:   destPrice.supplier,
      contractRef: destPrice.contractRef,
      asOf:       destPrice.asOf,
    },
    tripHours: Math.round(tripHours * 100) / 100,
    tripFuelKg: fuel.trip,
    blockFuelKg: fuel.block,
    tankerKg: Math.round(tankerKg),
    tankerUSG: Math.round(tankerUSG),
    carryPenaltyKg:  Math.round(carryPenaltyKg),
    carryPenaltyUsd: Math.round(carryCostUsd * 100) / 100,
    grossSavingsUsd: Math.round(grossSavingsUsd * 100) / 100,
    netSavingsUsd:   Math.round(netSavingsUsd * 100) / 100,
    recommend,
    risks,
    source: `fuelprices:${originPrice.source} (asOf ${originPrice.asOf}) + lib/perf burn-to-carry ${(BURN_TO_CARRY_PER_HOUR * 100).toFixed(1)}%/hr`,
  });
}
