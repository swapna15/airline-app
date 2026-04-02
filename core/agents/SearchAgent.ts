import { BaseAgent, AgentContext } from './base';
import type { SearchParams } from '@/types/flight';
import { AIRPORTS } from '@/utils/mockData';

export class SearchAgent extends BaseAgent {
  name = 'SearchAgent';
  systemPrompt = `You are a flight search assistant for {airline}.
Extract flight search parameters from natural language queries.
Return ONLY valid JSON matching this structure (no markdown, no explanation):
{
  "origin": { "code": "XXX", "name": "...", "city": "...", "country": "..." },
  "destination": { "code": "XXX", "name": "...", "city": "...", "country": "..." },
  "departureDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD or null",
  "passengers": { "adults": 1, "children": 0, "infants": 0 },
  "class": "economy|business|first",
  "tripType": "oneWay|roundTrip"
}
If you cannot determine a field, use sensible defaults (today's date, 1 adult, economy, oneWay).
Use IATA airport codes. Map city names to the nearest major airport.`;

  async parseQuery(query: string, context?: AgentContext): Promise<Partial<SearchParams>> {
    const raw = await this.invoke(query, context);
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

export const searchAgent = new SearchAgent();
