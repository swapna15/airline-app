# AirlineOS — Build Status & Pending Tasks

What's done, what's pending, and what's deferred. Mirrors the pending list in
[`GAAS-AIRLINEOS.md`](../../GAAS-AIRLINEOS.md) §13 with finer granularity.

> Last updated: 2026-04-30. Tracks state at commit `804e405`.

---

## ✅ Shipped

### Foundation
- [x] Multi-tenant SaaS shell (tenants table, RLS, JWT, RBAC, integrations, branding)
- [x] Six roles with route-RBAC middleware (`passenger`, `checkin_agent`, `gate_manager`,
      `coordinator`, `flight_planner`, `admin`)
- [x] NextAuth credentials + Google OAuth, HS256 JWT via `jose`
- [x] Adapter pattern (`MockAdapter` / `DuffelAdapter` / Lambda-backed)
- [x] Booking state with `BookingProvider` + localStorage continuity
- [x] Theming via CSS variables from tenant `BrandConfig`

### Passenger surface
- [x] Search (structured form + NL via `SearchAgent`)
- [x] Trip-type toggle (one-way / round-trip) with date validation
- [x] Passenger picker (adults / children / infants)
- [x] Filterable, sortable results
- [x] Interactive seat map with class fences
- [x] Passenger details + contact + billing
- [x] Checkout with mock payment + email confirmation (Resend / SES)
- [x] Booking confirmation page with PNR + itinerary
- [x] My-bookings list + per-PNR detail with cancel/modify
- [x] ClaudeAssistant floating chat panel

### Staff surfaces
- [x] `/checkin` with 24h window enforcement
- [x] `/gate` with status FSM + manifest + boarding action
- [x] `/coordinator` IROPS recovery dashboard
- [x] `/admin` user management with role updates + soft-delete

### Dispatch core (8-phase OFP workflow)
- [x] `brief` — METAR/TAF/SIGMET/NOTAM digest with agent narrative
- [x] `aircraft` — tail/MEL/ETOPS analysis with critical-fuel + cargo-fire bound
- [x] `route` — distance/CI/PBN with hard-fail on missing PBN spec
- [x] `fuel` — full block decomposition per OpsSpec policy
- [x] `weight_balance` — phase scaffold (mocked content)
- [x] `crew` — roster + assignments + fatigue scoring
- [x] `slot_atc` — phase scaffold (mocked content)
- [x] `release` — joint operational control sign-off with cert currency check
- [x] Auto-prepare workflow with NDJSON-streamed progress + batch planning page

### Sub-tools
- [x] Diversion advisor (C055 minima + authorizedAirports + ETOPS adequacy + TAF ETA-window
      check + RNP-AR airports filter)
- [x] Delay cascade simulator
- [x] Tankering decision tool (3.5%/hr burn-to-carry, MTOW envelope)
- [x] MEL impact assessment
- [x] Schedule deconfliction (8 conflict types)
- [x] NOTAM briefing board with severity highlight
- [x] SIGMET / airspace overlay (Leaflet world map + polygon-route intersection)
- [x] Crew fatigue calculator
- [x] Fuel-price dashboard with CSV export
- [x] End-of-day operational roll-up

### Engines + ontologies
- [x] Great-circle perf table from aircraft ontology
- [x] ETOPS critical fuel with per-tail factors (777 / 787 / 737 / A320 / A330 / A350
      families populated)
- [x] Cargo fire suppression bound (FAR 121 App. P §1(d))
- [x] OpsSpecs loader (cache: 'no-store')
- [x] PBN requirements derivation + validation
- [x] TAF parser (ETA ±1hr window vs C055 minima)
- [x] METAR ceiling/vis parser
- [x] Real airport data with verified/heuristic dataQuality flag (~3,400 entries)
- [x] Aircraft ontology (24+ types) — replaces former PERF_TABLE
- [x] Airline ontology (25+ carriers)
- [x] FIR ontology (60+ FIRs)

