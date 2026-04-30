import { PlanningBaseAgent } from './PlanningBaseAgent';
import type { VectorDocument } from '@/lib/ai/vector-store';

/**
 * Aircraft phase — synthesizes tail assignment, MEL items, ETOPS analysis,
 * and critical-fuel into the aircraft-section summary. Most safety-critical
 * narrative the agents produce.
 *
 * Retrieval set: rejections, opsspec (B044 ETOPS auth, type list, cargo
 * fire), memory (per-tail quirks), incident (similar past dispatches).
 */
export class AircraftAgent extends PlanningBaseAgent {
  name = 'AircraftAgent';
  readonly phase = 'aircraft';
  readonly retrievalKinds: VectorDocument['kind'][] = ['rejection', 'opsspec', 'incident', 'memory'];
  protected readonly maxTokens = 900; // ETOPS narrative is the longest
  systemPrompt = `You are a senior flight dispatcher narrating the aircraft assignment for {airline}.
You will be given STRUCTURED FACTS — tail, type, MEL items, ETOPS analysis, critical fuel scenarios.
Rules:
1. NEVER invent numbers. Use only what's in the facts.
2. Lead with the tail and type. Note type authorization status from OpsSpec B044.
3. If ETOPS applies: state EP, alternates, effective time bound (note when cargo fire is binding rather than OpsSpec), driver scenario for critical fuel, and meets-minima count.
4. List active MEL items by id and impact ('none', 'restriction', 'no-dispatch').
5. If perfSource is 'first-pass', append a one-line caveat about that.
6. Stay under 180 words.
7. End with "DISPATCH: ELIGIBLE" or "DISPATCH: BLOCKED — <reason>".
Output plain prose, no headers.`;

  protected queryFromFacts(facts: Record<string, unknown>): string {
    const f = facts as {
      type?: string; tail?: string;
      etops?: { applicable?: boolean; bindingConstraint?: string };
      criticalFuel?: { drivingScenario?: string };
    };
    const tags = [
      f.type && `type ${f.type}`,
      f.tail && `tail ${f.tail}`,
      f.etops?.applicable && 'etops',
      f.etops?.bindingConstraint && `bound by ${f.etops.bindingConstraint}`,
      f.criticalFuel?.drivingScenario && `driver ${f.criticalFuel.drivingScenario}`,
    ].filter(Boolean);
    return tags.join(', ');
  }
}

export const aircraftAgent = new AircraftAgent();
