import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';
import { runPhase, VALID_PHASES, type PhaseId, type FlightInput } from '@/lib/planner-phases';

export async function POST(
  req: NextRequest,
  { params }: { params: { phase: string } },
) {
  if (!VALID_PHASES.has(params.phase)) {
    return NextResponse.json({ error: `unknown phase: ${params.phase}` }, { status: 400 });
  }

  const authToken = await getApiBearer(req);

  const body = await req.json() as { flight?: FlightInput };
  if (!body.flight) {
    return NextResponse.json({ error: 'flight is required' }, { status: 400 });
  }

  try {
    const result = await runPhase(params.phase as PhaseId, body.flight, authToken);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'phase generation failed', detail: (err as Error).message },
      { status: 502 },
    );
  }
}
