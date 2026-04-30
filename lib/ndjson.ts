/**
 * Read a `Response.body` as an NDJSON stream and yield each parsed object as
 * it arrives. Handles partial chunks (a JSON line split across two reads) and
 * skips blank lines.
 *
 * Usage:
 *   for await (const obj of readNdjson(res)) { ... }
 */
export async function* readNdjson<T = unknown>(res: Response): AsyncGenerator<T> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as T;
        } catch {
          // skip malformed line — keep reading
        }
      }
    }
    const tail = buf.trim();
    if (tail) {
      try {
        yield JSON.parse(tail) as T;
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}
