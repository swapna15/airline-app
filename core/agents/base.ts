import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentContext {
  airlineName?: string;
  flightId?: string;
  bookingId?: string;
  [key: string]: unknown;
}

export abstract class BaseAgent {
  protected model = 'claude-sonnet-4-6';
  abstract name: string;
  abstract systemPrompt: string;

  async invoke(userMessage: string, context?: AgentContext): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(context);
    const message = await anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = message.content[0];
    return block.type === 'text' ? block.text : '';
  }

  protected buildSystemPrompt(context?: AgentContext): string {
    let prompt = this.systemPrompt;
    if (context?.airlineName) {
      prompt = prompt.replace(/\{airline\}/g, context.airlineName);
    }
    return prompt;
  }
}
