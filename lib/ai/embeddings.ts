/**
 * Pluggable embedding provider for the GAAS planning AI layer.
 *
 * Anthropic doesn't ship an embeddings endpoint — by recommendation, the
 * companion provider is Voyage AI (`voyage-3-large` / `voyage-3`). We
 * abstract behind a small interface so:
 *   - local dev runs zero-dependency (mock provider, hash-based vector)
 *   - tenants can plug Voyage / OpenAI / Cohere via env without code changes
 *   - the dimensionality is provider-controlled and surfaced for the
 *     vector store to size its column / index correctly
 *
 * Selection:
 *   EMBEDDING_PROVIDER = mock (default) | voyage | openai
 */

export interface EmbeddingProvider {
  /** Stable provider name — surfaces in source/audit fields. */
  name: string;
  /** Output vector dimensionality. */
  dimensions: number;
  /** Embed a list of texts. Always returns a vector per input, in order. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Mock provider: deterministic hash-based vector. Useful for unit tests and
 * for local dev where you don't want to pay or set up an API key. Distance
 * between unrelated strings is meaningful enough that retrieval-by-cosine
 * works for round-trip tests, but accuracy is much lower than real models.
 */
class MockEmbeddingProvider implements EmbeddingProvider {
  name = 'mock-hash-128';
  dimensions = 128;

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this.hashVector(t.toLowerCase())));
  }

  private hashVector(s: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    // Sliding window of bigrams; project each into a deterministic bucket.
    for (let i = 0; i < s.length - 1; i++) {
      const bigram = s.charCodeAt(i) * 256 + s.charCodeAt(i + 1);
      const bucket = bigram % this.dimensions;
      v[bucket] += 1;
    }
    // L2-normalise so cosine reduces to dot product later.
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
    return norm > 0 ? v.map((x) => x / norm) : v;
  }
}

/**
 * Voyage AI provider. Free tier covers light dev. Pricing:
 * https://docs.voyageai.com/pricing
 */
class VoyageEmbeddingProvider implements EmbeddingProvider {
  name: string;
  dimensions: number;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'voyage-3') {
    this.apiKey = apiKey;
    this.model = model;
    this.name = `voyage:${model}`;
    // voyage-3 = 1024, voyage-3-large = 1024, voyage-3-lite = 512.
    this.dimensions = model.includes('lite') ? 512 : 1024;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: this.model, input_type: 'document' }),
    });
    if (!res.ok) throw new Error(`voyage ${res.status} ${res.statusText}`);
    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }
}

/**
 * OpenAI provider — for tenants standardised on OpenAI infra.
 * Default model `text-embedding-3-small` (1536 dim, low cost).
 */
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name: string;
  dimensions: number;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'text-embedding-3-small') {
    this.apiKey = apiKey;
    this.model = model;
    this.name = `openai:${model}`;
    this.dimensions = model === 'text-embedding-3-large' ? 3072 : 1536;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });
    if (!res.ok) throw new Error(`openai ${res.status} ${res.statusText}`);
    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }
}

let cached: EmbeddingProvider | null = null;

/** Resolve provider once per process; honours hot-swap when env changes (dev only). */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;

  const which = (process.env.EMBEDDING_PROVIDER ?? 'mock').toLowerCase();
  if (which === 'voyage' && process.env.VOYAGE_API_KEY) {
    cached = new VoyageEmbeddingProvider(
      process.env.VOYAGE_API_KEY,
      process.env.VOYAGE_MODEL ?? 'voyage-3',
    );
    return cached;
  }
  if (which === 'openai' && process.env.OPENAI_API_KEY) {
    cached = new OpenAIEmbeddingProvider(
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    );
    return cached;
  }

  cached = new MockEmbeddingProvider();
  return cached;
}

/** Cosine similarity for in-memory ranking. Both vectors must be same length. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Reset cached provider — only useful for tests / hot-reload. */
export function resetEmbeddingProvider(): void {
  cached = null;
}