### Pluggable enterprise integrations
- [x] Fuel-price feed (`mock` / `csv` / `api_fms`) with token references
- [x] MEL deferrals (`mock` / `csv` / `api_amos` / `api_trax` / `api_camo`)
- [x] Crew (`mock` / `csv` / `api_sabre` / `api_jeppesen` / `api_aims`)
- [x] Per-tenant integration config persisted in `integration_configs`
- [x] Test-connection action in admin UI

### Admin configuration
- [x] `/admin/integrations` per-tenant feed selection
- [x] `/admin/dispatchers` cert + currency CRUD with area + type quals
- [x] `/admin/ops-specs` seven OpsSpec blocks
- [x] `/admin/ai/memory` per-tenant GAAS memory facts

### GAAS AI layer
- [x] 5 per-phase planning agents (`Brief`, `Route`, `Fuel`, `Aircraft`, `Release`)
- [x] `PlannerOrchestrator` phase routing
- [x] `PlanningBaseAgent` substrate (RAG + audit metadata)
- [x] Pluggable embeddings (`mock` / `voyage` / `openai`)
- [x] Pluggable vector store (`InMemoryVectorStore` + `RemoteVectorStore` scaffold)
- [x] RAG retrieval with cosine search + recency re-rank + grouped formatting
- [x] Per-tenant memory API + admin UI
- [x] Auto-backfill of rejection comments into vector store
- [x] Audit trail in `AgentResult.{retrievalSource,retrievedDocIds}`
- [x] Migration `012_ai_corpus.sql` — pgvector + corpus + retrieval log + RLS

### Database (12 schema migrations)
- [x] `001_schema` — base tables
- [x] `002_seed` — demo data
- [x] `003_multi_tenant` — tenants + RLS
- [x] `004_flight_plans` — plans + reviews
- [x] `005_integration_configs` — per-tenant integration config
- [x] `006_add_flight_planner_user` — planner role + demo user
- [x] `007_flight_plans_text_id` — flight_id relax (transitional)
- [x] `008_flight_plans_uuid_id` — flight_id restore + FK
- [x] `009_dispatcher_certifications` — cert table + currency dates
- [x] `010_ops_specs` — OpsSpecs (7 JSONB blocks) with per-tenant default seed
- [x] `011_pbn_oceanic_defaults` — backfill RNP-4 + RNP-10 (idempotent)
- [x] `012_ai_corpus` — pgvector + corpus + retrieval audit

### Documentation
- [x] `GAAS-AIRLINEOS.md` — comprehensive end-to-end reference (15 sections, 8 Mermaid
      diagrams)
- [x] `requirements.md` — current functional + non-functional requirements
- [x] `design.md` — current architecture decisions

---

## ⏳ Pending — GAAS layer

Next iterations of the AI substrate.

- [ ] Wire `RouteAgent`, `FuelAgent`, `AircraftAgent`, `ReleaseAgent` into
      `lib/planner-phases.ts`. Built and tested today; only `brief` is wired.
      One-line each. (~2 hr)
- [ ] Swap `InMemoryVectorStore` for `RemoteVectorStore` in production. Migration 012
      ships the schema; need `/planning/vector/*` Lambda handler. (~1 day)
- [ ] MemoryAgent — auto-extract facts from approved/rejected pairs. Watches the diff
      between draft and final OFP and proposes new memory facts for human approval. (~1 day)
- [ ] Streaming agent responses (token-by-token UI). Anthropic SDK supports it; UI work too.
      (~1 day)
- [ ] Vercel AI Gateway integration. Routes Anthropic + Voyage + OpenAI calls through one
      observable proxy with cost tracking and provider fallback. (~0.5 day)
- [ ] Migrate the four customer-facing agents (`Search`, `Recommendation`, `Support`,
      `Disruption`) to `PlanningBaseAgent`. Each is a 3-line change + retrieval-kind
      decision. (~1 hr each)

---

## ⏳ Pending — dispatch core gaps

From `flight_planning_design.md` §1A.

- [ ] **#4 ICAO Form 7233-4 generator** — produce the filing string with Items 7/9/10/13/15/
      16/18/19 from the OFP. Ready for ARINC/SITA submission. (~1 day)
