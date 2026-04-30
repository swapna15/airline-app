/**
 * Routes a phase id to the per-phase agent, runs it, and returns the
 * narrative + audit metadata. Single entry point for planner-phases so
 * the wiring stays in one place.
 *
 * Falls back to the legacy monolithic PlanningAgent.summarize when the
 * phase has no specialised agent — useful while we migrate phases one
 * at a time without breaking anything.
 */

import { briefAgent }    from './BriefAgent';
import { routeAgent }    from './RouteAgent';
import { fuelAgent }     from './FuelAgent';
import { aircraftAgent } from './AircraftAgent';
import { releaseAgent }  from './ReleaseAgent';
import type { PlanningBaseAgent } from './PlanningBaseAgent';
import type { PlanningContext, AgentResult } from './PlanningBaseAgent';

const REGISTRY: Record<string, PlanningBaseAgent> = {
  brief:    briefAgent,
  route:    routeAgent,
  fuel:     fuelAgent,
  aircraft: aircraftAgent,
  release:  releaseAgent,
};

export interface OrchestratorRequest {
  phase: string;
  facts: Record<string, unknown>;
  context?: PlanningContext;
}

export async function runAgent(req: OrchestratorRequest): Promise<AgentResult | null> {
  const agent = REGISTRY[req.phase];
  if (!agent) return null;
  return agent.run(req.facts, req.context);
}

export function listAgents(): Array<{ phase: string; name: string; retrievalKinds: string[] }> {
  return Object.entries(REGISTRY).map(([phase, agent]) => ({
    phase,
    name: agent.name,
    retrievalKinds: agent.retrievalKinds,
  }));
}
