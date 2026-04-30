import { PlanningBaseAgent } from './PlanningBaseAgent';
import type { VectorDocument } from '@/lib/ai/vector-store';

/**
 * Route phase — narrates the filed route, distance, block time, cost-index
 * choice, and PBN authorization compliance into a one-paragraph summary.
 *
 * Retrieval set: rejections (planner objections to past route choices),
 * opsspec (per-tenant routing preferences like cost index reasoning),
 * regulation (PBN/RNP rule excerpts).
 */
export class RouteAgent extends PlanningBaseAgent {
  name = 'RouteAgent';
  readonly phase = 'route';
  readonly retrievalKinds: VectorDocument['kind'][] = ['rejection', 'opsspec', 'regulation', 'memory'];
  systemPrompt = `You are a senior flight planner narrating the route choice for {airline}.
You will be given STRUCTURED FACTS — distance, bearing, block time, cost index, PBN requirements + authorization.
Rules:
1. NEVER invent numbers. Re-state the facts only.
2. State the great-circle distance, block time, cost index used, and the source ('byType' override or default).
3. State whether PBN is authorized. If pbnOk=false, lead with that and name the missing spec(s).
4. Stay under 80 words.
5. End with "STATUS: routable" or "STATUS: blocked — <reason>".
Output plain prose, no headers.`;

  protected queryFromFacts(facts: Record<string, unknown>): string {
    const f = facts as {
      filedRoute?: string; distanceNM?: number; pbnRequired?: { rnav: string[]; rnp: string[] };
    };
    const tags = [
      f.filedRoute,
      f.distanceNM && `${f.distanceNM}nm`,
      f.pbnRequired && [...f.pbnRequired.rnav, ...f.pbnRequired.rnp].join(' '),
    ].filter(Boolean);
    return tags.join(', ');
  }
}

export const routeAgent = new RouteAgent();
