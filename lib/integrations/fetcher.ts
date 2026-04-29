/**
 * URI-scheme dispatch for fetching CSV / text payloads from enterprise sources.
 *
 *   s3://bucket/key       — AWS SDK (dynamic import; install @aws-sdk/client-s3
 *                           when needed to keep the default install lean)
 *   file:///abs/path      — local filesystem (dev / on-prem fixture)
 *   http(s)://...         — plain fetch with optional Authorization header
 *
 * Auth headers are passed by the caller; this module does not own credentials.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export interface FetchOptions {
  /** Optional auth header value, e.g. `Bearer eyJ…` or `Basic …`. */
  authorization?: string;
  /** Extra headers for HTTP fetches. */
  headers?: Record<string, string>;
  /** Override AWS region for s3:// URIs. Defaults to AWS_REGION env. */
  region?: string;
}

export async function fetchText(uri: string, opts: FetchOptions = {}): Promise<string> {
  if (uri.startsWith('s3://'))   return fetchS3(uri, opts);
  if (uri.startsWith('file://')) return fetchFile(uri);
  if (uri.startsWith('http://') || uri.startsWith('https://')) return fetchHttp(uri, opts);
  throw new Error(`unsupported URI scheme: ${uri}`);
}

async function fetchFile(uri: string): Promise<string> {
  const path = fileURLToPath(uri);
  return readFile(path, 'utf8');
}

async function fetchHttp(uri: string, opts: FetchOptions): Promise<string> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.authorization) headers.Authorization = opts.authorization;
  const res = await fetch(uri, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${uri}`);
  return res.text();
}

/**
 * Structural shape we need from `@aws-sdk/client-s3`. Avoids a hard type
 * dependency so the package isn't required to compile — only to actually
 * use s3:// URIs.
 */
interface S3Module {
  S3Client: new (cfg: { region?: string }) => {
    send: (cmd: unknown) => Promise<{ Body?: { transformToString: () => Promise<string> } }>;
  };
  GetObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
}

// Function-constructor `import` hides the specifier from webpack so the
// package isn't required at build time. Server-only code path.
const opaqueImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;

async function fetchS3(uri: string, opts: FetchOptions): Promise<string> {
  // Dynamic import keeps @aws-sdk/client-s3 optional. Install it only when
  // an S3 source is actually configured.
  let mod: S3Module;
  try {
    mod = (await opaqueImport('@aws-sdk/client-s3')) as S3Module;
  } catch {
    throw new Error(
      's3:// URIs require @aws-sdk/client-s3. Install with: npm install @aws-sdk/client-s3',
    );
  }
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error(`invalid s3 URI: ${uri}`);
  const [, bucket, key] = match;
  const client = new mod.S3Client({ region: opts.region ?? process.env.AWS_REGION });
  const out = await client.send(new mod.GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!out.Body) throw new Error(`empty S3 object: ${uri}`);
  return out.Body.transformToString();
}
