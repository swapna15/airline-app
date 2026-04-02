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
import { RecommendationAgent } from '@/core/agents/RecommendationAgent';
import { SupportAgent } from '@/core/agents/SupportAgent';
import { DisruptionAgent } from '@/core/agents/DisruptionAgent';

const mockCreate = (Anthropic as any).mockCreate as jest.Mock;

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'mock response' }] });
});

describe('RecommendationAgent', () => {
  const agent = new RecommendationAgent();

  it('name is RecommendationAgent', () => {
    expect(agent.name).toBe('RecommendationAgent');
  });

  it('recommend calls invoke and returns text', async () => {
    const result = await agent.recommend('long haul business trip, prefer aisle');
    expect(result).toBe('mock response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('system prompt mentions seat and cabin', () => {
    expect(agent.systemPrompt.toLowerCase()).toContain('seat');
    expect(agent.systemPrompt.toLowerCase()).toContain('cabin');
  });
});

describe('SupportAgent', () => {
  const agent = new SupportAgent();

  it('name is SupportAgent', () => {
    expect(agent.name).toBe('SupportAgent');
  });

  it('answer calls invoke and returns text', async () => {
    const result = await agent.answer('what is the baggage policy?');
    expect(result).toBe('mock response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('system prompt mentions baggage', () => {
    expect(agent.systemPrompt.toLowerCase()).toContain('baggage');
  });

  it('passes airlineName context into system prompt', async () => {
    await agent.answer('check-in time?', { airlineName: 'SkyMock Airlines' });
    expect(mockCreate.mock.calls[0][0].system).toContain('SkyMock Airlines');
  });
});

describe('DisruptionAgent', () => {
  const agent = new DisruptionAgent();

  it('name is DisruptionAgent', () => {
    expect(agent.name).toBe('DisruptionAgent');
  });

  it('handleDisruption calls invoke and returns text', async () => {
    const result = await agent.handleDisruption('flight delayed 3 hours');
    expect(result).toBe('mock response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('system prompt mentions rebooking', () => {
    expect(agent.systemPrompt.toLowerCase()).toContain('rebooking');
  });
});
