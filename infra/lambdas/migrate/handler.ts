import { readFileSync } from 'fs';
import { join } from 'path';
import { getPool } from '../shared/db';

// SQL files are copied into the bundle directory by bundle.js
// Schema migrations only — `003_refresh_flight_dates.sql` is an idempotent
// data refresh and is NOT tracked here (running it once would freeze the demo
// dates against the migration table; instead, run it ad-hoc when seeded flights
// fall into the past).
const SCHEMA_SQL              = readFileSync(join(__dirname, '001_schema.sql'),                  'utf8');
const SEED_SQL                = readFileSync(join(__dirname, '002_seed.sql'),                    'utf8');
const MULTI_TENANT_SQL        = readFileSync(join(__dirname, '003_multi_tenant.sql'),            'utf8');
const FLIGHT_PLANS_SQL        = readFileSync(join(__dirname, '004_flight_plans.sql'),            'utf8');
const INTEGRATION_CONFIGS_SQL = readFileSync(join(__dirname, '005_integration_configs.sql'),     'utf8');
const FLIGHT_PLANNER_USER_SQL = readFileSync(join(__dirname, '006_add_flight_planner_user.sql'), 'utf8');
const FLIGHT_PLANS_TEXT_ID_SQL = readFileSync(join(__dirname, '007_flight_plans_text_id.sql'),    'utf8');
const FLIGHT_PLANS_UUID_ID_SQL = readFileSync(join(__dirname, '008_flight_plans_uuid_id.sql'),    'utf8');
const DISPATCHER_CERTS_SQL     = readFileSync(join(__dirname, '009_dispatcher_certifications.sql'), 'utf8');
const OPS_SPECS_SQL            = readFileSync(join(__dirname, '010_ops_specs.sql'),               'utf8');
const PBN_OCEANIC_SQL          = readFileSync(join(__dirname, '011_pbn_oceanic_defaults.sql'),    'utf8');
const REFRESH_FLIGHTS_SQL      = readFileSync(join(__dirname, '003_refresh_flight_dates.sql'),    'utf8');

const MIGRATIONS = [
  { name: '001_schema',                  sql: SCHEMA_SQL                },
  { name: '002_seed',                    sql: SEED_SQL                  },
  { name: '003_multi_tenant',            sql: MULTI_TENANT_SQL          },
  { name: '004_flight_plans',            sql: FLIGHT_PLANS_SQL          },
  { name: '005_integration_configs',     sql: INTEGRATION_CONFIGS_SQL   },
  { name: '006_add_flight_planner_user', sql: FLIGHT_PLANNER_USER_SQL   },
  { name: '007_flight_plans_text_id',    sql: FLIGHT_PLANS_TEXT_ID_SQL  },
  { name: '008_flight_plans_uuid_id',    sql: FLIGHT_PLANS_UUID_ID_SQL  },
  { name: '009_dispatcher_certifications', sql: DISPATCHER_CERTS_SQL    },
  { name: '010_ops_specs',                 sql: OPS_SPECS_SQL           },
  { name: '011_pbn_oceanic_defaults',      sql: PBN_OCEANIC_SQL         },
];

interface MigrateEvent { mode?: 'migrate' | 'refresh-flights' }

export const handler = async (
  event?: MigrateEvent,
): Promise<{ applied: string[]; skipped: string[]; refreshed?: boolean }> => {
  const pool   = await getPool();
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  // Ad-hoc data refresh — runs the rolling-dates SQL outside the
  // schema_migrations table so the demo flights can be moved forward
  // whenever needed. Invoke with: `--payload '{"mode":"refresh-flights"}'`.
  if (event?.mode === 'refresh-flights') {
    try {
      await client.query(REFRESH_FLIGHTS_SQL);
      return { applied: [], skipped: [], refreshed: true };
    } finally {
      client.release();
    }
  }

  try {
    // Ensure migration tracking table exists (idempotent)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const migration of MIGRATIONS) {
      const existing = await client.query(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [migration.name],
      );

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
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [migration.name],
        );
        await client.query('COMMIT');
        console.log(`Applied ${migration.name}`);
        applied.push(migration.name);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    return { applied, skipped };
  } finally {
    client.release();
  }
};
