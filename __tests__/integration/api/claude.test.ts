/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/claude/route';

global.fetch = jest.fn();

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/claude', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
});

describe('POST /api/claude', () => {
  it('proxies request to Anthropic and returns response', async () => {
    const anthropicResponse = { id: 'msg_123', content: [{ type: 'text', text: 'Hello' }] };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => anthropicResponse,
    });

    const res = await POST(makeRequest({ model: 'claude-sonnet-4-6', messages: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(anthropicResponse);
  });

  it('calls the correct Anthropic endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await POST(makeRequest({ model: 'claude-sonnet-4-6', messages: [] }));
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('api.anthropic.com');
  });

  it('includes anthropic-version header', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await POST(makeRequest({}));
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('returns error response when Anthropic returns non-ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'rate limit exceeded',
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('rate limit exceeded');
  });
});
