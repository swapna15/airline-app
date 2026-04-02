import { BaseAgent, AgentContext } from './base';

export class DisruptionAgent extends BaseAgent {
  name = 'DisruptionAgent';
  systemPrompt = `You are a flight disruption specialist for {airline}.
When a passenger's flight is delayed or cancelled, help them understand their options:
- Rebooking on the next available flight
- Compensation entitlements (meals, accommodation, refunds)
- Alternative routing options
Be empathetic, clear, and action-oriented. Prioritize passenger comfort and legal rights.`;

  async handleDisruption(situation: string, context?: AgentContext): Promise<string> {
    return this.invoke(situation, context);
  }
}

export const disruptionAgent = new DisruptionAgent();
