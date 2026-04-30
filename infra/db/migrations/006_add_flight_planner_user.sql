-- 006_add_flight_planner_user.sql
-- Relaxes the users.role CHECK to allow 'flight_planner' (added after the
-- original 001_schema.sql shipped) and seeds a default planner account so
-- testers can sign in without going through /register + admin role-update.
--
-- Idempotent: safe to re-run.

DO $$
DECLARE
  cn text;
BEGIN
  SELECT conname INTO cn
  FROM pg_constraint
  WHERE conrelid = 'users'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%passenger%';
  IF cn IS NOT NULL THEN
    EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(cn);
  END IF;
END$$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('passenger','checkin_agent','gate_manager','coordinator','admin','flight_planner'));

-- Seed default flight planner. Password = "password" — same bcrypt hash as
-- every other 002_seed user. Update role on conflict so re-running this
-- against an existing 'passenger' row promotes them.
--
-- Migration 003_multi_tenant re-scoped the users uniqueness from `email` to
-- `(tenant_id, email)`, so the ON CONFLICT target must include tenant_id.
-- We pin the planner to the aeromock tenant (the same default applied to
-- every other seeded user).
INSERT INTO users (name, email, password, role, tenant_id) VALUES
  ('Flight Planner', 'planner@airline.com',
   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
   'flight_planner',
   '00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role;
