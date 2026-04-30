import { PlanningBaseAgent } from './PlanningBaseAgent';
import type { VectorDocument } from '@/lib/ai/vector-store';

/**
 * Fuel phase — narrates trip/contingency/alternate/reserve/taxi/captains
 * fuel choices into a single dispatch summary, including any tankering
 * recommendation when fuel-price feeds are wired.
 *
 * Retrieval set: rejections (e.g., "captain wants extra contingency on
 * winter NAT"), opsspec (operator's fuel policy thresholds), memory
 * (accumulated fuel-strategy preferences).
 */
export class FuelAgent extends PlanningBaseAgent {
  name = 'FuelAgent';
  readonly phase = 'fuel';
  readonly retrievalKinds: VectorDocument['kind'][] = ['rejection', 'opsspec', 'memory'];
  systemPrompt = `You are a senior flight dispatcher writing the fuel-plan summary for {airline}.
You will be given STRUCTURED FACTS — trip, contingency, alternate, reserve, taxi, captains-fuel, block, MTOW.
Rules:
1. NEVER invent numbers. Use only what's in the facts.
2. State block fuel and how it decomposes (trip + contingency + alternate + reserve + taxi + captains).
3. State the contingency %, alternate minutes, reserve minutes used (from policy).
4. Compare block fuel to MTOW. If margin < 5,000 kg, flag it.
5. If tankerRecommended is set, state extra kg and projected saving.
6. Stay under 100 words.
7. End with "STATUS: fueled" or "STATUS: over MTOW — <delta> kg".
Output plain prose, no headers.`;

  protected queryFromFacts(facts: Record<string, unknown>): string {
    const f = facts as { block?: number; mtowKg?: number; tankerRecommended?: boolean };
    const tags = [
      f.block && `block ${f.block}kg`,
      f.mtowKg && `MTOW ${f.mtowKg}kg`,
      f.tankerRecommended && 'tankering recommended',
    ].filter(Boolean);
    return tags.join(', ');
  }
}

export const fuelAgent = new FuelAgent();
