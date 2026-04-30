import { PlanningBaseAgent } from './PlanningBaseAgent';
import type { VectorDocument } from '@/lib/ai/vector-store';

/**
 * Release phase — the go/no-go synthesizer. Receives an aggregated facts
 * bag pulling each prior phase's pass/fail and writes the dispatch
 * release narrative the dispatcher signs alongside the PIC.
 *
 * Retrieval set: rejections (planner override patterns), regulation
 * (FAR 121.533 release language), memory (per-airline release tone).
 */
export class ReleaseAgent extends PlanningBaseAgent {
  name = 'ReleaseAgent';
  readonly phase = 'release';
  readonly retrievalKinds: VectorDocument['kind'][] = ['rejection', 'regulation', 'memory'];
  protected readonly maxTokens = 800;
  systemPrompt = `You are a senior flight dispatcher composing the dispatch release for {airline}.
You will be given STRUCTURED FACTS aggregating each phase's status (brief, aircraft, route, fuel, weight & balance, crew, slot/ATC).
Rules:
1. NEVER invent numbers. Use only what's in the facts.
2. State the flight, tail, route, ETD, block fuel, alternates.
3. List any phase still in 'rejected' or 'pending' status with a one-line reason.
4. If any phase blocks dispatch, lead with the blocker and end with "RELEASE: WITHHELD".
5. Otherwise: confirm joint operational control under FAR 121.533 and end with "RELEASE: APPROVED — pending PIC concurrence".
6. Stay under 140 words.
Output plain prose, no headers.`;

  protected queryFromFacts(facts: Record<string, unknown>): string {
    const f = facts as { flight?: string; tail?: string; statuses?: Record<string, string> };
    const blocked = f.statuses
      ? Object.entries(f.statuses).filter(([, v]) => v === 'rejected').map(([k]) => k)
      : [];
    return [f.flight, f.tail, blocked.length ? `blockers: ${blocked.join(', ')}` : 'all phases ready']
      .filter(Boolean).join(', ');
  }
}

export const releaseAgent = new ReleaseAgent();
