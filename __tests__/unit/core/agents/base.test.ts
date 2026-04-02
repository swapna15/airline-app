// Self-contained mock — no external variable references needed
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
import { BaseAgent } from '@/core/agents/base';

const mockCreate = (Anthropic as any).mockCreate as jest.Mock;

class TestAgent extends BaseAgent {
  name = 'TestAgent';
  systemPrompt = 'You are a test agent for {airline}.';
}

describe('BaseAgent', () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
    mockCreate.mockReset();
  });

  it('uses claude-sonnet-4-6 model', () => {
    expect((agent as any).model).toBe('claude-sonnet-4-6');
  });

  it('invoke calls anthropic messages.create', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] });
    await agent.invoke('test message');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('invoke returns the text content', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'response text' }] });
    const result = await agent.invoke('hello');
    expect(result).toBe('response text');
  });

  it('invoke returns empty string for non-text content blocks', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'image', source: {} }] });
    const result = await agent.invoke('hello');
    expect(result).toBe('');
  });

  it('buildSystemPrompt replaces {airline} with context.airlineName', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await agent.invoke('q', { airlineName: 'SkyMock Airlines' });
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('SkyMock Airlines');
    expect(call.system).not.toContain('{airline}');
  });

  it('buildSystemPrompt leaves {airline} when no airlineName in context', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await agent.invoke('q');
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('{airline}');
  });

  it('invoke passes the user message correctly', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await agent.invoke('search flights to Paris');
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages[0].content).toBe('search flights to Paris');
    expect(call.messages[0].role).toBe('user');
  });

  it('invoke uses max_tokens of 1024', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await agent.invoke('test');
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(1024);
  });
});
