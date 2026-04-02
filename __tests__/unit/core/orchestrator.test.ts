jest.mock('@anthropic-ai/sdk', () => {
  const create = jest.fn();
  return {
    __esModule: true,
    default: class MockAnthropic {
      static mockCreate = create;
      messages = { create };
    },
  };
});

import Anthropic from '@anthropic-ai/sdk';
import { AgentOrchestrator } from '@/core/orchestrator';

const mockCreate = (Anthropic as any).mockCreate as jest.Mock;

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'agent response' }] });
});

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
  });

  it('routes "search" intent to SearchAgent', async () => {
    const result = await orchestrator.route('search', 'flights NYC to London', {});
    expect(result).toBe('agent response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('routes "recommend" intent to RecommendationAgent', async () => {
    const result = await orchestrator.route('recommend', 'business trip aisle seat');
    expect(result).toBe('agent response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('routes "support" intent to SupportAgent', async () => {
    const result = await orchestrator.route('support', 'baggage policy?');
    expect(result).toBe('agent response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('routes "disruption" intent to DisruptionAgent', async () => {
    const result = await orchestrator.route('disruption', 'flight cancelled');
    expect(result).toBe('agent response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws for unknown intent', async () => {
    await expect(
      orchestrator.route('unknown' as any, 'payload'),
    ).rejects.toThrow('Unknown agent intent: unknown');
  });

  it('passes airlineName context into the agent system prompt', async () => {
    await orchestrator.route('support', 'check-in?', { airlineName: 'TestAir' });
    expect(mockCreate.mock.calls[0][0].system).toContain('TestAir');
  });
});