- [ ] **#6 Re-dispatch fuel ("decision-point procedure")** — initially plan to closer
      alternate, re-release en route. Saves fuel on ultra-long-haul by avoiding the FAA
      121.645 10%-of-trip-time padding. (~1 day)
- [ ] **#7 Wind-optimized routing** — replace haversine with 4-D NOAA GFS / ECMWF grid.
      The biggest single design-doc gap; would move the planner out of "first-pass"
      territory. (~2–3 days)
- [ ] **#8 NAT-OTS / PACOTS oceanic tracks** — pull published tracks twice daily, file
      along them for Atlantic/Pacific crossings. Public JSON. (~1 day)
- [ ] **#10 Conflict-zone screening** — Russia/Ukraine/Iran/Yemen polygon-vs-route check
      per EASA Conflict Zone Information Bulletins. Hard-fail dispatch if route crosses.
      (~0.5 day)

---

## ⏳ Pending — cross-cutting

- [ ] **Observability** — every route handler currently bare. Add structured logger (Pino)
      and error tracking (Sentry / Datadog). Wrap Anthropic / Voyage / OpenAI calls.
      Pairs naturally with the AI Gateway switch above. (~0.5 day)
- [ ] **Per-tail OEM perf integration** — replace the type-level `etopsPerf` factors with
      Boeing PEP / Airbus PEP per-tail tables driven by weight + altitude + ISA-deviation.
      Structure already in place; field is named so this slots in. (~1+ days, depends on
      data source)
- [ ] **Real TAF in `aircraft` phase ETOPS alternate weather check** — currently uses METAR
      fltCat as a coarse proxy in `aircraft` phase; the ETA-window TAF check is wired in
      `divert` advisor and could be reused. (~2 hr)

---

## 🔄 Rolling tasks

- Keep `flight-planner-enhancements/requirements.md` updated as additional acceptance
  criteria are added per dispatcher feedback.
- Refresh seeded flight dates periodically via the `003_refresh_flight_dates.sql` ad-hoc
  data refresh.

---

## Verification checklist (current)

When validating a deployment:

- [ ] `npm run dev` boots locally on port 3000 with no env beyond `NEXTAUTH_SECRET` +
      `ANTHROPIC_API_KEY`
- [ ] Sign in via email/password as `admin@x.com`, `planner@x.com`, etc., and role badge
      shows correctly in navbar
- [ ] Search JFK→LHR → mock flights with price/duration/stops; subtitle shows date range +
      passenger breakdown
- [ ] Seat map renders with economy/business/first zones; class fences enforced
- [ ] Checkout produces booking reference + PNR; confirmation email sent
- [ ] `/planner` BA1000 brief phase produces a 120-word summary; response `source` ends
      with `agent:BriefAgent`
- [ ] Adding a memory fact at `/admin/ai/memory` produces `N memorys retrieved` on next
      brief
- [ ] Rejecting a brief with a comment produces `N rejections retrieved` on next brief
- [ ] BA1000 aircraft phase shows `perf: B77W (1.05× / 2.55× / 1.65×, source: first-pass)`
- [ ] `/admin/ops-specs` removing `RNP-4` causes BA1000 route phase to read
      `⛔ PBN: route requires RNP-4`
- [ ] `/planner/divert` BA1000 weather shows header chip
      `wx source: N TAF · M METAR` and per-row pills `✓ alt min taf`
- [ ] Cross-tenant isolation: signing in as a different tenant's admin shows empty
      `/admin/ai/memory`
- [ ] Page refresh during booking flow restores state from localStorage
- [ ] Vercel preview build succeeds; TypeScript strict mode passes

---

## Companion specs

- **`requirements.md`** — what the system does (sibling).
- **`design.md`** — how it's structured (sibling).
- **`flight-planner-enhancements/requirements.md`** — dispatch-enhancement R1–R10
  acceptance criteria.
- **`flight_planning_design.md`** — industry / regulatory context.
- **`../../GAAS-AIRLINEOS.md`** — comprehensive reference with diagrams.
