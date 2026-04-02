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
import { SearchAgent } from '@/core/agents/SearchAgent';

const mockCreate = (Anthropic as any).mockCreate as jest.Mock;

describe('SearchAgent', () => {
  let agent: SearchAgent;

  beforeEach(() => {
    agent = new SearchAgent();
    mockCreate.mockReset();
  });

  it('name is SearchAgent', () => {
    expect(agent.name).toBe('SearchAgent');
  });

  it('systemPrompt includes tripType and returnDate fields', () => {
    expect(agent.systemPrompt).toContain('tripType');
    expect(agent.systemPrompt).toContain('returnDate');
  });

  it('parseQuery calls invoke with the user query', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{}' }] });
    await agent.parseQuery('flights from NYC to London');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].messages[0].content).toBe('flights from NYC to London');
  });

  it('parseQuery returns parsed JSON', async () => {
    const payload = {
      origin: { code: 'JFK', city: 'New York', name: 'JFK', country: 'USA' },
      destination: { code: 'LHR', city: 'London', name: 'LHR', country: 'UK' },
      departureDate: '2026-06-01',
      returnDate: null,
      passengers: { adults: 1, children: 0, infants: 0 },
      class: 'economy',
      tripType: 'oneWay',
    };
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(payload) }] });
    const result = await agent.parseQuery('JFK to LHR');
    expect(result).toMatchObject({ origin: { code: 'JFK' }, destination: { code: 'LHR' } });
  });

  it('parseQuery returns {} when response is not valid JSON', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'sorry, I cannot help' }] });
    const result = await agent.parseQuery('gibberish');
    expect(result).toEqual({});
  });

  it('parseQuery returns {} when response has markdown fences (raw fences fail JSON.parse)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n{"origin":{"code":"JFK"}}\n```' }],
    });
    const result = await agent.parseQuery('test');
    expect(result).toEqual({});
  });

  it('parseQuery handles round-trip fields', async () => {
    const payload = {
      tripType: 'roundTrip',
      returnDate: '2026-06-15',
      passengers: { adults: 2, children: 1, infants: 0 },
    };
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(payload) }] });
    const result = await agent.parseQuery('return flights 2 adults 1 child');
    expect(result).toMatchObject({ tripType: 'roundTrip', returnDate: '2026-06-15' });
    expect((result as any).passengers?.adults).toBe(2);
  });
});
