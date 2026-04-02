/**
 * @jest-environment node
 */
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
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/agents/route';

const mockCreate = (Anthropic as any).mockCreate as jest.Mock;

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/agents', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'agent says hello' }] });
});

describe('POST /api/agents', () => {
  it('returns 400 when agent is missing', async () => {
    const res = await POST(makeRequest({ payload: 'test' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/);
  });

  it('returns 400 when payload is missing', async () => {
    const res = await POST(makeRequest({ agent: 'search' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with result for search intent', async () => {
    const res = await POST(makeRequest({ agent: 'search', payload: 'flights NYC to London' }));
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe('agent says hello');
  });

  it('returns 200 with result for recommend intent', async () => {
    const res = await POST(makeRequest({ agent: 'recommend', payload: 'business trip' }));
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe('agent says hello');
  });

  it('returns 200 with result for support intent', async () => {
    const res = await POST(makeRequest({ agent: 'support', payload: 'baggage policy?' }));
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe('agent says hello');
  });

  it('returns 200 with result for disruption intent', async () => {
    const res = await POST(makeRequest({ agent: 'disruption', payload: 'flight cancelled' }));
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe('agent says hello');
  });

  it('passes context airlineName into the agent system prompt', async () => {
    await POST(makeRequest({
      agent: 'support',
      payload: 'check-in time?',
      context: { airlineName: 'TestAir' },
    }));
    expect(mockCreate.mock.calls[0][0].system).toContain('TestAir');
  });

  it('throws for unknown agent intent', async () => {
    await expect(
      POST(makeRequest({ agent: 'ghost', payload: 'test' })),
    ).rejects.toThrow('Unknown agent intent: ghost');
  });
});
