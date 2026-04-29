import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent, type AgentContext } from './base';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PastRejection {
  comment: string;
  createdAt: string;
}

/**
 * Summarizes raw planning inputs (METAR/TAF/SIGMET/NOTAM/route/fuel)
 * into the briefing string the dispatcher sees in the UI.
 *
 * Hard rule: this agent NEVER invents numbers. Distance, fuel, and
 * times are computed deterministically in lib/perf.ts and passed in.
 * The agent only re-phrases what's already true and flags risks.
 *
 * Phase D — feedback loop: callers may pass `pastRejections` (recent
 * planner-typed reasons for rejecting prior briefings). These are
 * appended to the system prompt as anti-patterns to avoid. Lightweight
 * RAG, not retraining; comments are pre-truncated to 500 chars at the
 * store level.
 */
export class PlanningAgent extends BaseAgent {
  name = 'PlanningAgent';
  systemPrompt = `You are a senior flight dispatcher writing a concise briefing for {airline}.
You will be given STRUCTURED FACTS — METARs, TAFs, SIGMETs, NOTAMs, route, fuel numbers.
Rules:
1. Do NOT invent numbers. If a number isn't in the facts, omit it.
2. Lead with operational impact: WX category at origin/destination, runway/taxiway closures, route hazards.
3. Stay under 120 words. No bullets longer than one line.
4. If a SIGMET or NOTAM is materially relevant, mention it. Otherwise summarise as "no significant".
5. End with a single line "RECOMMEND: <go | hold pending X | divert planning>".
Output plain prose, no headers.`;

  /** Pass already-computed facts; agent reformats into a briefing. */
  async summarize(
    facts: Record<string, unknown>,
    pastRejections: PastRejection[] = [],
    context?: AgentContext,
  ): Promise<string> {
    const baseSystem = this.buildSystemPrompt(context);
    const system = pastRejections.length
      ? `${baseSystem}\n\n---\nPAST REJECTIONS — past briefings rejected by planners. Avoid these failure modes:\n${pastRejections
          .map((r, i) => `${i + 1}. ${r.comment}`)
          .join('\n')}\n---`
      : baseSystem;

    const userMessage = `FACTS:\n${JSON.stringify(facts, null, 2)}`;

    const message = await anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = message.content[0];
    return block.type === 'text' ? block.text : '';
  }
}

export const planningAgent = new PlanningAgent();
