import { NextResponse } from 'next/server';
import { getRun } from '@/lib/planner-orchestrator';

export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const run = getRun(params.runId);
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  return NextResponse.json(run);
}
