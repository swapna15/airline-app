import { NextRequest, NextResponse } from 'next/server';
import type { AgentIntent } from '@/core/orchestrator';

export async function POST(req: NextRequest) {
  const { agent, payload, context } = await req.json() as {
    agent: AgentIntent;
    payload: string;
    context?: Record<string, unknown>;
  };

  if (!agent || !payload) {
    return NextResponse.json({ error: 'agent and payload are required' }, { status: 400 });
  }

  // Import orchestrator server-side only
  const { orchestrator } = await import('@/core/orchestrator');
  const result = await orchestrator.route(agent, payload, context);
  return NextResponse.json({ result });
}
