import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getApiBearer } from '@/lib/api-auth';
import { listRuns, runToCompletion } from '@/lib/planner-orchestrator';
import { flightSchema, type OwnFlight } from '@shared/schema/flight';
import { z } from 'zod';

// Single function invocation streams live NDJSON; bumped from 30s because the
// brief phase can take 10–25s (AviationWeather + FAA NOTAM + Anthropic).
// Vercel hobby tier caps at 60s; pro/enterprise allow up to 300s.
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ runs: listRuns().slice(0, 50) });
}

// Validate the request body against the canonical schema. We restrict
// auto-prepare to source: 'own' — only operational flights can be planned.
const ownFlightSchema = flightSchema.refine(
  (f): f is OwnFlight => f.source === 'own',
  { message: 'auto-prepare only accepts source: "own" flights' },
);
const postBodySchema = z.object({
  flight:  ownFlightSchema.optional(),
  flights: z.array(ownFlightSchema).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const reviewerId = (session.user as { email?: string }).email ?? 'anonymous';
  const authToken  = await getApiBearer(req);

  const raw = await req.json();
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }
  const flights: OwnFlight[] = parsed.data.flights ?? (parsed.data.flight ? [parsed.data.flight] : []);
  if (flights.length === 0) {
    return NextResponse.json({ error: 'flights[] or flight is required' }, { status: 400 });
  }

  // Stream NDJSON: one JSON line per phase transition. The client reads the
  // body as it arrives and updates the UI live. Everything happens inside
  // ONE function invocation, so the orchestrator's in-memory state is fine
  // (we don't need a cross-instance store like KV / Postgres).
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (line: object) => {
        controller.enqueue(enc.encode(JSON.stringify(line) + '\n'));
      };

      try {
        await Promise.all(
          flights.map((f) =>
            runToCompletion(f, authToken, reviewerId, (run) => {
              // Emit the externalId so clients can dispatch this update back
              // to the right row by canonical identity, not display strings.
              emit({
                type: 'update',
                runId: run.id,
                externalId: f.externalId,
                carrier: f.carrier,
                flightNumber: f.flightNumber,
                scheduledDeparture: f.scheduledDeparture,
                run,
              });
            }),
          ),
        );
      } catch (err) {
        emit({ type: 'error', error: err instanceof Error ? err.message : String(err) });
      } finally {
        emit({ type: 'done' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type':       'application/x-ndjson; charset=utf-8',
      'Cache-Control':      'no-cache, no-transform',
      'X-Accel-Buffering':  'no',  // hint to disable proxy buffering
    },
  });
}
