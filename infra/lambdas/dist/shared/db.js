"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.query = query;
exports.queryOne = queryOne;
const pg_1 = require("pg");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
let pool = null;
async function getSecret() {
    const client = new client_secrets_manager_1.SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    const cmd = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN });
    const res = await client.send(cmd);
    return JSON.parse(res.SecretString);
}
/**
 * Returns a shared pg.Pool, reused across Lambda invocations in the same
 * execution environment (via Lambda execution context reuse).
 * Connection goes through RDS Proxy — do NOT call pool.end().
 */
async function getPool() {
    if (pool)
        return pool;
    console.log('[db] fetching secret...');
    const secret = await getSecret();
    console.log('[db] secret fetched, connecting to:', process.env.DB_PROXY_HOST);
    pool = new pg_1.Pool({
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
async function query(sql, params) {
    const db = await getPool();
    const result = await db.query(sql, params);
    return result.rows;
}
async function queryOne(sql, params) {
    const rows = await query(sql, params);
    return rows[0] ?? null;
}
