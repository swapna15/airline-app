import { NextRequest, NextResponse } from 'next/server';
import type { AgentIntent } from '@/core/orchestrator';
import { TenantRegistry } from '@/core/tenant/registry';
import type { UserPreferences } from '@/types/tenant';

export async function POST(req: NextRequest) {
  const { agent, payload, context } = await req.json() as {
    agent: AgentIntent;
    payload: string;
    context?: Record<string, unknown> & {
      tenantId?: string;
      userPreferences?: UserPreferences;
    };
  };

  if (!agent || !payload) {
    return NextResponse.json({ error: 'agent and payload are required' }, { status: 400 });
  }

  // Resolve tenant from context (falls back to registry default)
  const tenantId = context?.tenantId as string | undefined;
  const tenant   = tenantId ? (TenantRegistry.get(tenantId) ?? TenantRegistry.getDefault()) : TenantRegistry.getDefault();

  const enrichedContext = {
    ...context,
    tenant,
    airlineName: tenant.brand.name,
  };

  const { orchestrator } = await import('@/core/orchestrator');
  const result = await orchestrator.route(agent, payload, enrichedContext);
  return NextResponse.json({ result });
}
