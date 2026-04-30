# AirlineOS — Requirements

Source-of-truth for **what** the system must do. For implementation depth, architecture
diagrams, and configuration walkthroughs see [`GAAS-AIRLINEOS.md`](../../GAAS-AIRLINEOS.md).

> Last updated: 2026-04-30. Tracks state at commit `804e405`.

---

## Vision

AirlineOS is a multi-tenant SaaS platform any airline can sign up to and immediately get a
working operation: passenger booking, staff dispatch, regulated flight planning, and a
generative-AI layer ("GAAS") that learns each airline's habits.

The platform separates concerns into three deliberate layers:

1. **Multi-tenant SaaS shell** — tenants, users, RBAC, branding, integrations.
2. **Dispatch core** — deterministic, regulated engines that produce the legal artefacts.
3. **GAAS AI layer** — per-phase agents, RAG, per-tenant memory. Augments — never gates.

---

## Functional requirements

### FR1 — Multi-tenancy

- **FR1.1** Every per-tenant data row carries `tenant_id` (UUID).
- **FR1.2** Cross-tenant reads/writes are physically blocked by Postgres row-level security on
  `tenants`, `users`, `flights`, `bookings`, `flight_plans`, `flight_plan_reviews`,
  `dispatcher_certifications`, `ops_specs`, `integration_configs`, `vector_documents`,
  `vector_retrievals`. Policy: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
- **FR1.3** A new tenant is provisioned by inserting one row into `tenants`. Migrations 010
  + 011 + 012 auto-seed defaults so the tenant has a working baseline immediately.
- **FR1.4** A tenant's brand (name, primary colour, logo URL) drives the navbar, emails,
  branded carrier logo (`AirlineLogo` component), and agent system-prompt `{airline}`
  substitution.

### FR2 — Authentication + RBAC

- **FR2.1** Six roles: `passenger`, `checkin_agent`, `gate_manager`, `coordinator`,
  `flight_planner`, `admin`.
