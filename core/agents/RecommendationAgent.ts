import { BaseAgent, AgentContext } from './base';

export class RecommendationAgent extends BaseAgent {
  name = 'RecommendationAgent';
  systemPrompt = `You are a knowledgeable flight seat and cabin class advisor for {airline}.
Given a passenger's preferences and trip details, recommend the best seat and cabin class.
Be concise (2-3 sentences). Mention specific seat features (window, aisle, legroom) and why the class fits the trip.`;

  async recommend(preferences: string, context?: AgentContext): Promise<string> {
    return this.invoke(preferences, context);
  }
}

export const recommendationAgent = new RecommendationAgent();
