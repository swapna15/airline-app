import { searchAgent } from './agents/SearchAgent';
import { recommendationAgent } from './agents/RecommendationAgent';
import { supportAgent } from './agents/SupportAgent';
import { disruptionAgent } from './agents/DisruptionAgent';
import type { AgentContext } from './agents/base';

export type AgentIntent = 'search' | 'recommend' | 'support' | 'disruption';

export class AgentOrchestrator {
  async route(intent: AgentIntent, payload: string, context?: AgentContext): Promise<string> {
    switch (intent) {
      case 'search':
        return searchAgent.invoke(payload, context);
      case 'recommend':
        return recommendationAgent.recommend(payload, context);
      case 'support':
        return supportAgent.answer(payload, context);
      case 'disruption':
        return disruptionAgent.handleDisruption(payload, context);
      default:
        throw new Error(`Unknown agent intent: ${intent}`);
    }
  }
}

export const orchestrator = new AgentOrchestrator();