- **FR2.2** NextAuth with credentials + Google OAuth. JWT strategy, **HS256** via `jose`
  (must match the AWS Lambda authorizer's verification method).
- **FR2.3** `middleware.ts` route-RBAC table (`ROUTE_ROLES`) gates every staff page.
- **FR2.4** Local dev derives role from email prefix (`admin@…`, `planner@…`, etc.).
  Production reads `users.role`.
- **FR2.5** `Navbar` renders different links per role and shows a role badge.

### FR3 — Passenger surface

- **FR3.1** Search by origin / destination / date(s) / passenger count / cabin class via a
  structured form **or** natural-language input parsed by `SearchAgent`.
- **FR3.2** Trip type toggle (one-way / round-trip) with date validation.
- **FR3.3** Passenger picker with adults / children / infants (infants ≤ adults).
- **FR3.4** Filterable, sortable results (price / duration / stops / airline / departure time).
- **FR3.5** Interactive seat map with class fences, occupied/available/selected states,
  per-seat pricing.
- **FR3.6** Passenger details with optional passport, contact info with billing address.
- **FR3.7** Checkout with price breakdown, mock payment, Resend/SES booking confirmation email.
- **FR3.8** Booking confirmation with PNR, itinerary, manage-booking links.
- **FR3.9** My-bookings list + per-PNR detail (cancel, modify).
- **FR3.10** Booking state persisted to `localStorage` (key `airlineos_booking`) via
  `BookingProvider` so refresh during booking restores state. `reset()` clears both.
- **FR3.11** ClaudeAssistant floating chat panel always available.

### FR4 — Staff surfaces

- **FR4.1** `/checkin` — PNR/name lookup, 24-hour window enforcement, bag check, boarding-pass
  generation.
- **FR4.2** `/gate` — flight list, status FSM (Scheduled → Boarding → Departed), per-flight
  manifest, board-passenger action.
- **FR4.3** `/coordinator` — IROPS recovery: cross-flight rebooking dashboard.
- **FR4.4** `/planner` — full 8-phase OFP stepper (see FR5).
- **FR4.5** `/planner/batch` — schedule-wide auto-prepare across today's rotation.

### FR5 — Dispatch workflow (the regulated core)

The 8-phase OFP, each phase returning `{summary, data, source}`:

- **FR5.1** `brief` — METAR/TAF/SIGMET/NOTAM digest. Sources: aviationweather.gov + FAA NOTAM
  Search (mock fallback). Output: ≤120-word briefing ending in a `RECOMMEND:` line.
- **FR5.2** `aircraft` — tail / type / MEL / ETOPS analysis. Validates type against
  `opsSpecs.etopsApproval.authorizedTypes` (B044). Computes critical fuel using per-type
  factors from the aircraft ontology. Bounded by the more restrictive of OpsSpec time vs
  cargo-fire-suppression − 15 min descent margin.
- **FR5.3** `route` — great-circle distance + bearing + block time. Cost index from
  `opsSpecs.costIndex.byType[type] ?? .default`. PBN requirements derived
  (`derivePbnRequirements`) and validated against `opsSpecs.pbnAuthorizations`. Hard-fails
  dispatch when missing any required RNAV/RNP spec.
- **FR5.4** `fuel` — trip + contingency + alternate + reserve + taxi + (captains) per
  `opsSpecs.fuelPolicy`. Tankering decision when fuel-price feed is wired (saving threshold
  configurable per tenant memory).
- **FR5.5** `weight_balance` — currently mocked.
- **FR5.6** `crew` — roster + assignments from per-tenant integration. Fatigue scored 0–100
  via `crew-fatigue.ts` from FDP / rest / timezone.
- **FR5.7** `slot_atc` — currently mocked.
- **FR5.8** `release` — go/no-go synthesis. Joint operational control under FAR 121.533.
  Blocked when calling dispatcher's certificate isn't current for area or type.

### FR6 — Sub-tools (the planner's daily-use kit)

- **FR6.1** `/planner/divert` — alternates within 1000nm ranked by runway + ETOPS adequacy +
  customs + fuel + WX (TAF ETA-window vs `opsSpecs.alternateMinima` C055) + authorized-airports
  filter.
- **FR6.2** `/planner/cascade` — delay propagation through fleet rotations, slack-aware.
- **FR6.3** `/planner/tankering` — origin-vs-destination price differential, MTOW-aware.
- **FR6.4** `/planner/mel` — per-tail conflict detection vs route conditions (oceanic, ETOPS,
  icing, dest CAT-III).
- **FR6.5** `/planner/deconflict` — 8 conflict types (maintenance, FDP, flight time, rest,
  double-booked, base mismatch, unstaffed, unqualified).
- **FR6.6** `/planner/notams` — categorised NOTAM board with critical-severity highlight.
- **FR6.7** `/planner/sigmet` — Leaflet world-map polygon overlay, route-intersection sidebar.
- **FR6.8** `/planner/fuel-prices` — per-airport price dashboard with CSV export.
- **FR6.9** `/planner/eod` — end-of-day operational roll-up.

### FR7 — Admin surface (tenant configuration)

- **FR7.1** `/admin` — tenant overview, user management, role updates, soft-delete.
- **FR7.2** `/admin/integrations` — pluggable feeds (fuel-price, MEL, crew). Per-tenant
  selection of `mock` / `csv` / `api_*`. Test-connection action.
- **FR7.3** `/admin/dispatchers` — dispatcher cert + currency CRUD with area + type quals,
  §121.463(c) area-familiarization currency dates.
- **FR7.4** `/admin/ops-specs` — seven OpsSpec blocks: fuel policy, alternate minima (C055),
  ETOPS approval (B044), PBN authorizations (C063 / B036), cost index, authorized airports
  (A030/A032), notes.
- **FR7.5** `/admin/ai/memory` — per-tenant GAAS memory facts. Scope (brief / route / fuel /
  aircraft / crew / release / general), title, body, tags.

### FR8 — AI agents (10 total)

All agents extend `BaseAgent` (`core/agents/base.ts`) using `claude-sonnet-4-6` with tenant
brand / tone / policies / passenger profile injection. The five planning agents additionally
extend `PlanningBaseAgent` for phase-aware RAG retrieval.

- **FR8.1** Planning (5 agents — `BriefAgent`, `RouteAgent`, `FuelAgent`, `AircraftAgent`,
  `ReleaseAgent`) routed by `PlannerOrchestrator`. Each has its own system prompt + retrieval
  kinds. Hard rule: NEVER invent numbers.
- **FR8.2** Customer-facing: `SearchAgent` (NL → SearchParams), `RecommendationAgent` (upsell),
  `SupportAgent` (FAQ scoped to tenant policies), `DisruptionAgent` (delay/cancel advice).
- **FR8.3** Legacy `PlanningAgent` retained for back-compat; will be removed once all phases
  migrate to per-phase agents.
- **FR8.4** All agent calls go through `/api/agents` or `/api/planner/*` server-side; the
  Anthropic API key never reaches the client.

### FR9 — GAAS substrate

- **FR9.1** Pluggable embeddings (`mock` / `voyage` / `openai`) by `EMBEDDING_PROVIDER` env
  var. No code changes to swap.
- **FR9.2** Pluggable vector store: `InMemoryVectorStore` (default, HMR-safe) or
  `RemoteVectorStore` (planning Lambda + pgvector via migration 012).
- **FR9.3** RAG retrieval (`lib/ai/rag.ts`) with cosine-similarity search, recency re-rank
  (30-day half-life), grouping by kind (REJECTIONS / OPSPEC / SOPs / REGS / MEMORY /
  INCIDENTS), 500-char anti-injection truncation.
- **FR9.4** Per-tenant memory (`lib/ai/memory.ts`) — scoped facts retrieved during the
  matching phase. Free-form add via `/admin/ai/memory`.
- **FR9.5** Auto-backfill of past rejection comments into the vector store on each `brief`
  call (idempotent upsert).
- **FR9.6** Audit trail: every agent run returns `{text, retrievalSource, retrievedDocIds}`.
  Production logs every retrieval to `vector_retrievals` (migration 012) for FAA replay.
- **FR9.7** Graceful degradation: if Anthropic / Voyage / OpenAI is down, the deterministic
  engines still return `PhaseResult.data` with all numbers. Only the prose `summary` is
  missing.

### FR10 — Pluggable enterprise integrations

Three domains, all with the same provider pattern (`mock` / `csv` / `api_*+JWT`):

- **FR10.1** Fuel prices (`api_fms`) — used by tankering decision and fuel-price dashboard.
- **FR10.2** MEL deferrals (`api_amos` / `api_trax` / `api_camo`).
- **FR10.3** Crew (`api_sabre` / `api_jeppesen` / `api_aims`) — roster + assignments on
  independent caches.
- **FR10.4** Token references support `env://VAR` and `secretsmanager:arn:…`.
- **FR10.5** CSV inputs accept `s3://`, `file://`, `https://` URIs.
- **FR10.6** Per-tenant config persisted in `integration_configs` (migration 005); admin UI
  busts the resolver's cached provider on save.

### FR11 — Adapter pattern (multi-source flight data)

- **FR11.1** `MockAdapter` — when neither `NEXT_PUBLIC_API_URL` nor `DUFFEL_ACCESS_TOKEN` is
  set. Deterministic in-memory inventory.
- **FR11.2** `DuffelAdapter` — when `DUFFEL_ACCESS_TOKEN` set and `NEXT_PUBLIC_API_URL` unset.
  Real flight inventory + order placement via `@duffel/api`.
- **FR11.3** Lambda-backed — when `NEXT_PUBLIC_API_URL` set. Forwards to API Gateway.
- **FR11.4** All implement `AirlineAdapter` (`core/adapters/types.ts`); `AdapterRegistry`
  selects one per tenant.

### FR12 — Reference data + ontologies

- **FR12.1** Airport reference (~3,400 entries) imported from OurAirports + supplements,
  with `dataQuality: 'verified' | 'heuristic'` flag for `fireCat` / `customs24h` / `fuelTypes`.
- **FR12.2** Aircraft ontology (`shared/semantic/aircraft.ts`) — 24+ types, ICAO/IATA/marketing/
  family/aliases, `cruiseBurnKgPerHr` + `cruiseMach` + `mtowKg`, `etopsPerf` factors per type.
- **FR12.3** Airline ontology (`shared/semantic/airline.ts`) — 25+ carriers with ICAO / IATA /
  callsign / alliance / hubs.
- **FR12.4** FIR ontology (`shared/semantic/fir.ts`) — 60+ FIRs (CONUS ARTCCs + oceanic +
  European/Asian/Pacific).
- **FR12.5** Single-call resolution for any string spelling (`Boeing 777` / `B77W` / `77W` /
  `Boeing-777-300ER` all resolve to one record).

---

## Non-functional requirements

- **NFR1** TypeScript strict mode throughout.
- **NFR2** Zero-infra local dev: `npm run dev` runs end-to-end with mocks for flight data,
  fuel prices, MEL, crew, vector store, and embeddings.
- **NFR3** Anthropic API key never reaches the client. All Claude calls server-side.
- **NFR4** Deterministic engine output is independent of AI availability — release packets
  carry full numbers even when the AI layer is unreachable.
- **NFR5** Multi-tenant isolation enforced at three layers (JWT, app-level resolver,
  Postgres RLS). Any single layer compromise still keeps tenant data isolated.
- **NFR6** Pluggable everywhere — embeddings, vector store, fuel-price feed, MEL feed, crew
  feed, flight-data adapter — selectable by env var without code change.
- **NFR7** Audit trail by construction — every agent run carries `retrievalSource` +
  `retrievedDocIds`; every retrieval (in production) writes to `vector_retrievals`.
- **NFR8** Coverage thresholds: 70% branches, 80% lines / functions / statements (across
  `core/`, `components/`, `utils/mockData.ts`, `app/search/`, three core API routes).
- **NFR9** Lambda cold-start budget: planner phase functions ≤ 30 s execution
  (`vercel.json:maxDuration = 30` for `app/api/**`).
- **NFR10** Idempotent migration runner — `schema_migrations` tracking table; SQL files
  copied into Lambda bundle by `infra/lambdas/scripts/bundle.js`.

---

## Companion specs

- **`flight-planner-enhancements/requirements.md`** — the dispatch-enhancements requirement
  set with detailed acceptance criteria (R1–R10). All 10 requirements shipped; kept as the
  per-feature acceptance-criteria audit reference.
- **`flight_planning_design.md`** — industry/regulatory context: FAR 121, ICAO Annex 6,
  dispatcher identity, OpsSpecs theory, ETOPS regulation, three layers of flight planning.
  Background reading; not a spec per se.
- **`design.md`** — current architecture decisions (sibling to this file).
- **`tasks.md`** — current build status and remaining work.
- **`../../GAAS-AIRLINEOS.md`** — comprehensive end-to-end reference with diagrams,
  installation, configuration, testing, and pending list.
