# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Next.js dev server on localhost:3000
npm run build        # Production build
npm run lint         # ESLint via next lint

# Testing
npm test                          # Run all tests
npm run test:watch                # Watch mode
npm run test:coverage             # Coverage report (thresholds: 70% branches, 80% lines/functions/statements)
npx jest --testPathPattern=SearchForm   # Run a single test file by name
npx jest __tests__/unit/core/agents/   # Run a whole test directory
NODE_ENV=test npx jest --runInBand     # CI mode (matches GitHub Actions)

# Lambda backend
cd infra/lambdas
npm ci --omit=dev    # Install production deps only
npm run build        # tsc → dist/
npm run bundle       # build + copy shared/ and node_modules into each dist/<handler>/

# Terraform
cd infra/terraform
terraform init
terraform plan -var="frontend_url=https://..." -var="nextauth_secret=..."
terraform apply ...
```

## Custom Skills

Two project-specific Claude Code skills are registered:
- `/add-airline` — scaffolds a new airline adapter into `core/adapters/`
- `/run-agent` — invokes an agent intent against the local dev server for quick testing

## Project Specs

`.claude/specs/` contains:
- `requirements.md` — full functional/non-functional requirements (source of truth for intended behavior)
- `tasks.md` — phased implementation checklist with verification steps
- `design.md` — design decisions

`.kiro/specs/flight-planner-enhancements/requirements.md` tracks the next round of planner work (tankering, MEL impact, schedule deconfliction — the three ❌ items not yet built).

## Architecture

### Frontend (Next.js 14 App Router)

The app has **two distinct user surfaces** rendered conditionally by role:

1. **Passenger surface** — search, flight results, seat map, booking, checkout, my-bookings
2. **Staff surfaces** — `/checkin`, `/gate`, `/coordinator`, `/planner`, `/admin` — each a role-gated page

Role is stored in the NextAuth JWT and propagated via `session.user.role`. The `middleware.ts` enforces route-level access using `ROUTE_ROLES`. The `Navbar` renders different nav links and a role badge based on session role.

**Booking state** is managed by `utils/bookingStore.tsx` (React Context + localStorage), shared across the multi-step `/booking/*` pages. Each step reads/writes the same context; state is persisted to localStorage so a page refresh during booking restores where the user left off. `reset()` clears both.

**Role system** (`types/roles.ts`):
- 6 roles: `passenger`, `checkin_agent`, `gate_manager`, `coordinator`, `flight_planner`, `admin`
- In local dev, role is derived from email prefix via `roleFromEmail()` (e.g. `admin@x.com` → admin, `planner@x.com` → flight_planner)
- When `NEXT_PUBLIC_API_URL` is set, `auth.ts` calls the real `/users/login` Lambda instead

### AI Agent System (`core/`)

Four agents all extend `BaseAgent` (`core/agents/base.ts`), which wraps the Anthropic SDK (`claude-sonnet-4-6`):

| Agent | Method | Purpose |
|---|---|---|
| `SearchAgent` | `invoke()` | Natural-language flight search |
| `RecommendationAgent` | `recommend()` | Upsell / personalized suggestions |
| `SupportAgent` | `answer()` | Customer support FAQ |
| `DisruptionAgent` | `handleDisruption()` | Flight delay/cancellation advice |

`AgentOrchestrator` (`core/orchestrator.ts`) routes by `AgentIntent` string to the correct agent. The API route `app/api/agents/route.ts` receives `{ intent, payload, context }` and calls the orchestrator. The `ClaudeAssistant` component in the UI uses `app/api/claude/route.ts` as a simple Anthropic proxy for freeform chat.

### Adapter pattern (`core/adapters/`)

`AirlineAdapter` interface (`types.ts`) abstracts flight search, seat map, booking CRUD. Two implementations live alongside `registry.ts`:
- `mock/` — used when neither `NEXT_PUBLIC_API_URL` nor `DUFFEL_ACCESS_TOKEN` is set
- `duffel/` — wraps `@duffel/api` for real flight inventory; selected when `DUFFEL_ACCESS_TOKEN` is set and `NEXT_PUBLIC_API_URL` is unset

`AdapterRegistry` allows multiple airline adapters to be registered by ID. Multi-tenancy hooks live in `core/tenant/` (`registry.ts` + React `context.tsx`) for per-tenant adapter selection.

### Flight planning (`/planner`, `app/api/planner/[phase]/route.ts`)

Dispatcher-style workflow for the `flight_planner` role: per-flight stepper through Brief → Aircraft → Route → Fuel → W&B → Crew → Slot/ATC → Release. Each phase calls `POST /api/planner/[phase]`; all responses use the envelope `{ summary, data, source }` so swapping a data source never changes the UI. Persistence lives in the `flight_plans` table (migration `004_flight_plans.sql`); approve/reject events go to `flight_plan_reviews` for the future feedback-loop retrieval.

**Data source matrix** (Phase B):

| Phase | Source | Auth |
|---|---|---|
| `brief` | aviationweather.gov (METAR/TAF/SIGMET) + FAA NOTAM API + `PlanningAgent` summarizes | METAR/TAF none; NOTAM needs `FAA_CLIENT_ID`/`FAA_CLIENT_SECRET` (falls back to mock when missing) |
| `route` | Haversine on `lib/icao.ts` coords + perf table | none |
| `fuel` | `lib/perf.ts` perf-table (manufacturer cruise burn) | none |
| `aircraft`, `weight_balance`, `crew`, `slot_atc` | Mocked — no fleet/load/crew/Eurocontrol integration | — |

**Hard rule for `PlanningAgent`** (`core/agents/PlanningAgent.ts`): never invents numbers. Distance, time, fuel are computed deterministically in `lib/perf.ts` and passed in as facts; the agent only re-phrases them and flags risks.

**Persistence (Phase C)**: plan state has two backends, selected by `NEXT_PUBLIC_API_URL`:
- **Unset** → `lib/planner-store.ts` (`globalThis`-attached Map; process-scoped, restart-clean, HMR-safe — `MockAdapter` convention)
- **Set** → forwards to the planning Lambda (`infra/lambdas/planning/handler.ts`) which queries Postgres tables `flight_plans` and `flight_plan_reviews` from migration 004

Next.js bridge routes:
- `GET/PUT /api/planner/plans/[flightId]` — load/upsert the plan
- `POST /api/planner/plans/[flightId]/reviews` — append-only audit of approve/reject/release events
- `GET /api/planner/eod` — uses the Lambda's `GET /planning/eod-stats` aggregator when API_URL set; falls back to in-memory walk otherwise

The Lambda enforces `flight_planner` or `admin` role from the API Gateway authorizer context. Released plans return 409 on PUT — release is immutable. Tenant scoping comes from the existing `tenantSlug` → `tenant_id` resolver in `shared/tenant.ts`.

**Feedback loop (Phase D)**: when `brief()` regenerates, it calls `loadPastBriefRejections(token)` which fetches from the Lambda's `GET /planning/rejection-comments?phase=brief&limit=10` when `NEXT_PUBLIC_API_URL` is set, else from the in-memory `listRejectionComments('brief', 10)`. Results pass into `PlanningAgent.summarize(facts, pastRejections)`. The agent appends a `PAST REJECTIONS — avoid these failure modes:` block to its system prompt with the comments verbatim (each pre-truncated to 500 chars as a prompt-injection defence — done in both the in-memory store and the Lambda's SQL response). The `source` field on the response surfaces `"… + N past rejections informed"` so reviewers can see the loop is closed. Lightweight RAG, not retraining.

**Planner sub-tools** (mounted via `components/PlannerTabs.tsx` on each `/planner/*` page):

| Page | API | Logic |
|---|---|---|
| `/planner` (Plans) | `[phase]` + `plans/[flightId]` + `…/reviews` | Per-flight stepper (Phases A–D above) |
| `/planner/divert` | `POST /api/planner/divert` | Rank every airport in `lib/icao.ts` against the destination by great-circle distance, runway adequacy (`requiredRunwayFt(aircraft)`), customs/fuel availability, ETOPS adequacy, and live METAR `fltCat`. When `etopsRequired` (cross-country twin + > 1,500 nm), non-ETOPS candidates take a heavy score penalty. Reason (`medical`/`mechanical`/`weather`/`fuel`) reweights the score further |
| `/planner/cascade` | `POST /api/planner/cascade` | Walks `ROTATIONS` in `lib/fleet.ts`, propagating delay forward. Slack between consecutive legs (`plannedGround − minGroundMin`) absorbs delay; otherwise it propagates fully to the next arrival |
| `/planner/tankering` | `POST /api/planner/tankering` | Compares origin vs. destination jet-A prices via the pluggable `lib/fuelprices.ts` façade (mock by default; FMS-style CSV via `FUEL_PRICE_PROVIDER=csv` + `FUEL_PRICE_CSV_URI=s3:// \| file:// \| https://`). Applies a 3.5%/hr burn-to-carry penalty against the trip from `lib/perf.ts`. Surfaces price components (base + diff + into-plane + tax), supplier, contract ref, and asOf when the feed provides them. Risk flags: MTOW headroom, thin margin, inverted differential, stale price (> 24h). Recommends `tanker` only when net > 0 |
| `/planner/mel` | `POST /api/planner/mel` | Cross-references the tail&rsquo;s deferred items from `lib/mel.ts` against the route. Auto-derives `oceanic` (Δlon > 30° + dist > 1500 nm), `etopsRequired` (oceanic + twin-engine type). Planner can override `knownIcing`, `imcBelowFreezing`, `thunderstormsForecast`, `destCatIIIRequired`, `arrivalIsNight` via the brief overrides toggle. Returns `{ conflicts: [{severity: block|warn}], advisories, mtowReductionKg, flCeiling, dispatchAllowed }` |
| `/planner/deconflict` | `GET /api/planner/deconflict` | Walks every rotation in `lib/fleet.ts` against `MAINTENANCE_WINDOWS` + `lib/crew.ts` (ROSTER + ASSIGNMENTS). 8 conflict types: `maintenance`, `unstaffed`, `unqualified`, `fdp_exceeded` (>14h), `flight_time_exceeded` (>9h), `insufficient_rest` (<10h), `double_booked` (broken leg chain), `base_mismatch` (warn). FDP/flight-time computed from `fuelEstimate.blockTimeMin` per leg + report/debrief buffers from `lib/crew.ts` |
| `/planner/eod` | `GET /api/planner/eod` | Read-only roll-up of plan statuses + reviews from `lib/planner-store.ts` plus the rotation catalogue. Pure aggregation, no agent calls |

`lib/fleet.ts` is the mock tail-rotation source — replace with a fleet-plan/OPSCALE adapter for prod.

**Airport reference** (`lib/icao.ts` + `lib/airports.json`): backed by an OurAirports import (~3,400 entries — every large/medium airport with a paved runway ≥ 6,000 ft worldwide). Regenerate with:

```bash
node scripts/import-ourairports.mjs
```

The script joins `airports.csv` + `runways.csv` from https://davidmegginson.github.io/ourairports-data/ and writes `lib/airports.json`. **Heuristic fields** (not in the source data — replace with Jeppesen for prod):
- `fireCat`: derived from airport size (large=9, medium=7)
- `customs`: `large_airport AND scheduled_service=yes`
- `fuel`: present iff size large OR scheduled, jet-a (US) / jet-a1 (rest)
- `etopsAlternate`: `large_airport AND scheduled_service AND ≥ 7,500 ft lit paved runway` — proxies the ETOPS-adequate set (~1,000 of the 3,448 entries). Real ETOPS dispatch also needs 24h customs/RFF/CAT II ILS; swap for Jeppesen JeppView or NavBlue for prod.

`country` (ISO 3166-1 alpha-2, e.g. `US`, `GB`, `JP`) is also exposed; the divert + MEL tools use it to detect oceanic routes (cross-country + > 1,500 nm). The diversion advisor uses `findCandidatesWithin(dest, 1000nm, requiredRunwayFt)` from `lib/perf.ts` to filter the pool before the METAR fetch — avoids hammering AviationWeather with 3,400-ICAO URLs.

**Important data note**: Duffel is *not* a planning data source — it's a retail booking aggregator and stays scoped to passenger search. Planning data must come from AviationWeather / FAA / a perf engine / fleet+crew systems.

### Pluggable enterprise integrations (`lib/integrations/`)

Per-tenant data feeds (fuel prices, MEL, crew, fleet, maintenance) flow through a small provider framework so the same dispatcher tool can consume mock data, an FMS CSV drop, or a live REST API without code changes.

- `lib/integrations/types.ts` — `Provider` interface (`name`, `healthCheck()`, optional `refresh()`)
- `lib/integrations/fetcher.ts` — URI-scheme dispatch: `s3://bucket/key`, `file:///abs/path`, `https://...`. The `s3://` path uses an opaque dynamic import so `@aws-sdk/client-s3` is **not** required at build time — install it only when an S3 source is configured
- `lib/integrations/cache.ts` — TTL cache attached to `globalThis`, request-coalescing in-flight promises (HMR-safe, same convention as `planner-store.ts`)
- `lib/integrations/csv.ts` — RFC-4180 CSV parser shared across domains
- `lib/integrations/secrets.ts` — secret reference resolver. Forms: `env://VAR`, `secretsmanager:arn:aws:secretsmanager:…` (opaque dynamic import — install `@aws-sdk/client-secrets-manager` only when used), or verbatim. Token rotation cadence is the provider's cache TTL

**Domain wiring** (fuel prices, MEL deferrals, and crew roster + assignments — all share the same shape):

```
lib/integrations/fuelprices/
  types.ts      → FuelPrice (FMS shape: components, currency, supplier, contractRef, asOf, validUntil, source)
  mock.ts       → MockFuelPriceProvider — wraps the original in-repo TABLE
  csv.ts        → CsvFuelPriceProvider  — reads any URI scheme, caches per uri
  api.ts        → ApiFuelPriceProvider  — REST + JWT/basic/header auth, envelope unwrap, FMS-shape mapping
  resolver.ts   → env-based selection (later: read from `integration_configs` per tenant)
lib/fuelprices.ts → public façade (`getFuelPrice`, `listFuelPrices`, `fuelPriceProviderHealth`)
```

**Env contract** (provider selection until the admin UI lands):

Common:
| Var | Purpose |
|---|---|
| `FUEL_PRICE_PROVIDER` | `mock` (default) \| `csv` \| `api_fms` |
| `FUEL_PRICE_CACHE_TTL` | seconds, default 60 |

CSV provider:
| Var | Purpose |
|---|---|
| `FUEL_PRICE_CSV_URI` | required: `s3://…`, `file://…`, or `https://…` |
| `FUEL_PRICE_CSV_AUTH` | optional `Authorization` header for https endpoints (e.g. `Bearer eyJ…`) |

API provider (`api_fms`):
| Var | Purpose |
|---|---|
| `FUEL_PRICE_API_URL` | required: full bulk endpoint URL |
| `FUEL_PRICE_API_AUTH_METHOD` | `bearer` (default) \| `basic` \| `header` |
| `FUEL_PRICE_API_TOKEN` | required: `env://VAR` \| `secretsmanager:arn:…` \| verbatim |
| `FUEL_PRICE_API_TOKEN_HEADER` | required when AUTH_METHOD=header (e.g. `X-API-Key`) |

CSV schema (FMS-shape — extras tolerated, missing optional columns OK):

```
icao,iata,supplier,jet_type,base_usd_usg,diff_usd_usg,into_plane_usd_usg,tax_usd_usg,
total_usd_usg,currency_local,total_local,as_of_utc,valid_until_utc,contract_ref
```

API JSON shape — bare array OR enveloped under `data` / `results` / `prices` / `items`. Each record uses either camelCase (`totalPerUSG`, `asOf`, `contractRef`) or the snake_case CSV field names — both are tolerated. `scripts/mock-fms-api.mjs` is a 50-line reference server for local testing; `scripts/sample-fuel-prices.csv` is the equivalent for the CSV provider.

**MEL deferrals** (`lib/integrations/mel/`):

```
MEL_PROVIDER             = mock (default) | csv | api_amos | api_trax | api_camo
MEL_CSV_URI              = s3://… | file://… | https://…
MEL_API_URL              = https://mis.airline.internal/deferrals
MEL_API_AUTH_METHOD      = bearer (default) | basic | header
MEL_API_TOKEN            = env://VAR | secretsmanager:arn:… | <verbatim>
```

Required CSV cols: `tail`, `mel_id`, `deferred_at`. Optional: `description`, `due_at`, `airframe_hours_at_open`, `airframe_cycles_at_open`, `parts_on_order`, `placard_installed`, `released_by`. Reference fixtures: `scripts/sample-mel-deferrals.csv`, `scripts/mock-mis-api.mjs` (port 4001).

**Crew** (`lib/integrations/crew/`) — two collections (roster + assignments) on independent caches because real systems export them on different cadences:

```
CREW_PROVIDER             = mock (default) | csv | api_sabre | api_jeppesen | api_aims
CREW_ROSTER_URI           = s3://…/roster.csv
CREW_ASSIGNMENTS_URI      = s3://…/assignments.csv
CREW_API_ROSTER_URL       = https://crew.airline.internal/roster
CREW_API_ASSIGNMENTS_URL  = https://crew.airline.internal/pairings
CREW_API_AUTH_METHOD      = bearer | basic | header
CREW_API_TOKEN            = env://VAR | secretsmanager:arn:… | <verbatim>
```

Roster CSV cols: `id`, `name`, `role` (CAP|FO), `base`, `type_ratings` (`,`/`|`-separated), `prior_fdp_min`, `prior_flight_time_min`, `rest_min_since_last_duty`, optional `license_number`, `medical_expires_at`, `line_check_expires_at`, `status` (active|sick|reserve|leave). Assignments CSV cols: `crew_id`, `flight`. Reference fixtures: `scripts/sample-crew-roster.csv`, `scripts/sample-crew-assignments.csv`, `scripts/mock-crew-api.mjs` (port 4002).

`lib/crew.ts` exposes async `getRoster()` / `getAssignments()` plus pure helpers (`crewById`, `assignmentsForFlight`, `flightsForCrew`) that operate on a fetched snapshot — callers fetch once per request, then walk the snapshot synchronously.

### AWS Serverless Backend (`infra/`)

**Schema**: `infra/db/migrations/` runs 4 migrations in order via the `migrate` Lambda — `001_schema.sql` (Aurora PostgreSQL base), `002_seed.sql` (10 airports, 10 airlines, 5 demo users, 6 sample flights with full seat inventory), `003_multi_tenant.sql` (tenants table + RLS policies), `004_flight_plans.sql` (flight_plans + flight_plan_reviews). `003_refresh_flight_dates.sql` is an idempotent ad-hoc data refresh and is *not* in the tracked migration list — run it manually when seeded flights fall into the past.

**Lambdas** (`infra/lambdas/`) — all TypeScript compiled to CommonJS. Bundle script (`scripts/bundle.js`) lists 9 handlers:
- `shared/db.ts` — singleton `pg.Pool` via RDS Proxy; credentials from Secrets Manager (`DB_SECRET_ARN` env var)
- `shared/response.ts` — standard HTTP helpers with CORS headers
- `shared/tenant.ts` — `resolveTenantId(slug)` for the multi-tenant SQL `app.tenant_id` setting
- `authorizer/` — Token Authorizer: validates NextAuth JWT using `NEXTAUTH_SECRET`, injects `{ userId, email, role, tenantSlug }` into API Gateway request context
- `users/` — register (bcrypt hash), login (bcrypt compare), get user, update role
- `flights/` — search (round-trip aware, filters by available seats), get flight, seat map
- `bookings/` — create (reserves seats, generates PNR), list, get, cancel (releases seats)
- `checkin/` — lookup by PNR or name, check-in (24h window enforced), boarding pass, flight checkin list
- `gate/` — flight list/detail, status FSM transitions, board passenger, manifest
- `admin/` — stats, paginated user/flight management, role update, soft-delete
- `planning/` — flight plan CRUD + review audit trail + EOD aggregator + Phase D rejection-comments retrieval (see "Persistence (Phase C)" above)
- `migrate/` — idempotent migration runner with a `schema_migrations` tracking table; SQL files are copied into the bundle by `scripts/bundle.js`

**Terraform** (`infra/terraform/`): VPC + NAT, Aurora Serverless v2, RDS Proxy, Secrets Manager, 8 product Lambda functions plus the migrate runner, API Gateway REST API with JWT Token Authorizer. Public routes: `POST /flights/search`, `GET /flights/{id}`, `POST /users/register`, `POST /users/login`. All other routes require the JWT authorizer.

**CI/CD**: `.github/workflows/deploy.yml` runs on push to `main` — the `test` job is currently commented out; `infra` and `frontend` jobs deploy Terraform and Vercel respectively.

### Next.js API routes → Lambda bridge

`app/api/flights/route.ts`, `app/api/bookings/route.ts`, `app/api/auth/register/route.ts` check `NEXT_PUBLIC_API_URL`:
- **Set** → forward request to the real Lambda endpoint with the session JWT as `Authorization: Bearer`
- **Unset** → fall back to `MockAdapter` or local mock response

`lib/api-client.ts` is a typed client for direct browser→API Gateway calls (used by staff pages).

`vercel.json` raises `maxDuration` to 30s for all `app/api/**` routes — the agent + Lambda-bridge routes can exceed Vercel's default cap.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXTAUTH_SECRET` | Yes | JWT signing — must match Lambda `NEXTAUTH_SECRET` env var |
| `NEXTAUTH_URL` | Yes | Full app URL (e.g. `https://app.vercel.app`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic SDK for all 4 agents + Claude assistant |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Google OAuth | Google sign-in |
| `NEXT_PUBLIC_API_URL` | No | API Gateway base URL; omit to use Duffel or mock |
| `DUFFEL_ACCESS_TOKEN` | No | Duffel API token (`duffel_test_…` for sandbox). When set and `NEXT_PUBLIC_API_URL` is unset, real flight search is used |
| `FAA_CLIENT_ID` / `FAA_CLIENT_SECRET` | No | FAA NOTAM Search API credentials. When unset, planner `brief` phase uses mocked NOTAMs (real METAR/TAF/SIGMET still flow from AviationWeather). |

## Testing patterns

Integration tests (`__tests__/integration/`) use `@jest-environment node` and call Next.js route handlers directly via `NextRequest`. Unit tests use jsdom.

**Anthropic SDK mock pattern** — jest.mock hoisting causes TDZ if `const mockFn = jest.fn()` is declared outside the factory. Always use the self-contained static pattern:

```ts
jest.mock('@anthropic-ai/sdk', () => {
  const create = jest.fn();
  return { __esModule: true, default: class MockAnthropic {
    static mockCreate = create;
    messages = { create };
  }};
});
import Anthropic from '@anthropic-ai/sdk';
const mockCreate = (Anthropic as any).mockCreate as jest.Mock;
```

Coverage is collected only from `core/`, `components/`, `utils/mockData.ts`, `app/search/`, and the three API routes — not from Next.js pages or Lambda code.

## TypeScript

The project runs in strict mode (`tsconfig.json`). All types live in `types/` — `airline.ts`, `flight.ts`, `booking.ts`, `roles.ts`. Lambda code compiles to CommonJS (`infra/lambdas/tsconfig.json`) separately from the Next.js build.
