-- 009_dispatcher_certifications.sql
-- Dispatcher legal-identity model — closes the gap between "user has the
-- flight_planner role" and "user is a §121.533-qualified dispatcher".
--
-- Design follows .claude/specs/flight_planning_design.md §2.1 / §5.4:
--
--   dispatcher_certificates  — primary regulatory identity (FAA cert # / FOO
--                              license number / "operator-trained" stub for
--                              EASA states), issuing authority, issue +
--                              expiry. One per user.
--   dispatcher_areas         — areas-of-operation the dispatcher is
--                              authorized for (CONUS, NAT, NOPAC, POLAR,
--                              ETOPS-180, RNP-AR, …). Many per cert.
--   dispatcher_type_ratings  — aircraft-group qualifications (B737NG, A320,
--                              B787, A350, …). Many per cert.
--   dispatcher_currency      — §121.463(c) recurrent-familiarization record
--                              per aircraft group. Releases must check
--                              expires_at > NOW().
--
-- All tables are tenant-scoped via the certificate's user (users.tenant_id).

CREATE TABLE dispatcher_certificates (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cert_number         TEXT         NOT NULL,
  /* 'FAA' | 'EASA-OP-TRAINED' | 'TC' (Transport Canada) | 'DGCA' | 'ICAO-FOO' | … */
  issuing_authority   TEXT         NOT NULL,
  issued_at           DATE         NOT NULL,
  /* NULL = no expiry (FAA Part 65 certs don't expire — currency does instead). */
  expires_at          DATE,
  status              TEXT         NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','suspended','revoked')),
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (issuing_authority, cert_number)
);

CREATE INDEX idx_dispatcher_cert_user ON dispatcher_certificates (user_id);

-- Areas of operation (multi-row per cert). Code is a free-text token from a
-- known vocabulary so we don't have to migrate when a tenant adds a new area.
CREATE TABLE dispatcher_areas (
  certificate_id      UUID         NOT NULL REFERENCES dispatcher_certificates(id) ON DELETE CASCADE,
  area_code           TEXT         NOT NULL,
  /* When the dispatcher was last familiarized with this area (or qualified). */
  qualified_at        DATE         NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (certificate_id, area_code)
);

CREATE TABLE dispatcher_type_ratings (
  certificate_id      UUID         NOT NULL REFERENCES dispatcher_certificates(id) ON DELETE CASCADE,
  type_code           TEXT         NOT NULL,
  qualified_at        DATE         NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (certificate_id, type_code)
);

-- §121.463(c) recurrent familiarization currency. One row per (cert, group).
-- Status of "current" is just expires_at > NOW() — no separate flag.
CREATE TABLE dispatcher_currency (
  certificate_id      UUID         NOT NULL REFERENCES dispatcher_certificates(id) ON DELETE CASCADE,
  /* Aircraft group this currency covers (e.g., 'WIDEBODY', 'NARROWBODY',
   * 'B777', 'A320'). Tenant chooses granularity. */
  group_code          TEXT         NOT NULL,
  last_familiarization_at  DATE    NOT NULL,
  /* §121.463(c) requires familiarization within the preceding 12 calendar
   * months. Expire 12 months from last_familiarization_at by default. */
  expires_at          DATE         NOT NULL,
  notes               TEXT,
  PRIMARY KEY (certificate_id, group_code)
);

CREATE INDEX idx_dispatcher_currency_expiry ON dispatcher_currency (expires_at);

-- Seed the planner@airline.com user (added in migration 006) with a
-- demo-able certificate so the release-time guard is exercisable end-to-end.
DO $$
DECLARE
  planner_user_id UUID;
  cert_id UUID;
BEGIN
  SELECT id INTO planner_user_id
  FROM users WHERE email = 'planner@airline.com' LIMIT 1;
  IF planner_user_id IS NOT NULL THEN
    INSERT INTO dispatcher_certificates (user_id, cert_number, issuing_authority, issued_at, status)
    VALUES (planner_user_id, 'DX-DEMO-0001', 'FAA', CURRENT_DATE - INTERVAL '3 years', 'active')
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO cert_id;
    IF cert_id IS NOT NULL THEN
      INSERT INTO dispatcher_areas (certificate_id, area_code) VALUES
        (cert_id, 'CONUS'),
        (cert_id, 'NAT'),
        (cert_id, 'ETOPS-180')
      ON CONFLICT DO NOTHING;
      INSERT INTO dispatcher_type_ratings (certificate_id, type_code) VALUES
        (cert_id, 'B777'),
        (cert_id, 'A330'),
        (cert_id, 'A380')
      ON CONFLICT DO NOTHING;
      INSERT INTO dispatcher_currency (certificate_id, group_code, last_familiarization_at, expires_at) VALUES
        (cert_id, 'WIDEBODY',  CURRENT_DATE - INTERVAL '60 days',  CURRENT_DATE + INTERVAL '305 days'),
        (cert_id, 'NARROWBODY', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE + INTERVAL '275 days')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END$$;
