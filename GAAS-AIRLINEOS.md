# AirlineOS GAAS — The Complete Reference

> **What this is**: a multi-tenant SaaS platform that any airline can sign up to and immediately get
> a working flight-dispatch operation. It combines a regulatory-grade dispatch engine, a pluggable
> integration layer (fuel, MEL, crew), a passenger-facing booking surface, and a generative-AI
> layer that learns each airline's operating habits over time.
>
> **Who it's for**: airline operations control centres (OCCs), dispatchers, gate agents, and
> passengers — all served from a single deployment, isolated by tenant.
>
> **Status**: a working dispatch core + 5 per-phase AI agents + per-tenant memory are live on `main`.
> Non-trivial gaps remain (wind-optimized routing, Form 7233-4 generator, conflict zones); see §11.

---

## Table of contents

1. [TL;DR — read this first](#1-tldr--read-this-first)
2. [The three layers explained](#2-the-three-layers-explained)
3. [Who uses what (personas + pages)](#3-who-uses-what-personas--pages)
4. [Multi-tenancy — how SaaS works here](#4-multi-tenancy--how-saas-works-here)
5. [Complete feature inventory](#5-complete-feature-inventory)
6. [**Architecture diagrams**](#6-architecture-diagrams)
7. [Onboarding a new airline (end-to-end walkthrough)](#7-onboarding-a-new-airline-end-to-end-walkthrough)
8. [Dispatch core — what the engines compute](#8-dispatch-core--what-the-engines-compute)
9. [GAAS AI layer — what the agents do](#9-gaas-ai-layer--what-the-agents-do)
10. [Installation](#10-installation)
11. [Configuration reference (every per-tenant knob)](#11-configuration-reference-every-per-tenant-knob)
12. [Testing](#12-testing)
13. [Pending items / roadmap](#13-pending-items--roadmap)
14. [Glossary](#14-glossary)
15. [Appendix — file map](#15-appendix--file-map)

---

## 1. TL;DR — read this first

AirlineOS is **one product, three layers**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 1 — Multi-tenant SaaS shell                                    │
│   Tenants, RBAC, JWT, Postgres RLS, admin UI, billing-ready.        │
│   Every airline = one row in `tenants`. All other data per-tenant.  │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 2 — Dispatch core (deterministic, regulated)                  │
│   The engines that compute the actual numbers — distance, fuel,     │
│   ETOPS, MEL, crew FDP, OpsSpecs, PBN. The legal output is here.    │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 3 — GAAS AI (re-phrasing, retrieval, memory)                  │
│   Five per-phase agents read the engines' facts and write the       │
│   dispatcher-facing narrative. RAG pulls past rejections + tenant   │
│   memory. Hard rule: agents NEVER invent numbers.                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Critical principle**: if Layer 3 is down, Layers 1+2 still work. The release packet has all
the regulated numbers; only the prose summary is missing. The AI augments — it does not gate.

---

## 2. The three layers explained

### Layer 1 — Multi-tenant SaaS shell

Everything an airline-as-a-customer needs:

| Component | What it does |
|---|---|
| `tenants` table | One row per airline. Slug, name, brand colours, logo. |
| NextAuth + JWT | Sign-in via email/Google, signed JWT carries `tenantSlug` + `role`. |
| RBAC middleware | `middleware.ts` gates routes by role (admin / flight_planner / gate_manager / etc). |
| Postgres RLS | Every per-tenant table enforces `tenant_id = current_setting('app.tenant_id')`. |
| Admin surface | `/admin` lets the airline configure itself without code changes. |
| Pluggable integrations | Fuel, MEL, crew feeds. Mock / CSV / API+JWT — selectable per tenant. |

You can serve 1 or 100 airlines from the same deployment. Adding a new tenant is a row insert plus
filling in their config — see §5.

### Layer 2 — Dispatch core

The regulated, deterministic engine that produces the legal artefact (the dispatch release).

The 8-phase OFP workflow:

```
1. Brief         METAR/TAF/SIGMET/NOTAM digestion + recommendation
2. Aircraft      Tail / MEL / ETOPS / critical fuel
3. Route         Filed route, distance, block time, cost index, PBN
4. Fuel          Trip + contingency + alternate + reserve + taxi (+ tankering)
5. W&B           Weight & balance, MTOW envelope
6. Crew          Roster, FDP/FTL, fatigue
7. Slot/ATC      CTOT, ICAO flight plan
8. Release       Joint operational control sign-off (FAR 121.533)
```

Plus seven sub-tools (divert advisor, cascade simulator, tankering, MEL impact, schedule deconflict,
NOTAM board, SIGMET overlay, fuel-price dashboard, EOD report).

Numbers come from these engines, in `lib/`:

| Engine | File | Computes |
|---|---|---|
| Perf table + great-circle | `perf.ts` | Distance, block time, cruise burn, fuel breakdown |
| ETOPS | `etops.ts` | EP, alternates, critical fuel, cargo fire bound |
| OpsSpecs loader | `ops-specs.ts` | Per-tenant fuel policy / minima / ETOPS auth / PBN / CI / authorized airports |
| PBN | `pbn.ts` | Required RNAV/RNP per route, validation against authorization |
| MEL | `mel.ts` | Restriction evaluation, dispatch legality |
| Crew | `crew.ts` | Roster, assignments, FDP |
| Crew fatigue | `crew-fatigue.ts` | 0–100 score from FDP/rest/timezone |
| TAF parser | `aviationweather.ts` | ETA ±1hr window check vs minima |
| Aircraft ontology | `shared/semantic/aircraft.ts` | Type / family / perf / ETOPS factors |

### Layer 3 — GAAS AI

"GAAS" = Generative AI as a Service. Five specialised agents, one per phase, each with its own prompt
and retrieval set:

| Agent | Phase | What it writes |
|---|---|---|
| `BriefAgent` | brief | Pre-flight WX/NOTAM briefing prose |
| `RouteAgent` | route | Route narrative + PBN compliance line |
| `FuelAgent` | fuel | Block-fuel decomposition + tankering note |
| `AircraftAgent` | aircraft | Tail/MEL/ETOPS narrative — most safety-critical |
| `ReleaseAgent` | release | Go/no-go synthesis, FAR 121.533 language |

Behind them:

- **RAG** (`lib/ai/rag.ts`) — pulls past rejection comments + SOPs + memory + incidents per call
- **Memory** (`lib/ai/memory.ts`) — operator-specific facts the airline curates over time
- **Vector store** (`lib/ai/vector-store.ts`) — pluggable: in-memory (dev) or pgvector (prod)
- **Embeddings** (`lib/ai/embeddings.ts`) — pluggable: mock / voyage / openai

The agents **augment** the engines. If an agent is rejected by the dispatcher, that rejection
becomes a memory and informs every future similar plan.

---

## 3. Who uses what (personas + pages)

### Five personas

| Persona | Role enum | What they do | Where they live in the app |
|---|---|---|---|
| Passenger | `passenger` | Book / check-in / boarding pass | `/`, `/results`, `/booking/*`, `/my-bookings` |
| Check-in agent | `checkin_agent` | PNR lookup, 24h window, bag check | `/checkin` |
| Gate manager | `gate_manager` | Status FSM, board passenger, manifest | `/gate` |
| Coordinator | `coordinator` | IROPS recovery, cross-flight rebooking | `/coordinator` |
| Flight planner / dispatcher | `flight_planner` | Build OFP, sign release, run sub-tools | `/planner`, `/planner/*` |
| Admin | `admin` | Configure the tenant | `/admin`, `/admin/*` |

In local dev, role is derived from the email prefix (`admin@…` → admin, `planner@…` → planner).
In production, role is set in the `users.role` column and propagated via JWT.

### Page-by-page (the planner role)

| Page | What it does | Layer |
|---|---|---|
| `/planner` | 8-phase per-flight stepper | 2 + 3 |
| `/planner/divert` | Alternate ranking with C055 + ETOPS + TAF window + authorizedAirports | 2 |
| `/planner/cascade` | Delay propagation through fleet rotations | 2 |
| `/planner/tankering` | Origin vs dest fuel-price tankering decision | 2 |
| `/planner/mel` | MEL conflict detection, dispatch legality | 2 |
| `/planner/deconflict` | 8 conflict types: maintenance, FDP, rest, double-book, … | 2 |
| `/planner/notams` | Categorised NOTAM board with severity | 2 |
| `/planner/sigmet` | World-map polygon overlay | 2 |
| `/planner/fuel-prices` | Per-airport price dashboard, CSV export | 2 |
| `/planner/eod` | End-of-day roll-up | 2 |

### Page-by-page (the admin role)

| Page | What they configure | Block of OpsSpec |
|---|---|---|
| `/admin` | Roster of users, roles, basic stats | — |
| `/admin/integrations` | Fuel-price / MEL / crew feed sources | — |
| `/admin/dispatcher-certs` | FAA / FOO certs, area + type quals, currency | — |
| `/admin/ops-specs` | Fuel policy / alt minima / ETOPS / PBN / CI / authorized airports | A030, A032, B044, C055, C063, B036 |
| `/admin/ai/memory` | **GAAS facts the agents retrieve via RAG** | (Layer 3) |

---

## 4. Multi-tenancy — how SaaS works here

### What "tenant" means

A tenant is one airline customer. It owns:

- Its own row in `tenants` (slug, brand)
- Its own users (`users.tenant_id`)
- Its own flights, bookings, plans, reviews, certs, OpsSpecs, integration configs, AI memory

Two airlines on the same deployment never see each other's data. Enforcement is at three layers:

### How isolation is enforced

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. JWT — every request carries tenantSlug in the signed token   │
│    NextAuth issues; API Gateway authorizer Lambda verifies.     │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. App-level resolver — shared/tenant.ts maps slug → UUID and   │
│    sets `app.tenant_id` on the Postgres session per request.    │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. RLS policies — every per-tenant table has                    │
│      USING (tenant_id = current_setting('app.tenant_id')::uuid) │
│    Postgres rejects cross-tenant SELECT/UPDATE/DELETE silently. │
└─────────────────────────────────────────────────────────────────┘
```

So even if a Lambda forgets to filter by `tenant_id`, the database physically refuses to return
another tenant's rows.

### What's per-tenant vs shared

| Per-tenant (RLS) | Shared (no tenant_id) |
|---|---|
| `tenants` (the row itself) | `airports` (~3,400 ICAO codes) |
| `users` | `airlines` (carrier registry) |
| `flights` | `aircraft_types` (ontology — code-resident) |
| `bookings` | `firs` (ontology — code-resident) |
| `flight_plans` + `flight_plan_reviews` | Anthropic / Voyage API (external) |
| `dispatcher_certifications` | AviationWeather / FAA NOTAM (external) |
| `ops_specs` | |
| `integration_configs` | |
| `vector_documents` (RAG corpus) | |
| `vector_retrievals` (audit log) | |

---

## 5. Complete feature inventory

This is the exhaustive list — every page, every API, every Lambda, every agent, every database table, every script. Each item links to where it's documented in depth (or stays here as a one-liner if it's small).

### 5.1 Passenger surface (the booking funnel)

| Feature | Page | What it does |
|---|---|---|
| Landing search | `/` (`app/page.tsx`) | Origin/destination/date form, single-trip vs round-trip, passenger count, cabin class. Submit → `/search/results`. |
| Natural-language search | Same page (Claude assistant button) | Free-form prompt → `SearchAgent` parses → flight search query |
| Search results | `/search/results` | Round-trip-aware, filterable, sortable. Shows price, layover, aircraft type, carrier brand |
| Flight detail / seat map | `/booking/seats?flightId=...` | Interactive seat-map (`components/SeatMap.tsx`) with class fences and price upgrade |
| Passenger details | `/booking/passengers` | Per-pax name/passport, contact info |
| Checkout | `/booking/checkout` | Price breakdown + ancillaries (bags, seat upgrade, lounge) |
| Confirmation | `/booking/confirmation` | PNR, e-ticket, calendar add, boarding pass preview |
| My bookings | `/my-bookings` | List active + past bookings |
| Booking detail | `/bookings/[pnr]` | View, cancel, modify (where allowed) |
| Public booking lookup | `/bookings` | PNR + last-name lookup (no login) |
| Recommendation upsell | Inline on results | `RecommendationAgent` proposes seat upgrade / loyalty offer / bundle |
| Customer support FAQ | Floating chat (`ClaudeAssistant`) | `SupportAgent` answers tenant-policy questions (cancel, baggage) |
| Disruption advice | Inline if delay/cancel detected | `DisruptionAgent` proposes rebook options + compensation rights |
| Booking state continuity | All booking pages | `utils/bookingStore.tsx` (React Context + localStorage) — refresh-safe |
| Email notifications | Server-side | `/api/email/booking-confirmation` and `/api/email/booking-cancellation` |
| Sign-in / sign-up | `/login`, `/register` | NextAuth credentials + Google OAuth |

### 5.2 Staff surfaces (operational pages)

| Page | Role | Feature inventory |
|---|---|---|
| `/checkin` | checkin_agent | PNR/name lookup, 24h window enforcement, bag count, boarding-group assignment, auto-print boarding pass |
| `/gate` | gate_manager | Flight list with status pills (Boarding/Departed/Delayed), per-flight detail with manifest, status FSM transitions (Scheduled → Boarding → Departed), individual passenger board action, total/checkedIn/boarded counters |
| `/coordinator` | coordinator | IROPS recovery: cross-flight rebooking dashboard, shows passengers stranded by cancellation, propose alternates from same-day rotation |
| `/planner` | flight_planner | The full 8-phase per-flight stepper (see §7.1) |
| `/planner/batch` | flight_planner | Schedule-wide batch planning across today's rotation |
| `/planner/divert` | flight_planner | Diversion advisor (see §7.6) |
| `/planner/cascade` | flight_planner | Delay propagation simulator |
| `/planner/tankering` | flight_planner | Tankering decision tool |
| `/planner/mel` | flight_planner | MEL impact assessment |
| `/planner/deconflict` | flight_planner | Schedule deconfliction (8 conflict types) |
| `/planner/notams` | flight_planner | NOTAM briefing board |
| `/planner/sigmet` | flight_planner | World-map polygon SIGMET overlay |
| `/planner/fuel-prices` | flight_planner | Per-airport fuel price dashboard with CSV export |
| `/planner/eod` | flight_planner | End-of-day operational roll-up report |

### 5.3 Admin surfaces (tenant configuration)

| Page | What admins control |
|---|---|
| `/admin` | Tenant overview, user list with role pills (filter by role), user role updates, soft-delete, basic stats (revenue, bookings, on-time %) |
| `/admin/integrations` | Per-tenant feeds: select provider (mock / CSV / API+JWT) for fuel-prices, MEL, crew. Test-connection button hits provider's healthCheck. |
| `/admin/dispatchers` | Roster of dispatchers, per-dispatcher cert details, area qualifications (`[userId]/areas`), type qualifications (`[userId]/types`), §121.463(c) currency dates |
| `/admin/ops-specs` | All seven OpsSpec blocks (see §6 step 3 / §10.1) |
| `/admin/ai/memory` | Per-tenant AI memory facts (scope / title / body / tags) |
| Tenant brand config | (Set on `tenants` table) | Primary colour, logo URL, name, AI personality, supported languages, loyalty programme on/off |

### 5.4 The ten agents

Six are wired through the planner workflow (one orchestrator, five specialised); four serve passenger flows.

| Agent | File | Where used |
|---|---|---|
| `BriefAgent` | `core/agents/planning/BriefAgent.ts` | `brief` phase — METAR/TAF/SIGMET/NOTAM digestion |
| `RouteAgent` | `core/agents/planning/RouteAgent.ts` | `route` phase — distance/CI/PBN narrative |
| `FuelAgent` | `core/agents/planning/FuelAgent.ts` | `fuel` phase — block-fuel decomposition + tankering |
| `AircraftAgent` | `core/agents/planning/AircraftAgent.ts` | `aircraft` phase — tail/MEL/ETOPS narrative |
| `ReleaseAgent` | `core/agents/planning/ReleaseAgent.ts` | `release` phase — go/no-go synthesis |
| `PlanningAgent` (legacy) | `core/agents/PlanningAgent.ts` | Kept for back-compat; will be removed once all phases migrated to per-phase agents |
| `SearchAgent` | `core/agents/SearchAgent.ts` | Natural-language flight search query parsing |
| `RecommendationAgent` | `core/agents/RecommendationAgent.ts` | Upsell / bundle / loyalty recommendations |
| `SupportAgent` | `core/agents/SupportAgent.ts` | Customer support FAQ scoped to tenant policies |
| `DisruptionAgent` | `core/agents/DisruptionAgent.ts` | Delay / cancellation recovery advice |

All agents extend `BaseAgent` (`core/agents/base.ts`) which:
- Uses `claude-sonnet-4-6` by default
- Substitutes `{airline}` from the tenant brand
- Appends tone (formal / friendly / concise) per `tenant.aiPreferences.tone`
- Injects cancellation + baggage policies from tenant config
- Adds passenger personalisation (preferred cabin / seat / frequent routes) when context carries it

The planning agents extend `PlanningBaseAgent` which adds RAG retrieval + audit metadata.

### 5.5 Adapter pattern (multi-source flight data)

`core/adapters/` abstracts flight search / seat map / booking CRUD behind one `AirlineAdapter` interface (`core/adapters/types.ts`). Selection logic in `core/adapters/registry.ts`:

| Adapter | When | What it does |
|---|---|---|
| `MockAdapter` (`core/adapters/mock/`) | `NEXT_PUBLIC_API_URL` and `DUFFEL_ACCESS_TOKEN` both unset | In-memory deterministic flights for dev |
| `DuffelAdapter` (`core/adapters/duffel/`) | `DUFFEL_ACCESS_TOKEN` set, `NEXT_PUBLIC_API_URL` unset | Real flight inventory via `@duffel/api`; supports order placement |
| Real Lambda backend | `NEXT_PUBLIC_API_URL` set | Forwards to API Gateway → Lambda → Aurora |

`AdapterRegistry` allows per-tenant adapter selection (a tenant could be on Duffel, another on a custom GDS feed).

### 5.6 Pluggable enterprise integrations

Three domains, each with the same provider-pattern (mock / CSV / API+JWT). Files in `lib/integrations/`:

| Domain | Provider modes | Public façade |
|---|---|---|
| Fuel prices | `mock`, `csv`, `api_fms` | `lib/fuelprices.ts` |
| MEL deferrals | `mock`, `csv`, `api_amos`, `api_trax`, `api_camo` | `lib/mel.ts` |
| Crew (roster + assignments) | `mock`, `csv`, `api_sabre`, `api_jeppesen`, `api_aims` | `lib/crew.ts` |

Shared utilities (`lib/integrations/`):
- `types.ts` — `Provider` interface (`name`, `healthCheck()`, optional `refresh()`)
- `fetcher.ts` — URI-scheme dispatch: `s3://`, `file://`, `https://`. S3 uses opaque dynamic import so `@aws-sdk/client-s3` is only required when actually used
- `cache.ts` — TTL cache attached to `globalThis`, request-coalescing in-flight promises (HMR-safe)
- `csv.ts` — RFC-4180 CSV parser
- `secrets.ts` — secret reference resolver: `env://VAR` / `secretsmanager:arn:…` / verbatim
- `config-store.ts` — process-scoped persistent integration config (HMR-safe `globalThis` Map). Resolvers consult store first, fall back to env vars

Reference scripts:
- `scripts/sample-fuel-prices.csv`, `scripts/mock-fms-api.mjs` (port 4000)
- `scripts/sample-mel-deferrals.csv`, `scripts/mock-mis-api.mjs` (port 4001)
- `scripts/sample-crew-roster.csv`, `scripts/sample-crew-assignments.csv`, `scripts/mock-crew-api.mjs` (port 4002)

### 5.7 Reference data + ontologies

| Source | File(s) | Records | Purpose |
|---|---|---|---|
| Airports | `lib/icao.ts` + `lib/airports.json` | ~3,400 | Every large/medium ICAO airport with paved runway ≥ 6,000 ft |
| Airport import | `scripts/import-ourairports.mjs` | — | Joins OurAirports `airports.csv` + `runways.csv` + verified-data supplements |
| Verified-data supplements | `scripts/airport-supplements.json` | ~500 | Real fireCat / customs24h / fuelTypes for top busiest; flagged `dataQuality: 'verified'` |
| Aircraft ontology | `shared/semantic/aircraft.ts` | 24+ types | ICAO/IATA/marketing/family/aliases + perf + ETOPS factors |
| Airline ontology | `shared/semantic/airline.ts` | 25+ carriers | ICAO/IATA/callsign + alliance + hubs |
| FIR ontology | `shared/semantic/fir.ts` | 60+ FIRs | CONUS ARTCCs + oceanic centres + European/Asian/Pacific |
| Demo fleet | `lib/fleet.ts` | mocked tail rotations | Replace with fleet adapter in prod |

### 5.8 Components inventory

`components/`:

| Component | Purpose |
|---|---|
| `AirlineLogo.tsx` | Tenant-aware branded carrier logo |
| `AutoPrepareProgress.tsx` | NDJSON-streamed live phase progress for batch planning |
| `ClaudeAssistant.tsx` | Floating freeform Claude chat (passenger surface) |
| `FlightCard.tsx` | Flight result row (passenger + planner reuse) |
| `Navbar.tsx` | Role-aware nav (different links per role, role badge) |
| `PlannerTabs.tsx` | Tab strip across all `/planner/*` sub-tools |
| `PriceSummary.tsx` | Booking price breakdown |
| `SeatMap.tsx` | Interactive seat selector with class fences |
| `SigmetMap.tsx` | Leaflet world map for SIGMET overlay |

### 5.9 Database schema (every migration)

`infra/db/migrations/`:

| Migration | What it adds |
|---|---|
| `001_schema.sql` | Base: airports, airlines, users, flights, seats, bookings |
| `002_seed.sql` | 10 airports, 10 airlines, 5 demo users, 6 sample flights with full seat inventory |
| `003_multi_tenant.sql` | `tenants` table + RLS policies on per-tenant tables |
| `003_refresh_flight_dates.sql` | Idempotent ad-hoc data refresh — moves seeded flight dates forward (not in tracked list) |
| `004_flight_plans.sql` | `flight_plans` + `flight_plan_reviews` |
| `005_integration_configs.sql` | Per-tenant integration configs (provider + URL + token-ref) |
| `006_add_flight_planner_user.sql` | Adds `flight_planner` role + demo user |
| `007_flight_plans_text_id.sql` | Relax `flight_id` to TEXT (transitional) |
| `008_flight_plans_uuid_id.sql` | Restore `flight_id` to UUID + FK once real UUIDs flow |
| `009_dispatcher_certifications.sql` | Cert table + currency dates + RLS |
| `010_ops_specs.sql` | OpsSpecs table — 7 JSONB blocks, RLS, per-tenant default seed |
| `011_pbn_oceanic_defaults.sql` | Backfill RNP-4 + RNP-10 onto existing tenants (idempotent) |
| `012_ai_corpus.sql` | pgvector extension, `vector_documents` (1024-dim, IVFFlat cosine), `vector_retrievals` audit log, RLS |

### 5.10 Backend Lambdas

`infra/lambdas/`:

| Lambda | Routes | Purpose |
|---|---|---|
| `authorizer/` | (Token Authorizer) | Validates NextAuth JWT using `NEXTAUTH_SECRET`, injects `{userId, email, role, tenantSlug}` into API GW request context |
| `users/` | register, login, get-user, update-role | bcrypt hashing, NextAuth-compatible JWT issue |
| `flights/` | search, get-flight, seat-map, /flights/own-today | Round-trip-aware search filtered by available seats; `own-today` returns the carrier's flights with resolved aircraft ICAO via the ontology |
| `bookings/` | create, list, get, cancel | Reserves seats, generates PNR, releases on cancel |
| `checkin/` | lookup, check-in, boarding-pass, flight-checkin-list | 24h window enforced |
| `gate/` | flight list/detail, status-FSM transitions, board passenger, manifest | |
| `admin/` | stats, paginated user/flight management, role update, soft-delete | |
| `dispatchers/` | get/upsert certs, areas, types, currency | Backed by migration 009 |
| `integrations/` | per-tenant config CRUD, ops-specs CRUD, vector store endpoints (scaffold) | |
| `planning/` | flight plan CRUD + review audit + EOD aggregator + Phase-D rejection-comments retrieval | |
| `migrate/` | Idempotent migration runner with `schema_migrations` table | |
| `shared/` | `db.ts` (singleton pg.Pool via RDS Proxy + Secrets Manager), `response.ts` (CORS helpers), `tenant.ts` (slug → UUID + RLS setting) | |

### 5.11 Next.js API routes (the bridge layer)

`app/api/`:

| Route | Behaviour |
|---|---|
| `/api/auth/[...nextauth]` | NextAuth handlers (credentials + Google) |
| `/api/auth/register` | Registers a user via Lambda or local mock |
| `/api/agents` | Routes intent → orchestrator (search / recommend / support / disrupt) |
| `/api/claude` | Direct Anthropic proxy for `ClaudeAssistant` |
| `/api/airports/suggest` | Typeahead for ICAO/IATA |
| `/api/duffel/orders` | Place real bookings via Duffel |
| `/api/email/booking-confirmation` | Server-side email send |
| `/api/email/booking-cancellation` | Server-side email send |
| `/api/flights/*` | Bridge to Lambda; fall back to mock |
| `/api/flights/own` | Carrier's own scheduled flights for the planner |
| `/api/bookings/*` | Bridge to Lambda; fall back to mock |
| `/api/tenant/*` | Tenant brand + AI preferences config |
| `/api/planner/[phase]` | Per-phase dispatcher (calls `runAgent`) |
| `/api/planner/plans/[flightId]` | Plan CRUD + reviews append |
| `/api/planner/auto-prepare` + `[runId]` | NDJSON-streamed batch planning |
| `/api/planner/divert` | Divert advisor (engines + agent narrative) |
| `/api/planner/cascade` | Delay cascade |
| `/api/planner/tankering` | Tankering decision |
| `/api/planner/mel` | MEL impact |
| `/api/planner/deconflict` | Schedule deconfliction |
| `/api/planner/notams` | Categorised NOTAM board |
| `/api/planner/sigmet` | SIGMET feed + classification |
| `/api/planner/fuel-prices` | Fuel-price dashboard data |
| `/api/planner/eod` | End-of-day roll-up |
| `/api/admin/dispatchers/*` | Cert + currency CRUD |
| `/api/admin/ops-specs` | OpsSpecs CRUD |
| `/api/admin/integrations/[kind]` + `[kind]/test` | Integration config CRUD + test-connection |
| `/api/admin/ai/memory` | GAAS memory facts CRUD |
| `/api/debug/auth` | Dev-only: dump session + JWT for debugging |

### 5.12 Tenant config schema

`types/tenant.ts` defines the per-tenant config the agents consume. Editable via `/api/tenant/[tenantId]`:

```jsonc
{
  "brand": {
    "name": "Aerospica Airlines",
    "primaryColor": "#0A2342",
    "logoUrl": "https://..."
  },
  "aiPreferences": {
    "tone": "formal",                    // formal | friendly | concise
    "agentPersonality": "Senior dispatcher voice. Lead with operational impact.",
    "supportedLanguages": ["en", "es"],
    "cancellationPolicyText": "Refundable up to 24h before departure...",
    "baggagePolicyText": "1 carry-on + 1 checked included; extra bags $50."
  },
  "policies": {
    "pricing": { "markupPercent": 0 }
  },
  "features": {
    "loyaltyProgram": true
  }
}
```

The `BaseAgent` injects all of this into every prompt — every tenant's agents speak in the tenant's voice, scoped to the tenant's policies.

### 5.13 Auto-prepare workflow (live-streamed batch planning)

A planner can click **Auto-prepare** on `/planner` to run all 7 prep phases for a single flight, or hit `/planner/batch` to run them across the schedule. The endpoint streams progress over NDJSON (`{phase, status, summary}` lines) and the UI updates phase-by-phase via `components/AutoPrepareProgress.tsx`. After completion the planner reviews each phase and approves or rejects; rejections feed back into the GAAS memory.

### 5.14 Email subsystem

`/api/email/booking-*` route handlers send transactional emails via Resend (or SES, swap by env). Templates inline.

### 5.15 NextAuth + role system

`auth.ts` with two providers:
- **Credentials** — email/password, hashes via bcrypt (Lambda) or local-dev shortcut by email prefix
- **Google OAuth** — when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set

Custom `jwt.encode` / `jwt.decode` callbacks using `jose` HS256 — required because the Lambda authorizer uses `jsonwebtoken.verify` which only handles JWS, not the JWE that NextAuth defaults to.

Six roles in `types/roles.ts`: `passenger`, `checkin_agent`, `gate_manager`, `coordinator`, `flight_planner`, `admin`. `ROUTE_ROLES` in `middleware.ts` gates every staff page. The `Navbar` renders different links per role and a role badge.

### 5.16 Test infrastructure

`__tests__/`:

| Suite | Convention | What |
|---|---|---|
| `__tests__/integration/` | `@jest-environment node` | Calls Next.js route handlers directly via `NextRequest` |
| `__tests__/unit/` | jsdom default | Component + utility tests |
| Coverage thresholds | 70% branches, 80% lines/functions/statements | From `core/`, `components/`, `utils/mockData.ts`, `app/search/`, three API routes |
| Anthropic SDK mock | Self-contained static pattern (in factory) | Avoids jest hoisting TDZ |

Run:
```bash
npm test                          # all
npm run test:watch                # watch
npm run test:coverage             # with thresholds
npx jest --testPathPattern=Form   # single file
NODE_ENV=test npx jest --runInBand  # CI mode
```

### 5.17 CI/CD

`.github/workflows/deploy.yml`:

| Job | Trigger | What |
|---|---|---|
| `test` | (currently commented out) | Jest with coverage thresholds |
| `infra` | Push to `main` | `terraform apply` against AWS |
| `frontend` | Push to `main` | `vercel --prod` |

Vercel additionally builds on every PR for preview URLs.

### 5.18 Custom Claude Code skills

`.claude/commands/`:
- `/add-airline` — scaffolds a new airline adapter into `core/adapters/`
- `/run-agent` — invokes an agent intent against the local dev server

### 5.19 Branding + multi-brand UI

Tenant brand fields (`tenants.brand_primary_color`, `brand_logo_url`, `name`) drive:
- `Navbar` colour accent + logo
- `AirlineLogo` component substitution
- Email template colours + logo
- Booking confirmation page brand
- Agent system prompts ("{airline}" placeholder replaced)

A future "white-label domain" feature would map `aerospica.airlineos.app` → `tenant_id=aerospica` automatically — not yet built.

### 5.20 Demo data

`utils/mockData.ts` exposes a deterministic 50-flight schedule, 10 carriers, 10 airports for the passenger surface when no backend is configured. Used by tests and local dev. Seed migration `002_seed.sql` populates the same shape into Postgres.

---

## 6. Architecture diagrams

All diagrams below render as Mermaid on GitHub and most modern markdown viewers. They are the
visual companion to §2–§5 — read them in this order:

- **6.1** Three-layer architecture (the big picture)
- **6.2** AWS + Vercel infrastructure topology
- **6.3** Multi-tenant request flow (how isolation works on the wire)
- **6.4** Persona × page × backend matrix
- **6.5** Multi-agent + RAG flow (what happens when a planner clicks "Brief")
- **6.6** GAAS reuse map (which agents share the substrate, which don't)
- **6.7** RAG pipeline detail
- **6.8** Tenant onboarding sequence

### 6.1 Three-layer architecture

The single most important picture. Layer 3 augments Layer 2; if Layer 3 is down, Layers 1+2
still produce a legal release with all numbers — the prose summary is the only thing missing.

```mermaid
flowchart TB
    subgraph L3["Layer 3 — GAAS AI (re-phrasing + retrieval)"]
        direction LR
        BA[BriefAgent] --- RA[RouteAgent] --- FA[FuelAgent] --- AA[AircraftAgent] --- REL[ReleaseAgent]
        ORCH[PlannerOrchestrator]
        BA --> ORCH
        RA --> ORCH
        FA --> ORCH
        AA --> ORCH
        REL --> ORCH
        subgraph SUB["GAAS Substrate (lib/ai/)"]
            direction LR
            RAG[RAG Retrieval] --- MEM[Tenant Memory] --- VEC[Vector Store] --- EMB[Embeddings]
        end
        ORCH --> RAG
        RAG --> VEC
        MEM --> VEC
        VEC --> EMB
    end

    subgraph L2["Layer 2 — Dispatch core (deterministic, regulated)"]
        direction LR
        PERF[Perf / great-circle]
        ETOPS[ETOPS critical fuel]
        OPSP[OpsSpecs loader]
        PBN[PBN validator]
        MEL[MEL]
        CREW[Crew + Fatigue]
        TAF[TAF window parser]
        ONT[Ontologies: aircraft / airline / FIR / airport]
    end

    subgraph L1["Layer 1 — SaaS shell (multi-tenant)"]
        direction LR
        TENANTS[(tenants)]
        USERS[(users)]
        JWT[NextAuth JWT HS256]
        RBAC[Route RBAC middleware]
        RLS[Postgres RLS policies]
        ADAPT[Adapters: Mock / Duffel / Lambda]
        INTEG[Pluggable integrations: fuel / MEL / crew]
        BRAND[Brand + AI prefs config]
    end

    L3 -->|reads facts| L2
    L2 -->|reads tenant config| L1
    L3 -.->|writes audit log| L1
```

### 6.2 AWS + Vercel infrastructure

Provisioned by Terraform (`infra/terraform/`). Frontend on Vercel; everything regulated /
stateful in AWS. Anthropic + Voyage are the only external AI dependencies; everything else
flows through tenant-configured integrations.

```mermaid
flowchart LR
    subgraph CLIENT["Client"]
        Browser
    end

    subgraph VERCEL["Vercel (Edge / Fluid Compute)"]
        NextJS["Next.js App Router<br/>app/page.tsx + app/planner/**<br/>+ app/admin/**"]
        Bridge["API Routes Bridge<br/>app/api/**/route.ts"]
    end

    subgraph AWS["AWS Region"]
        APIGW["API Gateway REST<br/>+ JWT Token Authorizer"]
        AuthFn["authorizer Lambda<br/>(jose HS256)"]

        subgraph FNS["Product Lambdas (Node.js 22)"]
            direction LR
            UsersFn[users]
            FlightsFn[flights]
            BookingsFn[bookings]
            CheckinFn[checkin]
            GateFn[gate]
            AdminFn[admin]
            DispFn[dispatchers]
            IntegFn[integrations]
            PlanFn[planning]
            MigFn[migrate]
        end

        subgraph DATA["Data plane (private subnet)"]
            RDSProxy["RDS Proxy"]
            Aurora["(Aurora<br/>Serverless v2<br/>+ pgvector)"]
            Secrets["Secrets Manager"]
        end

        VPC["VPC + NAT"]
    end

    subgraph EXTAI["External AI"]
        direction TB
        Anthropic["Anthropic<br/>claude-sonnet-4-6"]
        Voyage["Voyage AI<br/>voyage-3 embeddings"]
    end

    subgraph EXT["External data feeds (per-tenant config)"]
        direction TB
        AvWX[aviationweather.gov]
        FAA[FAA NOTAM Search]
        Duffel[Duffel API]
        FuelAPI["Tenant fuel-price API<br/>(api_fms / CSV)"]
        MELAPI["Tenant MEL API<br/>(AMOS / TRAX / CAMO)"]
        CrewAPI["Tenant crew API<br/>(Sabre / Jeppesen / AIMS)"]
    end

    Browser <--> NextJS
    NextJS <--> Bridge
    Bridge -->|JWT| APIGW
    Bridge --> Anthropic
    Bridge --> Voyage
    Bridge --> AvWX
    Bridge --> FAA
    Bridge --> Duffel
    Bridge --> FuelAPI
    Bridge --> MELAPI
    Bridge --> CrewAPI
    APIGW --> AuthFn
    AuthFn -->|inject userId, role,<br/>tenantSlug| APIGW
    APIGW --> FNS
    FNS --> RDSProxy
    RDSProxy --> Aurora
    RDSProxy --> Secrets
    FNS -.runs in.-> VPC
```

### 6.3 Multi-tenant request flow

The single picture that answers "how does AirlineOS prevent tenant A from seeing tenant B's
data?" Three independent enforcement layers — JWT, app-level resolver, Postgres RLS — must
all align for a row to be returned.

```mermaid
sequenceDiagram
    participant B as Browser
    participant V as Vercel<br/>Next.js
    participant G as API Gateway
    participant AZ as Authorizer<br/>Lambda
    participant L as Product<br/>Lambda
    participant PG as Aurora<br/>(RLS enforced)

    B->>V: GET /planner with NextAuth cookie
    V->>V: NextAuth verify JWT (HS256, jose)
    V->>G: forward request, Authorization: Bearer <jwt>
    G->>AZ: validate token
    AZ-->>G: { userId, role, tenantSlug }
    G->>L: invoke with request context
    L->>L: resolveTenantId(tenantSlug) → UUID
    L->>PG: SET LOCAL app.tenant_id = '<uuid>'
    L->>PG: SELECT * FROM flight_plans
    Note over PG: RLS policy:<br/>USING (tenant_id = current_setting('app.tenant_id'))
    PG-->>L: ONLY this tenant's rows
    L-->>G: response
    G-->>V: response
    V-->>B: JSON
```

### 6.4 Persona × page × backend

Who hits which page, which page hits which backend, which backend hits which engines.

```mermaid
flowchart LR
    subgraph PERS["Personas"]
        P1[Passenger]
        P2[Check-in agent]
        P3[Gate manager]
        P4[Coordinator]
        P5[Flight planner]
        P6[Admin]
    end

    subgraph PAGES["Pages"]
        Home["/"]
        Search["/search/results"]
        Booking["/booking/*"]
        Checkin["/checkin"]
        Gate["/gate"]
        Coord["/coordinator"]
        Planner["/planner"]
        SubTools["/planner/*"]
        Admin["/admin/*"]
    end

    subgraph APIS["Bridge APIs"]
        FlightsAPI["/api/flights"]
        BookAPI["/api/bookings"]
        AgentsAPI["/api/agents"]
        PhaseAPI["/api/planner/[phase]"]
        ToolsAPI["/api/planner/{divert,cascade,...}"]
        AdminAPI["/api/admin/*"]
    end

    subgraph BACK["Backend (Lambda or in-process)"]
        FlightsBE[flights Lambda]
        BookBE[bookings Lambda]
        Agents[Search/Recommendation/<br/>Support/Disruption agents]
        PlanAgents[5 Planning Agents<br/>via Orchestrator]
        Engines[Deterministic engines<br/>perf / etops / pbn / mel / ...]
        AdminBE[admin / integrations / dispatchers / planning Lambdas]
    end

    P1 --> Home
    P1 --> Search
    P1 --> Booking
    P2 --> Checkin
    P3 --> Gate
    P4 --> Coord
    P5 --> Planner
    P5 --> SubTools
    P6 --> Admin

    Home --> AgentsAPI
    Search --> FlightsAPI
    Booking --> BookAPI
    Booking --> AgentsAPI
    Checkin --> AdminAPI
    Gate --> AdminAPI
    Coord --> AdminAPI
    Planner --> PhaseAPI
    SubTools --> ToolsAPI
    Admin --> AdminAPI

    AgentsAPI --> Agents
    FlightsAPI --> FlightsBE
    BookAPI --> BookBE
    PhaseAPI --> PlanAgents
    PhaseAPI --> Engines
    ToolsAPI --> Engines
    AdminAPI --> AdminBE
```

### 6.5 Multi-agent + RAG flow (the planner clicks "Brief")

The end-to-end of one phase invocation. Engines compute facts deterministically; the agent
re-phrases with retrieval context; the rejection feedback loop self-improves over time.

```mermaid
sequenceDiagram
    participant U as Flight Planner
    participant UI as /planner
    participant API as /api/planner/brief
    participant Eng as Deterministic Engines
    participant Orch as PlannerOrchestrator
    participant BA as BriefAgent
    participant RAG as RAG Retrieval
    participant Vec as Vector Store
    participant Emb as Embeddings
    participant LLM as Claude Sonnet
    participant DB as Aurora<br/>+ pgvector

    U->>UI: pick BA1000, click Brief
    UI->>API: POST {flight}
    API->>Eng: fetch METAR/TAF/SIGMET/NOTAM
    Eng-->>API: facts (numbers only, no narrative)
    API->>API: extract tenantId from JWT
    API->>API: backfill rejection comments → Vec (idempotent)
    API->>Orch: runAgent(phase=brief, facts, ctx)
    Orch->>BA: BriefAgent.run(facts, ctx)
    BA->>RAG: retrieveContext(tenantId, query, kinds)
    RAG->>Emb: embed(query)
    Emb-->>RAG: vector
    RAG->>Vec: search(tenantId, vector, kinds, phase)
    Vec->>DB: cosine similarity SELECT (RLS scoped)
    DB-->>Vec: top-N matches
    Vec-->>RAG: results
    RAG->>RAG: recency re-rank (30-day half-life)
    RAG->>RAG: format named blocks, truncate 500ch
    RAG-->>BA: systemSuffix + audit list
    BA->>LLM: messages.create(system + suffix, user=facts)
    LLM-->>BA: 120-word brief prose
    BA->>DB: write vector_retrievals row (audit)
    BA-->>Orch: {text, retrievalSource, retrievedDocIds}
    Orch-->>API: AgentResult
    API-->>UI: {summary, data, source}
    UI-->>U: rendered briefing

    rect rgb(255, 245, 225)
    Note over U,DB: Feedback loop:<br/>If planner rejects with comment,<br/>comment auto-embeds → next plan retrieves it
    end
```

### 6.6 GAAS reuse map (answers "is GAAS reused?")

The GAAS substrate (RAG / memory / vector store / embeddings) is **reusable** by every agent
on the platform, but is **currently consumed only by the 5 planning agents**. The 4 customer-
facing agents extend the older `BaseAgent` directly without RAG. Migrating them is mechanical
once the retrieval set per agent is decided.

```mermaid
flowchart TB
    subgraph SUB["GAAS substrate — reusable across all agents"]
        direction LR
        RAG[lib/ai/rag.ts]
        MEM[lib/ai/memory.ts]
        VS[lib/ai/vector-store.ts]
        EMB[lib/ai/embeddings.ts]
    end

    subgraph BASE["BaseAgent (core/agents/base.ts)"]
        direction TB
        BASESYS["Anthropic SDK + tenant brand<br/>+ tone + policies + passenger profile"]
    end

    subgraph PB["PlanningBaseAgent (extends BaseAgent)"]
        direction TB
        PBA["Adds: phase + retrievalKinds<br/>+ RAG retrieval + audit metadata"]
    end

    subgraph WIRED["✅ Currently consume GAAS substrate"]
        direction LR
        BriefA[BriefAgent]
        RouteA[RouteAgent]
        FuelA[FuelAgent]
        AcftA[AircraftAgent]
        RelA[ReleaseAgent]
    end

    subgraph NOTYET["⏳ Could plug in but don't yet"]
        direction LR
        SrcA[SearchAgent]
        RecA[RecommendationAgent]
        SupA[SupportAgent]
        DisA[DisruptionAgent]
    end

    BASE --> PB
    PB --> WIRED
    WIRED --> SUB

    BASE --> NOTYET
    NOTYET -.->|future: extend PlanningBaseAgent<br/>and define retrievalKinds| SUB
```

The mechanics for migrating any of the 4 customer-facing agents:

1. Change `extends BaseAgent` → `extends PlanningBaseAgent`
2. Declare `readonly phase = 'support'` (or appropriate)
3. Declare `readonly retrievalKinds = ['policy', 'faq', 'memory']` (custom kinds)
4. Pass `tenantId` in context when calling
5. Done — RAG context flows automatically

Use cases that would benefit:
- **SupportAgent** — pull tenant's cancellation/baggage/refund policies as `kind='policy'` instead of stuffing them into every system prompt
- **DisruptionAgent** — retrieve past `kind='irops_playbook'` resolutions so the agent learns operator-specific re-accommodation patterns
- **RecommendationAgent** — pull `kind='upsell_pattern'` from approved past upsells per tenant

### 6.7 RAG pipeline detail

The exact transformation from facts to a retrieval-augmented prompt.

```mermaid
flowchart LR
    F["facts (deterministic)<br/>{flight, origin, dest,<br/>metars, sigmets, notams}"]
    Q["queryFromFacts()<br/>'BA1000 KJFK→EGLL,<br/>3 SIGMETs, 6 NOTAMs'"]
    EMB["Embed query<br/>(mock / voyage / openai)"]
    SEARCH["VectorStore.search<br/>+ tenant_id filter<br/>+ kind filter<br/>+ phase filter<br/>+ minScore"]
    TOPN["Top 2N raw matches"]
    RERANK["Recency re-rank<br/>0.6 + 0.4 × 0.5^(ageDays/30)"]
    GROUP["Group by kind:<br/>REJECTIONS<br/>OPSPEC<br/>SOPs<br/>REGULATIONS<br/>MEMORY<br/>INCIDENTS"]
    TRUNC["Truncate each<br/>to 500 chars<br/>(anti-injection)"]
    SUFFIX["systemSuffix<br/>(quoted reference,<br/>NOT instructions)"]
    PROMPT["system + suffix +<br/>user=JSON.stringify(facts)"]
    LLM["Anthropic.messages.create"]
    OUT["text + retrievalSource +<br/>retrievedDocIds"]
    AUDIT["INSERT INTO vector_retrievals<br/>(tenant, flight, phase,<br/>query, retrieved, agent)"]

    F --> Q --> EMB --> SEARCH --> TOPN --> RERANK --> GROUP --> TRUNC --> SUFFIX --> PROMPT --> LLM --> OUT
    OUT --> AUDIT
```

### 6.8 Tenant onboarding sequence

The lifecycle from "Aerospica wants in" to "they're dispatching flights" — the SaaS path.

```mermaid
sequenceDiagram
    participant Ops as Platform Ops
    participant DB as Aurora
    participant TA as Tenant Admin<br/>(Aerospica)
    participant UI as /admin
    participant FP as Flight Planner<br/>(Aerospica)
    participant Planner as /planner

    Ops->>DB: INSERT INTO tenants (slug='aerospica', ...)
    Note over DB: Migration 010 + 011 + 012<br/>auto-seed defaults
    Ops->>DB: INSERT users (role='admin', tenant_id=...)
    TA->>UI: sign in → JWT carries tenantSlug
    TA->>UI: /admin/ops-specs → fill 7 blocks
    Note over TA,UI: fuel policy, alt minima C055,<br/>ETOPS B044, PBN, CI, auth airports
    TA->>UI: /admin/integrations → wire fuel + MEL + crew
    Note over TA,UI: api_fms / api_amos / api_sabre<br/>or csv:// or s3://
    TA->>UI: /admin/dispatchers → cert + currency
    TA->>UI: /admin/ai/memory → seed initial facts
    Note over TA,UI: tankering threshold, tail quirks,<br/>operational knowledge
    Ops->>DB: INSERT users (role='flight_planner')
    FP->>Planner: sign in → JWT
    FP->>Planner: pick BA1000, run brief phase
    Note over FP,Planner: BriefAgent runs with<br/>tenant memory + RAG context
    Planner-->>FP: rendered brief, source includes<br/>"agent:BriefAgent + N memorys retrieved"
```

---

## 7. Onboarding a new airline (end-to-end walkthrough)

The full lifecycle from "Aerospica Airlines wants in" to "they're dispatching flights".

### Step 1 — Provision the tenant row

Either via SQL or a future provisioning UI:

```sql
INSERT INTO tenants (slug, name, brand_primary_color, brand_logo_url)
VALUES ('aerospica', 'Aerospica Airlines', '#0A2342', 'https://...');
```

Migration `010_ops_specs` automatically seeds default OpsSpecs for any new tenant on first
admin visit, so they have a working baseline.

### Step 2 — Create their first admin user

```sql
INSERT INTO users (id, tenant_id, email, password_hash, role)
SELECT gen_random_uuid(), id, 'ops@aerospica.com', '<bcrypt>', 'admin'
FROM tenants WHERE slug = 'aerospica';
```

That admin signs in. JWT carries `tenantSlug='aerospica'`, `role='admin'`. They land on `/admin`.

### Step 3 — Configure OpsSpecs (`/admin/ops-specs`)

Seven blocks. Concrete JSON for a long-haul widebody operator:

```jsonc
{
  "fuelPolicy": {
    "contingencyPct": 5,                  // % of trip fuel
    "alternateMinutes": 45,               // minutes at cruise burn
    "finalReserveMinutes": 30,            // 30 EU / 45 FAA domestic
    "taxiKg": 600,                        // flat
    "captainsFuelMinutes": 0,             // discretionary
    "tankeringEnabled": true
  },
  "alternateMinima": {                    // OpsSpec C055
    "destinationCeilingFt": 2000, "destinationVisSm": 3,
    "alternateCeilingFt": 600,   "alternateVisSm": 2
  },
  "etopsApproval": {                      // OpsSpec B044
    "maxMinutes": 180,
    "authorizedTypes": ["B77W", "B789", "A333", "A359"]
  },
  "pbnAuthorizations": {                  // OpsSpec C063 / B036
    "rnavLevels": ["RNAV-1", "RNAV-2", "RNAV-5"],
    "rnpLevels":  ["RNP-2", "RNP-4", "RNP-10", "RNP-AR"]
  },
  "costIndex": {
    "default": 30,
    "byType": { "B77W": 25, "A388": 40 }
  },
  "authorizedAirports": [],               // empty = no restriction
  "notes": "Updated post Q4 2025 fuel review"
}
```

Each block flows immediately into planner behaviour (no deploy):

- `fuelPolicy` → `fuel` phase
- `alternateMinima` → `divert` advisor + `brief`
- `etopsApproval` → `aircraft` phase
- `pbnAuthorizations` → `route` phase (rejects routes requiring unauthorized specs)
- `costIndex` → `route` phase summary
- `authorizedAirports` → `divert` (filter) + planner-level destination warning

### Step 4 — Wire integrations (`/admin/integrations`)

For each of three domains the airline picks **mock**, **CSV**, or **API+JWT**:

#### Fuel prices
```
FUEL_PRICE_PROVIDER       = api_fms
FUEL_PRICE_API_URL        = https://fms.aerospica.internal/jet-a-prices
FUEL_PRICE_API_AUTH_METHOD= bearer
FUEL_PRICE_API_TOKEN      = secretsmanager:arn:aws:secretsmanager:…:fms-token
```

#### MEL deferrals
```
MEL_PROVIDER = api_amos
MEL_API_URL  = https://mis.aerospica.internal/deferrals
MEL_API_TOKEN= env://MEL_AMOS_TOKEN
```

#### Crew (roster + assignments — independent feeds)
```
CREW_PROVIDER             = api_sabre
CREW_API_ROSTER_URL       = https://crew.aerospica.internal/roster
CREW_API_ASSIGNMENTS_URL  = https://crew.aerospica.internal/pairings
CREW_API_TOKEN            = env://CREW_SABRE_TOKEN
```

Token references support `env://VAR` (env var) or `secretsmanager:arn:…` (AWS Secrets Manager).
Click **Test connection** in the UI to validate before saving.

### Step 5 — Provision dispatcher certificates (`/admin/dispatcher-certs`)

Per-dispatcher row:

```jsonc
{
  "userId": "...",
  "certNumber": "FAA-DX-1234567",
  "issuedAt": "2018-06-01",
  "areasOfOperation": ["KZNY", "EGTT", "EISN", "BIRD"],
  "typeQualifications": ["B77W", "B789"],
  "lastAreaFamiliarizationAt": "2025-09-15",  // §121.463(c) currency
  "medicalExpiresAt": "2026-12-31",
  "lineCheckExpiresAt": "2026-06-30",
  "status": "active"
}
```

The release phase blocks dispatch if the calling dispatcher isn't current for the route's
area or the assigned aircraft type.

### Step 6 — Seed AI memory (`/admin/ai/memory`)

The GAAS layer's per-tenant knowledge. Each fact the airline adds becomes a vector embedding
that surfaces during planning. Real examples:

```
Scope: fuel
Title: Tankering threshold raised post Q3 2025
Body:  Internal policy raised the recommend-tanker threshold from $200
       to $400 saving after OPEC+ Q3 2025 cuts increased volatility.
Tags:  tankering, policy
```

```
Scope: aircraft
Title: G-XLEK known galley APU bleed quirk
Body:  This tail historically shows MEL-deferrable galley bleed faults
       on long-haul departures from MUC. Plan +200 kg captain's fuel.
Tags:  G-XLEK, mel
```

```
Scope: brief
Title: Volcanic ash advisory near Iceland
Body:  KEF/BIRK affected April–June by Eyjafjallajökull-area ash plumes.
       Always cross-check VAAC bulletins for any Reykjavik FIR transit.
Tags:  vaac, oceanic
```

Facts are pulled by the relevant agent **only** when semantically close to the current flight.

### Step 7 — Create flight planner users

Same as step 2 but `role = 'flight_planner'`. They sign in and land on `/planner`. The new
tenant is now operational.

### What changed without a code deploy

Steps 3–6 are all pure config. The tenant is operating with their own:
- Fuel policy
- Alternate minima
- ETOPS auth + authorized types
- PBN auth (route validator gates them)
- Cost index per type
- Authorized airports list
- Live fuel-price feed
- Live MEL feed
- Live crew feed
- Dispatcher certs gating release
- Operator-specific AI memory

All keyed by `tenant_id`, all isolated by RLS.

---

## 8. Dispatch core — what the engines compute

### 6.1 Phase 1: Brief

Inputs: origin/destination ICAOs, time.

Engines called:
- `aviationweather.gov` — METAR / TAF / international SIGMET feed
- FAA NOTAM Search API (or mock when `FAA_CLIENT_*` unset)
- BriefAgent re-phrases + flags + RAG-retrieves rejections/SOPs

Output: 120-word briefing prose ending with `RECOMMEND: <go | hold | divert planning>`.

### 6.2 Phase 2: Aircraft

Inputs: tail (mocked today), aircraft type.

Engines:
- `resolveAircraftType()` — canonical type from any spelling (ICAO, IATA, marketing, family)
- `isTypeAuthorized()` — vs `opsSpecs.etopsApproval.authorizedTypes` (B044)
- `equidistantPoint()` + `findEtopsAlternates()` — ETOPS adequate alternates within bound
- `effectiveEtopsBound()` — most restrictive of OpsSpec time vs cargo-fire-15min
- `computeCriticalFuel()` — per-type factors (engine-out / depress / both / standard)
- `checkAlternateWeather()` — ±1hr TAF window vs C055 minima

Output: tail + ETOPS analysis + critical-fuel scenario driver + dispatch eligibility.

### 6.3 Phase 3: Route

Inputs: origin / destination / aircraft.

Engines:
- `greatCircleNM()` + `initialBearing()` — distance + heading
- `fuelEstimate()` — block time + cruise burn from ontology
- `loadOpsSpecs()` — pulls cost index (per-type override or default)
- `derivePbnRequirements()` — required RNAV/RNP from route geometry + RNP-AR-airport set
- `validatePbn()` — required vs authorized → missing list

Output: filed route string + distance + block + CI + PBN status (block dispatch if missing spec).

### 6.4 Phase 4: Fuel

Inputs: origin / destination / aircraft.

Engines:
- `fuelEstimate()` parameterised by `opsSpecs.fuelPolicy`
- Fuel-price feed (per-tenant integration) for tankering optimisation
- Tankering MIP comparing origin vs dest with 3% per 1000 kg burn-to-carry penalty

Output: trip + contingency + alternate + reserve + taxi + (captains) + tankering recommendation.

### 6.5 Phases 5–8

W&B (mocked), Crew (real adapters), Slot/ATC (mocked), Release (joint operational control).

### 6.6 Sub-tools (recap)

| Tool | What it does |
|---|---|
| Divert advisor | Rank candidates within 1000nm by runway, ETOPS adequacy, customs, fuel, METAR/TAF window, OpsSpec authorized list |
| Cascade simulator | Walk fleet rotations, propagate delays through plannedGround – minGroundMin slack |
| Tankering | Net saving = price diff × kg − burn-to-carry penalty, MTOW envelope check |
| MEL impact | Cross-reference deferred items vs route conditions (oceanic, etops, icing, dest CAT-III) |
| Deconflict | 8 conflict types: maintenance, unstaffed, unqualified, FDP/flight-time exceeded, insufficient-rest, double-booked, base-mismatch |
| NOTAM board | Aggregated across day's schedule, categorised, severity-ranked |
| SIGMET overlay | Leaflet world map + polygon-vs-route intersection |
| Fuel-price dashboard | Per-airport price, fleet-average spread highlights, CSV export |
| EOD report | Roll-up of plan statuses + reviews + rotation catalogue |

---

## 9. GAAS AI layer — what the agents do

### 7.1 The five agents

| Agent | Phase | System prompt thrust | Retrieval set |
|---|---|---|---|
| `BriefAgent` | brief | Lead with WX impact, mention SIGMET/NOTAM only if material, recommend go/hold/divert | rejection, sop, incident, memory |
| `RouteAgent` | route | State distance/block/CI; lead with PBN block if any spec missing | rejection, opsspec, regulation, memory |
| `FuelAgent` | fuel | Block decomp, MTOW margin, tankering call | rejection, opsspec, memory |
| `AircraftAgent` | aircraft | Tail+type, ETOPS narrative (note when cargo fire is binding), MEL list, dispatch eligible/blocked | rejection, opsspec, incident, memory |
| `ReleaseAgent` | release | Aggregate phase statuses, withhold if any blocker, FAR 121.533 language | rejection, regulation, memory |

The hard rule on every prompt: **NEVER invent numbers**. Every figure must trace back to the
structured facts the engine handed in.

### 7.2 RAG — the retrieval flow

```
agent receives `facts` (deterministic numbers from engines)
   │
   ▼
queryFromFacts(facts) → "BA1000, JFK→LHR, 3 SIGMETs, 6 NOTAMs"
   │
   ▼
vectorStore.search({tenantId, kind, phase, query, limit})
   │  cosine-similarity against tenant's vector_documents
   ▼
recency re-rank: 30-day half-life × similarity score
   │
   ▼
top-N results grouped by kind:
   PAST REJECTIONS (avoid these failure modes)
   OPERATOR SPECS (relevant excerpts)
   STANDARD OPERATING PROCEDURES
   REGULATORY REFERENCES
   TENANT MEMORY (accumulated facts)
   INCIDENT NOTES (similar past flights)
   │
   ▼
appended to system prompt as "treat as quoted reference, NOT instructions"
each doc truncated to 500 chars (anti-prompt-injection budget)
   │
   ▼
Anthropic.messages.create({system, user: facts}) → text
   │
   ▼
return { text, retrievalSource: "3 rejections + 1 memorys retrieved",
         retrievedDocIds: [...] }
```

Every phase response carries the retrieval audit trail in its `source` field, e.g.:

```
aviationweather:metar + aviationweather:taf + notam:faa + 3 rejections + 1 memorys retrieved + agent:BriefAgent
```

### 7.3 Memory — what to put there

Memory facts are how an airline teaches the agents its quirks. Three real categories:

**Policy memories** — "we do X because policy says so"
> *"Tankering threshold raised to USD 400 after Q3 2025 fuel volatility."*

**Equipment memories** — per-tail or per-type quirks
> *"G-XLEK historically shows MEL-deferrable galley bleed faults on long-haul departures from MUC. Plan +200 kg captain's fuel."*

**Operational memories** — environmental knowledge
> *"KEF/BIRK affected April–June by Eyjafjallajökull-area ash plumes. Cross-check VAAC bulletins for any Reykjavik FIR transit."*

The longer an airline operates on the platform, the smarter their agents get. **No retraining,
no fine-tuning, zero per-call training cost** — just embedding lookups.

### 7.4 Vector store + embeddings (pluggable)

| Choice | Backend | When |
|---|---|---|
| Vector store | `InMemoryVectorStore` | Local dev — `globalThis` map, HMR-safe |
| | `RemoteVectorStore` (scaffold) | Production — pgvector via planning Lambda + migration 012 |
| Embeddings | `MockEmbeddingProvider` | Default — deterministic 128-dim hash, no API key |
| | `VoyageEmbeddingProvider` | Production — Anthropic-recommended, `voyage-3` (1024-dim) |
| | `OpenAIEmbeddingProvider` | Production — OpenAI shop, `text-embedding-3-small` (1536) |

Selection by env var only — no code change. See §9.4.

### 7.5 Audit trail (FAA-ready)

Every retrieval logs to `vector_retrievals` (migration 012):

```
id │ tenant_id │ flight_id │ phase  │ query                  │ retrieved                                │ agent
───┼───────────┼───────────┼────────┼────────────────────────┼──────────────────────────────────────────┼─────────────
42 │ aerospica │ BA1000-… │ brief  │ JFK→LHR, 3 SIGMETs    │ [{id,kind,score}, …]                     │ BriefAgent
```

For any released flight, an inspector can replay exactly which knowledge informed the AI's
output. That's the point of GAAS-for-aviation: explainable AI in a regulated context.

---

## 10. Installation

### 8.1 Local dev (zero infra)

```bash
git clone https://github.com/swapna15/airline-app && cd airline-app
npm install

cat > .env.local <<'EOF'
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...
EMBEDDING_PROVIDER=mock
EOF

npm run dev    # → http://localhost:3000
```

Sign in with `admin@x.com` for admin role, `planner@x.com` for planner, etc. (Local-dev role
derivation; in prod, role is the `users.role` column.)

### 8.2 Production (AWS + Vercel)

```bash
# 1. Provision AWS
cd infra/terraform
terraform init
terraform apply \
  -var="frontend_url=https://your-app.vercel.app" \
  -var="nextauth_secret=$(openssl rand -base64 32)"

# 2. Run migrations (creates schema + ops_specs + pgvector)
aws lambda invoke --function-name airline-app-migrate --payload '{}' /tmp/out.json

# 3. Deploy frontend
vercel --prod
```

Required Vercel env:

| Var | Purpose |
|---|---|
| `NEXTAUTH_SECRET` | Match Lambda's |
| `NEXTAUTH_URL` | Your Vercel URL |
| `ANTHROPIC_API_KEY` | Claude for all agents |
| `NEXT_PUBLIC_API_URL` | API Gateway URL from Terraform output |
| `EMBEDDING_PROVIDER` | `voyage` or `openai` |
| `VOYAGE_API_KEY` or `OPENAI_API_KEY` | Per the above |

### 10.3 Cost-saving teardown (drop AWS, keep the demo running on Vercel)

Aurora Serverless v2 + RDS Proxy + NAT Gateway are the cost drivers (≈ $50–80/mo
sitting idle). The platform is designed to run **without AWS at all** — mocks for
flight data, in-memory store for plans + RAG corpus, deterministic local agents.
The UI does **not** break when AWS is gone.

#### Tear down AWS

```bash
cd infra/terraform
terraform destroy        # asks for confirmation, drops VPC + Aurora + Lambdas + API Gateway
```

This deletes only cloud resources. **All code stays as-is** — bring it back any
time with `terraform apply` + the migrate Lambda invoke (re-creates schema, RLS,
seed data).

#### Update Vercel env vars

In your Vercel project → Settings → Environment Variables, **remove** these:

| Variable | Why remove |
|---|---|
| `NEXT_PUBLIC_API_URL` | App falls back to MockAdapter / in-memory automatically |

**Keep** these (still used):

| Variable | Why keep |
|---|---|
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | NextAuth still issues JWTs locally |
| `ANTHROPIC_API_KEY` | The five planning agents still call Claude |
| `EMBEDDING_PROVIDER=mock` (or unset) | Mock embeddings work offline |

That's it. Redeploy.

#### What runs on which fallback

| Surface | Without `NEXT_PUBLIC_API_URL` |
|---|---|
| Passenger search | `MockAdapter` — deterministic 50-flight schedule |
| Bookings | In-memory; lost on cold start (acceptable for demo) |
| Sign-in | NextAuth credentials with email-prefix role derivation (`admin@…`, `planner@…`) |
| Planner phases | All engines run; agents call Claude; data persists in `globalThis` map |
| `/admin/ops-specs` | `DEFAULT_OPS_SPECS` (read-only — saves require API_URL) |
| `/admin/ai/memory` | `InMemoryVectorStore` — accepts saves, lost on cold start |
| Fuel-price / MEL / crew | `mock` providers (default) — built-in static fixtures |
| Vector store | In-memory, HMR-safe |

#### (Optional) Use CSV fixtures instead of mocks for richer data

The `scripts/sample-*.csv` files are also published to `public/data/` and served
as static assets by the same Vercel deployment. Point the integrations at them:

```bash
# On Vercel — replace <your-vercel-url> with your actual deployment URL
FUEL_PRICE_PROVIDER=csv
FUEL_PRICE_CSV_URI=https://<your-vercel-url>/data/sample-fuel-prices.csv

MEL_PROVIDER=csv
MEL_CSV_URI=https://<your-vercel-url>/data/sample-mel-deferrals.csv

CREW_PROVIDER=csv
CREW_ROSTER_URI=https://<your-vercel-url>/data/sample-crew-roster.csv
CREW_ASSIGNMENTS_URI=https://<your-vercel-url>/data/sample-crew-assignments.csv
```

The fetcher (`lib/integrations/fetcher.ts`) handles `https://` URIs natively;
no auth tokens needed for the public assets.

#### Bring AWS back when needed

```bash
cd infra/terraform
terraform apply -var="frontend_url=https://<your-app>.vercel.app" \
                -var="nextauth_secret=<same secret as Vercel>"
aws lambda invoke --function-name airline-app-migrate --payload '{}' /tmp/m.json
# Then put NEXT_PUBLIC_API_URL back on Vercel and redeploy
```

The schema (12 migrations) is idempotent; tenants + ops_specs + dispatcher_certs
need to be re-seeded since destroy drops the whole cluster.

---

## 11. Configuration reference (every per-tenant knob)

### 9.1 OpsSpecs (`/admin/ops-specs`)

See §5 Step 3 for the full JSON.

### 9.2 Integrations (`/admin/integrations`)

| Domain | Provider env | Required URLs / tokens |
|---|---|---|
| Fuel prices | `FUEL_PRICE_PROVIDER` ∈ {mock, csv, api_fms} | `FUEL_PRICE_API_URL`, `FUEL_PRICE_API_TOKEN`, `FUEL_PRICE_API_AUTH_METHOD` |
| MEL | `MEL_PROVIDER` ∈ {mock, csv, api_amos, api_trax, api_camo} | `MEL_API_URL`, `MEL_API_TOKEN` |
| Crew | `CREW_PROVIDER` ∈ {mock, csv, api_sabre, api_jeppesen, api_aims} | `CREW_API_ROSTER_URL`, `CREW_API_ASSIGNMENTS_URL`, `CREW_API_TOKEN` |

CSV schemas: `scripts/sample-fuel-prices.csv`, `scripts/sample-mel-deferrals.csv`,
`scripts/sample-crew-roster.csv`, `scripts/sample-crew-assignments.csv`.

Token references: `env://VAR` or `secretsmanager:arn:…`.

### 9.3 Dispatcher certs (`/admin/dispatcher-certs`)

See §5 Step 5 for the row shape.

### 9.4 GAAS env vars

| Var | Default | Purpose |
|---|---|---|
| `EMBEDDING_PROVIDER` | `mock` | `mock` / `voyage` / `openai` |
| `VOYAGE_API_KEY` | — | Required when `voyage` |
| `VOYAGE_MODEL` | `voyage-3` | `voyage-3` / `voyage-3-large` / `voyage-3-lite` |
| `OPENAI_API_KEY` | — | Required when `openai` |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI model id |

### 9.5 AI memory (`/admin/ai/memory`)

Per-fact:

```jsonc
{
  "scope": "fuel",                  // brief | route | fuel | aircraft | crew | release | general
  "title": "Tankering threshold raised post Q3 2025",
  "body":  "Internal policy raised…",
  "tags":  ["tankering", "policy"]
}
```

Stored as `vector_documents` row with `kind='memory'`, embedding generated server-side at
write time. Retrieved automatically during the matching phase.

---

## 12. Testing

### 10.1 Test the GAAS layer

#### A. BriefAgent runs and is wired

1. `npm run dev`, sign in as `planner@x.com`
2. `/planner` → BA1000 → run **Brief**
3. **DevTools → Network → POST `/api/planner/brief`** → response `source` ends with `agent:BriefAgent`

#### B. Memory retrieval works

1. `/admin/ai/memory` → add a fact:
   - Scope: `brief`, Title: `Volcanic ash near Iceland`, Body: paste from §5 Step 6
2. Re-run BA1000 Brief
3. Network response: `source` includes `1 memorys retrieved`
4. The brief text should reference the volcanic concern when geographically relevant

#### C. Rejection feedback loop works

1. After a brief, click **Reject** with comment `"Did not mention destination MVFR forecast"`
2. Re-run brief
3. Response source: `1 rejections retrieved`
4. The new brief should explicitly note destination WX category

#### D. Tenant isolation

1. Sign in as a different tenant's admin
2. `/admin/ai/memory` should be empty (your facts didn't leak across tenants)

### 10.2 Test each shipped feature

| Feature | Path | Look for |
|---|---|---|
| Per-tail ETOPS perf | `/planner` → BA1000 Aircraft | `perf: B77W (1.05× / 2.55× / 1.65×, source: first-pass)` |
| Cargo fire bound | Same | `within 180 min (OpsSpec B044), cargo fire 195 min not binding` |
| TAF ETA-window | `/planner/divert` BA1000 | Header `wx source: N TAF · M METAR`; row pill `✓ alt min taf` |
| C055 minima | `/admin/ops-specs` raise to 1500 ft / 5 SM, divert | Most rows flip to `✕ below alt min` |
| AuthorizedAirports | List = `EGKK, LFPG`, run BA1000 divert | Red banner appears |
| Cost index | `byType.B77W = 80`, run BA1000 Route | `(CI 80)` in summary |
| PBN | Remove `RNP-4` from rnpLevels, BA1000 Route | `⛔ PBN: route requires RNP-4` |
| Critical fuel | BA1000 Aircraft | `Critical fuel (driver: depress)` on long oceanic |
| Tankering | `/planner/tankering` | Net saving column with MTOW envelope check |
| MEL | `/planner/mel` | Block / warn severity rows |
| Deconflict | `/planner/deconflict` | 8 conflict-type ribbon |
| NOTAM | `/planner/notams` | Categorised, criticals highlighted |
| SIGMET | `/planner/sigmet` | World map + polygon-route intersection sidebar |
| Crew fatigue | `/planner` → Crew phase | Score breakdown (FDP / rest / timezone) |

---

## 13. Pending items / roadmap

### 11.1 GAAS layer

| Item | Status | Effort |
|---|---|---|
| Wire RouteAgent / FuelAgent / AircraftAgent / ReleaseAgent into `lib/planner-phases.ts` | Built + tested but only `brief` is wired today; one-line each | 2 hr |
| Swap InMemoryVectorStore for RemoteVectorStore (pgvector via planning Lambda) | Migration 012 ships schema; need `/planning/vector/*` Lambda handler | 1 day |
| MemoryAgent — auto-extract facts from approved/rejected pairs | Concept ready, not built | 1 day |
| Streaming agent responses (token-by-token UI) | Anthropic SDK supports it; UI work too | 1 day |
| Vercel AI Gateway integration | Hooks flagged it during build; routes Anthropic+Voyage+OpenAI through one observable proxy | 0.5 day |
| Observability (logger / error tracking on every route) | Cross-cutting; all routes currently bare | 0.5 day |

### 11.2 Dispatch core

| Item | Source | Effort |
|---|---|---|
| #4 ICAO Form 7233-4 generator (Item 7/9/10/13/15/16/18/19) | design doc §1A | 1 day |
| #6 Re-dispatch fuel ("decision-point procedure") | design doc §1A | 1 day |
| #7 Wind-optimized routing (NOAA GFS / ECMWF 4-D grid) | design doc §1A — biggest gap | 2–3 days |
| #8 NAT-OTS / PACOTS oceanic tracks | design doc §1A | 1 day |
| #10 Conflict-zone screening (EASA Conflict Zone Bulletins) | design doc §1A | 0.5 day |

### 11.3 Already shipped (the "what works" recap)

- 8-phase planner workflow with HITL release
- Diversion advisor (C055 minima + authorizedAirports + ETOPS adequacy + TAF ETA-window check)
- Delay cascade simulator
- Tankering decision tool (3.5%/hr burn-to-carry, MTOW envelope, fuel-price feed)
- MEL impact assessment (kind discriminated union, 4 categories A/B/C/D)
- Schedule deconfliction (8 conflict types)
- NOTAM briefing board with severity
- SIGMET / airspace world-map overlay
- Crew fatigue calculator
- Fuel-price dashboard (CSV export)
- Real airport data (verified/heuristic dataQuality flag)
- Round-trip persistence integrity tests
- Dispatcher certifications + § 121.463 currency gating
- Operations Specifications — all 7 blocks driving real planner behaviour
- ETOPS critical fuel + per-tail perf factors + cargo fire suppression bound
- Semantic ontology (aircraft, airline, FIR, airport)
- Pluggable integrations (fuel-price, MEL, crew) — mock / CSV / API+JWT
- Multi-tenant: JWT + RLS + per-tenant OpsSpecs / fleet / MEL / crew / fuel-feed / AI memory
- **Multi-agent GAAS layer**: 5 per-phase agents + RAG + per-tenant memory + pluggable embeddings + pluggable vector store + admin UI

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **AIRAC** | Aeronautical Information Regulation And Control — 28-day cycle for navigation database updates |
| **C055 / B044 / etc.** | OpsSpec paragraph references (alt minima, ETOPS, etc.) |
| **CI (Cost Index)** | Dimensionless ratio of time-cost to fuel-cost. CI=0 → max range; CI=999 → min time |
| **CTOT** | Calculated Take-Off Time (Eurocontrol) |
| **EDTO** | Extended Diversion Time Operations — ICAO term for what the FAA calls ETOPS |
| **EP** | Equidistant Point — midpoint of an ETOPS leg |
| **ETOPS** | Extended-range Twin-engine Operational Performance Standards |
| **FDP** | Flight Duty Period — total on-duty time |
| **FOO/FD** | Flight Operations Officer / Flight Dispatcher (ICAO term) |
| **FTL** | Flight Time Limitations |
| **IROPS** | Irregular Operations (recovery from disruption) |
| **JeppView / NavBlue** | Commercial dispatch route + airport data providers |
| **MEL / CDL** | Minimum Equipment List / Configuration Deviation List |
| **MTOW** | Maximum Take-Off Weight (structural limit) |
| **NAT-OTS / PACOTS** | North Atlantic / Pacific Organised Track Systems |
| **NOTAM** | Notice to Air Missions |
| **OCC / IOC / NOC** | Operations Control Centre — names vary by airline |
| **OFP** | Operational Flight Plan — the document the dispatcher produces |
| **OpsSpec** | Operations Specifications — operator's authorized config from FAA/EASA |
| **PAX** | Passengers |
| **PBN** | Performance-Based Navigation (umbrella for RNAV + RNP) |
| **PEP** | Performance Engineering Program (Boeing/Airbus per-tail tables) |
| **PIC** | Pilot in Command |
| **PNR** | Passenger Name Record |
| **RAG** | Retrieval-Augmented Generation |
| **RFF** | Rescue and Fire Fighting (ICAO airport category 1–10) |
| **RLS** | Row-Level Security (Postgres) |
| **RNAV** | aRea NAVigation — track-defined routing |
| **RNP / RNP-AR** | Required Navigation Performance / Authorisation Required |
| **SIGMET / AIRMET** | Significant Met info / Airmen's Met info |
| **TAF** | Terminal Aerodrome Forecast |
| **TFR** | Temporary Flight Restriction |
| **VAAC** | Volcanic Ash Advisory Center |

---

## 15. Appendix — file map

```
shared/
  schema/flight.ts                           # Zod-validated OwnFlight (canonical)
  semantic/
    aircraft.ts                              # ICAO/IATA/marketing/family resolver + perf + ETOPS
    airline.ts                               # ICAO/IATA/callsign/alias resolver
    fir.ts                                   # FIR id + label

lib/
  ai/                                        # GAAS infrastructure (this PR)
    embeddings.ts                            # pluggable provider
    vector-store.ts                          # pluggable backend (in-memory + pgvector scaffold)
    rag.ts                                   # retrieve + re-rank + format
    memory.ts                                # typed fact API
    tenant.ts                                # JWT → tenant slug
  ops-specs.ts                               # OpsSpecs loader (no-store fetch)
  pbn.ts                                     # RNAV/RNP requirements + validation
  etops.ts                                   # critical fuel + cargo fire bound
  perf.ts                                    # great-circle + cruise burn
  mel.ts                                     # MEL evaluation
  crew.ts                                    # roster / assignments
  crew-fatigue.ts                            # 0–100 fatigue score
  aviationweather.ts                         # METAR / TAF / SIGMET + TAF window parser
  icao.ts                                    # airport reference (3,400 entries)
  fleet.ts                                   # mocked rotations
  fuelprices.ts                              # façade over pluggable fuel-price providers

core/agents/
  base.ts                                    # BaseAgent (Anthropic SDK wrapper)
  planning/                                  # GAAS agent suite (this PR)
    PlanningBaseAgent.ts                     # shared substrate (RAG + audit)
    BriefAgent.ts | RouteAgent.ts | FuelAgent.ts | AircraftAgent.ts | ReleaseAgent.ts
    PlannerOrchestrator.ts                   # phase → agent dispatch

app/
  api/admin/ai/memory/route.ts               # GET/POST/DELETE memory facts
  admin/ai/memory/page.tsx                   # admin UI for facts
  api/planner/[phase]/route.ts               # phase dispatcher (uses runAgent)
  api/planner/divert/route.ts                # divert advisor
  api/planner/{cascade,tankering,mel,deconflict,notams,sigmet,fuel-prices,eod}/route.ts
  planner/                                   # the planner role's UI pages
  admin/                                     # tenant configuration UIs

infra/db/migrations/
  001_schema.sql                             # base
  002_seed.sql                               # demo data
  003_multi_tenant.sql                       # tenants table + RLS
  004_flight_plans.sql                       # plans + reviews
  005_integration_configs.sql                # per-tenant integration config
  006_add_flight_planner_user.sql            # planner role
  007_flight_plans_text_id.sql               # flight_id relax
  008_flight_plans_uuid_id.sql               # flight_id restore
  009_dispatcher_certifications.sql          # certs + currency
  010_ops_specs.sql                          # 7-block OpsSpecs
  011_pbn_oceanic_defaults.sql               # backfill RNP-4 / RNP-10
  012_ai_corpus.sql                          # pgvector + retrieval audit (this PR)

infra/lambdas/
  authorizer/                                # JWT verification
  users/ flights/ bookings/ checkin/ gate/ admin/ planning/ migrate/

GAAS-AIRLINEOS.md                            # this document
```

---

**Last updated**: 2026-04-30. Tracks commits up to `e7c7b21` (GAAS layer release).
