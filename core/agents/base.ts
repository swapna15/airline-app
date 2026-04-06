import Anthropic from '@anthropic-ai/sdk';
import type { TenantConfig, UserPreferences } from '@/types/tenant';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentContext {
  airlineName?: string;
  flightId?: string;
  bookingId?: string;
  tenant?: TenantConfig;
  userPreferences?: UserPreferences;
  [key: string]: unknown;
}

export abstract class BaseAgent {
  protected model = 'claude-sonnet-4-6';
  abstract name: string;
  abstract systemPrompt: string;

  async invoke(userMessage: string, context?: AgentContext): Promise<string> {
    const system = this.buildSystemPrompt(context);
    const message = await anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = message.content[0];
    return block.type === 'text' ? block.text : '';
  }

  protected buildSystemPrompt(context?: AgentContext): string {
    const tenant = context?.tenant;
    const prefs  = context?.userPreferences;

    // ── Airline name substitution ─────────────────────────────────────────────
    const airlineName = tenant?.brand.name ?? context?.airlineName ?? 'the airline';
    let prompt = this.systemPrompt.replace(/\{airline\}/g, airlineName);

    // ── Tenant personality + tone ─────────────────────────────────────────────
    if (tenant) {
      const { aiPreferences, policies, features } = tenant;

      const toneGuide: Record<typeof aiPreferences.tone, string> = {
        formal:   'Maintain a formal, professional tone. Use complete sentences and avoid contractions.',
        friendly: 'Be warm, conversational, and approachable. Use contractions naturally.',
        concise:  'Be brief and direct. Avoid filler phrases. Lead with the answer.',
      };

      prompt += `\n\n---\n${aiPreferences.agentPersonality}\n${toneGuide[aiPreferences.tone]}`;

      // ── Policy context so agents give accurate, tenant-specific answers ───────
      prompt += `\n\nCANCELLATION POLICY: ${aiPreferences.cancellationPolicyText}`;
      prompt += `\nBAGGAGE POLICY: ${aiPreferences.baggagePolicyText}`;

      if (policies.pricing.markupPercent > 0) {
        prompt += `\nPRICING: Fares include a ${policies.pricing.markupPercent}% service fee.`;
      }

      if (features.loyaltyProgram) {
        prompt += `\nLOYALTY: ${airlineName} operates a loyalty programme — reference it when relevant.`;
      }

      if (aiPreferences.supportedLanguages.length > 1) {
        prompt += `\nLANGUAGES: You can respond in: ${aiPreferences.supportedLanguages.join(', ')}.`;
      }
    }

    // ── User personalisation ──────────────────────────────────────────────────
    if (prefs) {
      const parts: string[] = [];
      parts.push(`prefers ${prefs.preferredCabin} class`);
      if (prefs.preferredSeatType !== 'any') parts.push(`${prefs.preferredSeatType} seat`);
      if (prefs.defaultAddCheckedBag) parts.push('usually adds a checked bag');
      if (prefs.frequentRoutes.length > 0) {
        parts.push(
          `frequent routes: ${prefs.frequentRoutes.map((r) => `${r.origin}→${r.destination}`).join(', ')}`,
        );
      }
      if (parts.length) {
        prompt += `\n\nPASSENGER PROFILE: This passenger ${parts.join(', ')}. Tailor recommendations accordingly.`;
      }
    }

    return prompt;
  }
}
