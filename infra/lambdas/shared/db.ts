import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let pool: Pool | null = null;

interface DbSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

async function getSecret(): Promise<DbSecret> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  const cmd = new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN! });
  const res = await client.send(cmd);
  return JSON.parse(res.SecretString!);
}

/**
 * Returns a shared pg.Pool, reused across Lambda invocations in the same
 * execution environment (via Lambda execution context reuse).
 * Connection goes through RDS Proxy — do NOT call pool.end().
 */
export async function getPool(): Promise<Pool> {
  if (pool) return pool;

  console.log('[db] fetching secret...');
  const secret = await getSecret();
  console.log('[db] secret fetched, connecting to:', process.env.DB_PROXY_HOST);

  pool = new Pool({
    host: process.env.DB_PROXY_HOST ?? secret.host,
    port: secret.port ?? 5432,
    database: secret.dbname ?? process.env.DB_NAME,
    user: secret.username,
    password: secret.password,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 10000,
    query_timeout: 25000,
  });

  pool.on('error', (err) => console.error('[db] pool error:', err.message));
  console.log('[db] pool created');
  return pool;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const db = await getPool();
  const result = await db.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
