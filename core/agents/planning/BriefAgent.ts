import { PlanningBaseAgent } from './PlanningBaseAgent';
import type { VectorDocument } from '@/lib/ai/vector-store';

/**
 * Brief phase — turns raw METAR/TAF/SIGMET/NOTAM facts into the
 * dispatcher's pre-flight briefing string.
 *
 * Retrieval set: rejections (avoid past mistakes), SOPs (operator-specific
 * weather thresholds), incidents (similar conditions in history).
 */
export class BriefAgent extends PlanningBaseAgent {
  name = 'BriefAgent';
  readonly phase = 'brief';
  readonly retrievalKinds: VectorDocument['kind'][] = ['rejection', 'sop', 'incident', 'memory'];
  systemPrompt = `You are a senior flight dispatcher writing a concise pre-flight briefing for {airline}.
You will be given STRUCTURED FACTS — METARs, TAFs, SIGMETs, NOTAMs.
Rules:
1. NEVER invent numbers. If a number isn't in the facts, omit it.
2. Lead with operational impact: WX category at origin/destination, runway/taxiway closures, route hazards.
3. Stay under 120 words. No bullets longer than one line.
4. If a SIGMET or NOTAM is materially relevant, mention it. Otherwise summarise as "no significant".
5. End with a single line "RECOMMEND: <go | hold pending X | divert planning>".
Output plain prose, no headers.`;

  protected queryFromFacts(facts: Record<string, unknown>): string {
    // Bias retrieval toward weather/airport hazards rather than route geometry.
    const f = facts as { metars?: unknown[]; sigmets?: unknown[]; notams?: unknown[]; origin?: string; destination?: string };
    const tags = [
      f.origin && `origin ${f.origin}`,
      f.destination && `destination ${f.destination}`,
      Array.isArray(f.sigmets) && f.sigmets.length && `${f.sigmets.length} SIGMETs`,
      Array.isArray(f.notams) && f.notams.length && `${f.notams.length} NOTAMs`,
    ].filter(Boolean);
    return tags.join(', ');
  }
}

export const briefAgent = new BriefAgent();
