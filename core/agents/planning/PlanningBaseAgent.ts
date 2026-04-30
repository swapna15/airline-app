/**
 * Shared base for the per-phase planning agents.
 *
 * Adds three things on top of core/agents/base.ts:
 *   1. Phase-aware RAG retrieval — every agent declares its `phase` and
 *      `retrievalKinds`, and the base wires up the same retrieve→re-rank→
 *      append-to-prompt flow so individual agents stay short.
 *   2. Structured fact passing — agents take a typed PlanningFacts bag
 *      built deterministically by the phase; the agent only re-phrases.
 *   3. Auditable response — every agent returns text + a list of retrieved
 *      doc ids so the response source field can show 'BriefAgent + 3
 *      rejections + 2 SOPs'.
 *
 * This is the agentic substrate for the GAAS layer — one base, six agents.
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent, type AgentContext } from '@/core/agents/base';
import { retrieveContext, type RetrievedContext } from '@/lib/ai/rag';
import type { VectorDocument } from '@/lib/ai/vector-store';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PlanningContext extends AgentContext {
  /** Tenant UUID — required for retrieval. Falls back to airlineName when unset. */
  tenantId?: string;
  /** Optional override for the phase summary used as the retrieval query. */
  retrievalQuery?: string;
}

export interface AgentResult {
  /** The text that goes into the phase summary. */
  text: string;
  /** Source label suffix — used in PhaseResult.source. */
  retrievalSource: string;
  /** Doc ids retrieved — used by the audit panel. */
  retrievedDocIds: string[];
}

export abstract class PlanningBaseAgent extends BaseAgent {
  /** Which phase this agent serves — used for RAG filtering. */
  abstract readonly phase: string;
  /** Which corpus kinds this agent should pull. */
  abstract readonly retrievalKinds: VectorDocument['kind'][];
  /** Hard cap on output tokens — kept tight, agents re-phrase facts. */
  protected readonly maxTokens: number = 700;
  /** Hard cap on retrieved doc count for this agent. */
  protected readonly retrievalLimit: number = 6;

  /**
   * Run the agent against a deterministic facts bag.
   * Steps:
   *   1. Build the phase-summary query (caller may override).
   *   2. Retrieve relevant docs from the vector store, filtered by phase + kinds.
   *   3. Format docs into a system-prompt suffix.
   *   4. Call the model with FACTS as the user message.
   *   5. Return text + audit metadata.
   */
  async run(facts: Record<string, unknown>, context?: PlanningContext): Promise<AgentResult> {
    const baseSystem = this.buildSystemPrompt(context);

    let retrieved: RetrievedContext = { docs: [], systemSuffix: '', sourceLabel: '' };
    if (context?.tenantId) {
      retrieved = await retrieveContext({
        tenantId: context.tenantId,
        phase: this.phase,
        query: context.retrievalQuery ?? this.queryFromFacts(facts),
        kinds: this.retrievalKinds,
        limit: this.retrievalLimit,
      });
    }

    const system = baseSystem + retrieved.systemSuffix;
    const userMessage = `FACTS:\n${JSON.stringify(facts, null, 2)}`;

    const message = await anthropic.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = message.content[0];
    const text = block.type === 'text' ? block.text : '';

    return {
      text,
      retrievalSource: retrieved.sourceLabel,
      retrievedDocIds: retrieved.docs.map((d) => d.doc.id),
    };
  }

  /**
   * Build the retrieval query from a facts bag. Subclasses override to
   * extract the most semantically meaningful slice (e.g., destination ICAO,
   * weather hazards, equipment list). Default: top-level keys joined.
   */
  protected queryFromFacts(facts: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(facts)) {
      if (typeof v === 'string')      parts.push(`${k}: ${v}`);
      else if (typeof v === 'number') parts.push(`${k}: ${v}`);
    }
    return parts.join('. ');
  }
}
