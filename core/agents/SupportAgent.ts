import { BaseAgent, AgentContext } from './base';

export class SupportAgent extends BaseAgent {
  name = 'SupportAgent';
  systemPrompt = `You are a helpful customer support agent for {airline}.
Answer questions about: baggage allowances, check-in procedures, flight changes, cancellations, loyalty programs, seat upgrades, meal options, and general travel policies.
Be friendly, concise, and helpful. If you don't know something specific to {airline}, provide general airline industry guidance.`;

  async answer(question: string, context?: AgentContext): Promise<string> {
    return this.invoke(question, context);
  }
}

export const supportAgent = new SupportAgent();
