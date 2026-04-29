import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { ROTATIONS } from '@/lib/fleet';
import { getPlan, listReviews, type PhaseId } from '@/lib/planner-store';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const PHASES: PhaseId[] = ['brief', 'aircraft', 'route', 'fuel', 'weight_balance', 'crew', 'slot_atc', 'release'];

interface PlanCounts {
  plans: { released: number; inProgress: number; untouched: number };
  activity: { totalApprovals: number; totalRejections: number; rejByPhase: Record<string, number> };
  source: string;
}

async function planCountsFromLambda(): Promise<PlanCounts | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const token = (session as { accessToken?: string }).accessToken;
  if (!token) return null;
  const res = await fetch(`${API_URL}/planning/eod-stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json() as Omit<PlanCounts, 'source'>;
  return { ...data, source: 'planning-lambda (postgres)' };
}

function planCountsFromStore(): PlanCounts {
  // Status by flight number — flight numbers in the planner UI are also the
  // flightId used for plan keying (1-based ID for the mock 4 + the rest unmapped).
  const planById: Record<string, ReturnType<typeof getPlan>> = {};
  for (let i = 1; i <= 4; i++) {
    const plan = getPlan(String(i));
    if (plan) planById[String(i)] = plan;
  }

  const released   = Object.values(planById).filter((p) => p?.status === 'released').length;
  const inProgress = Object.values(planById).filter((p) => p && p.status !== 'released' &&
                       Object.values(p.phases).some((ph) => ph.status !== 'pending')).length;
  const untouched  = 4 - released - inProgress;

  const rejByPhase: Record<string, number> = {};
  for (const phase of PHASES) rejByPhase[phase] = 0;
  for (const id of Object.keys(planById)) {
    for (const r of listReviews(id)) {
      if (r.action === 'reject') rejByPhase[r.phase] = (rejByPhase[r.phase] ?? 0) + 1;
    }
  }

  const totalRejections = Object.values(rejByPhase).reduce((a, b) => a + b, 0);
  const totalApprovals = Object.keys(planById).reduce(
    (sum, id) => sum + listReviews(id).filter((r) => r.action === 'approve').length,
    0,
  );

  return {
    plans: { released, inProgress, untouched },
    activity: { totalApprovals, totalRejections, rejByPhase },
    source: 'planner-store (in-memory)',
  };
}

export async function GET() {
  // Static rotation/airport data is always local — the Lambda only owns
  // plan/review aggregates from Postgres.
  const allLegs = ROTATIONS.flatMap((r) =>
    r.legs.map((l) => ({ flight: l.flight, origin: l.origin, destination: l.destination, std: l.std, paxLoad: l.paxLoad })),
  );
  const totalPax = allLegs.reduce((s, l) => s + l.paxLoad, 0);

  const counts = (API_URL && (await planCountsFromLambda())) || planCountsFromStore();

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    fleet: {
      tails: ROTATIONS.length,
      legs: allLegs.length,
      paxPlanned: totalPax,
    },
    plans: counts.plans,
    activity: counts.activity,
    flights: allLegs,
    source: counts.source,
  });
}
