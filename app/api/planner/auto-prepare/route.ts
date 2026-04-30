import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { startRun, listRuns } from '@/lib/planner-orchestrator';
import type { FlightInput } from '@/lib/planner-phases';

export const maxDuration = 30;

export async function GET() {
  return NextResponse.json({ runs: listRuns().slice(0, 50) });
}

interface PostBody {
  flights?: FlightInput[];
  flight?: FlightInput;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const reviewerId = (session.user as { email?: string }).email ?? 'anonymous';
  const authToken  = (session as { accessToken?: string }).accessToken ?? null;

  const body = (await req.json()) as PostBody;
  const flights: FlightInput[] = body.flights ?? (body.flight ? [body.flight] : []);
  if (flights.length === 0) {
    return NextResponse.json({ error: 'flights[] or flight is required' }, { status: 400 });
  }

  const runs = flights.map((f) => {
    const run = startRun(f, authToken, reviewerId);
    return { runId: run.id, flight: f.flight, scheduled: f.scheduled };
  });
  return NextResponse.json({ runs });
}
