import { NextRequest, NextResponse } from 'next/server';
import { findRotationByFlight, hhmmToMin, minToHhmm, type Leg } from '@/lib/fleet';

interface CascadeRequest {
  flight: string;
  delayMin: number;
}

interface CascadedLeg extends Leg {
  originalStd: string;
  originalSta: string;
  newStd: string;
  newSta: string;
  delayMin: number;
  isOriginating: boolean;
}

/**
 * Walk a tail's leg chain forward applying min ground time after each
 * arrival. The delay shrinks each leg if the planned ground time exceeds
 * the minimum (slack absorbs delay), otherwise it fully propagates.
 */
export async function POST(req: NextRequest) {
  const { flight, delayMin } = (await req.json()) as CascadeRequest;
  if (!Number.isFinite(delayMin) || delayMin <= 0) {
    return NextResponse.json({ error: 'delayMin must be a positive number' }, { status: 400 });
  }

  const found = findRotationByFlight(flight);
  if (!found) {
    return NextResponse.json({ error: `flight ${flight} not in any rotation` }, { status: 404 });
  }

  const { rotation, legIndex } = found;
  const minGround = rotation.minGroundMin;

  const cascaded: CascadedLeg[] = [];
  let runningDelay = delayMin;

  for (let i = legIndex; i < rotation.legs.length; i++) {
    const leg = rotation.legs[i];
    const originatingThisLeg = i === legIndex;

    const newStdMin = hhmmToMin(leg.std) + (originatingThisLeg ? runningDelay : 0);
    const newStaMin = hhmmToMin(leg.sta) + runningDelay;

    cascaded.push({
      ...leg,
      originalStd: leg.std,
      originalSta: leg.sta,
      newStd: minToHhmm(newStdMin),
      newSta: minToHhmm(newStaMin),
      delayMin: runningDelay,
      isOriginating: originatingThisLeg,
    });

    // Compute slack into the next leg
    if (i < rotation.legs.length - 1) {
      const next = rotation.legs[i + 1];
      const plannedGround = hhmmToMin(next.std) - hhmmToMin(leg.sta);
      const slack = plannedGround - minGround;
      runningDelay = Math.max(0, runningDelay - Math.max(0, slack));
    }
  }

  const downstreamLegs = cascaded.slice(1);
  const totalPaxAffected = cascaded.reduce((s, l) => s + l.paxLoad, 0);

  return NextResponse.json({
    rotation: { tail: rotation.tail, aircraft: rotation.aircraft, minGroundMin: rotation.minGroundMin },
    inputDelayMin: delayMin,
    legs: cascaded,
    downstreamCount: downstreamLegs.length,
    finalDelayMin: cascaded[cascaded.length - 1].delayMin,
    totalPaxAffected,
    source: 'planner-internal (mock rotations)',
  });
}
