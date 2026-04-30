import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getApiBearer } from '@/lib/api-auth';
import { listRuns, runToCompletion } from '@/lib/planner-orchestrator';
import type { FlightInput } from '@/lib/planner-phases';

// Synchronous orchestration — bumped from 30s so the request stays open long
// enough for the longest phase (brief: AviationWeather + FAA NOTAM + Anthropic).
// Vercel hobby tier caps at 60s; pro/enterprise allow up to 300s.
export const maxDuration = 300;

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
  const authToken  = await getApiBearer(req);

  const body = (await req.json()) as PostBody;
  const flights: FlightInput[] = body.flights ?? (body.flight ? [body.flight] : []);
  if (flights.length === 0) {
    return NextResponse.json({ error: 'flights[] or flight is required' }, { status: 400 });
  }

  // Run all flights in parallel inside this single function invocation. On
  // serverless, in-memory state doesn't persist across invocations, so the
  // client can't poll a separate GET — we return the full final Run objects
  // here and the UI updates once.
  const runs = await Promise.all(
    flights.map((f) => runToCompletion(f, authToken, reviewerId)),
  );

  return NextResponse.json({
    runs: runs.map((r) => ({
      runId: r.id,
      flight: r.flight.flight,
      scheduled: r.flight.scheduled,
      run: r,
    })),
  });
}
