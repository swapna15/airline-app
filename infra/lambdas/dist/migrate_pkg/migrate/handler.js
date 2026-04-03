"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const db_1 = require("../shared/db");
// SQL files are copied into the bundle directory by bundle.js
const SCHEMA_SQL = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '001_schema.sql'), 'utf8');
const SEED_SQL = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '002_seed.sql'), 'utf8');
const MIGRATIONS = [
    { name: '001_schema', sql: SCHEMA_SQL },
    { name: '002_seed', sql: SEED_SQL },
];
const handler = async () => {
    const pool = await (0, db_1.getPool)();
    const client = await pool.connect();
    const applied = [];
    const skipped = [];
    try {
        // Ensure migration tracking table exists (idempotent)
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
        for (const migration of MIGRATIONS) {
            const existing = await client.query('SELECT name FROM schema_migrations WHERE name = $1', [migration.name]);
            if (existing.rowCount && existing.rowCount > 0) {
                console.log(`Skipping ${migration.name} (already applied)`);
                skipped.push(migration.name);
                continue;
            }
            console.log(`Applying ${migration.name}...`);
            await client.query('BEGIN');
            try {
                // For seed: clear any partial data from previous failed runs
                if (migration.name === '002_seed') {
                    await client.query('TRUNCATE flights CASCADE');
                }
                await client.query(migration.sql);
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
                await client.query('COMMIT');
                console.log(`Applied ${migration.name}`);
                applied.push(migration.name);
            }
            catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }
        return { applied, skipped };
    }
    finally {
        client.release();
    }
};
exports.handler = handler;
