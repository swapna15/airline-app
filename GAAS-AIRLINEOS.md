# AirlineOS GAAS — Generative AI as a Service for Airline Operations

> A multi-tenant SaaS flight-planning, dispatch, and operations platform where every
> deterministic regulatory engine (ETOPS, OpsSpecs, fuel policy, MEL, crew FDP) is
> wrapped by a **multi-agent generative AI layer** with RAG, per-tenant memory,
> and pluggable vector storage. The AI re-phrases facts and flags risk; humans
> retain operational control under FAR 121.533 / ICAO Annex 6.

---

## Table of contents

1. [Overview](#1-overview)
2. [What makes AirlineOS GAAS unique](#2-what-makes-airlineos-gaas-unique)
3. [Installation](#3-installation)
4. [Configuration for a specific airline (tenant onboarding)](#4-configuration-for-a-specific-airline-tenant-onboarding)
5. [Application features](#5-application-features)
6. [AI features (the GAAS layer)](#6-ai-features-the-gaas-layer)
7. [How it works — architecture](#7-how-it-works--architecture)
8. [Testing the current features](#8-testing-the-current-features)
9. [Advantages over building piecewise](#9-advantages-over-building-piecewise)
10. [Pending items](#10-pending-items)

---

## 1. Overview

AirlineOS is a multi-tenant, multi-airline SaaS platform that combines:

- **A regulated dispatch core** — 8-phase OFP workflow (brief / aircraft / route /
  fuel / weight & balance / crew / slot-ATC / release), backed by deterministic
  engines for ETOPS, OpsSpecs, MEL, crew FDP, fuel, schedule, and tankering.
- **A generative AI layer ("GAAS")** — per-phase agents that consume structured
  facts, retrieve relevant prior knowledge via RAG, and produce dispatcher-grade
  narrative. The AI never invents numbers; it re-phrases what's true.
- **A multi-tenant data plane** — every tenant has its own OpsSpecs, fleet, MEL,
  fuel-price feed, crew roster, vector corpus, and accumulated AI memory, with
  Postgres row-level-security enforcing isolation.

The platform serves both passenger-side workflows (search, seat map, booking,
checkin, gate, coordinator) and staff dispatch workflows (the planner role),
plus an admin surface for tenant-level configuration.

---

## 2. What makes AirlineOS GAAS unique

| Aspect | Most flight-planning tools | AirlineOS GAAS |
|---|---|---|
| AI role | Single chat assistant or none | **Five specialised per-phase agents** with their own prompts + retrieval sets |
| Numbers | Either deterministic OR LLM-narrated | **Both** — engines compute, agents narrate, hard rule "never invent" |
| Prior knowledge | Forgotten between flights | **Per-tenant memory + RAG** — past rejections, SOPs, incidents inform every plan |
| Tenant config | Hardcoded or per-tenant code branch | **Pure config** — OpsSpecs, fleet, MEL, fuel feed, crew, AI memory all editable in admin UI |
| Vector store | External (Pinecone, Weaviate, etc.) | **In-tenant pgvector** — same Aurora cluster, same RLS, no extra infra |
| Embeddings | Locked to one provider | **Pluggable** — voyage / openai / mock; swap by env var, no code change |
| Audit trail | Either logs OR text source | **Both** — every retrieval logged with score, every fact provenance-tagged, FAA-ready |
| Failure mode | LLM unavailable → error page | **Deterministic engines still run** — agent re-phrasing is decoration, not the answer |

The key insight is that **flight dispatch is a regulated activity where the AI must
augment, not replace, the deterministic engine**. AirlineOS treats LLMs as a
re-phrasing + retrieval layer that sits *above* a fully working planner, not as
the planner itself. The dispatch release is the engine's output; the AI's job is
to make it readable, learn from the dispatcher's rejections, and surface relevant
prior knowledge.

---

## 3. Installation

### 3.1 Prerequisites

- Node.js 22.9+ (or 20.17+)
- npm 11
- Postgres 17+ with `pgvector` extension (production); not required for local dev
- An Anthropic API key (`ANTHROPIC_API_KEY`)
- Optional: AWS account (Lambda + API Gateway + Aurora Serverless v2 + RDS Proxy + Secrets Manager)
- Optional: Voyage AI or OpenAI API key (for production-grade embeddings)

### 3.2 Local development

```bash
git clone https://github.com/swapna15/airline-app
cd airline-app
npm install

# Minimal .env.local
cat > .env.local <<'EOF'
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...
EMBEDDING_PROVIDER=mock
EOF

npm run dev   # → http://localhost:3000
```

Local dev runs entirely in-process:
- `MockAdapter` for flights / bookings
- `lib/planner-store.ts` in-memory map for plans
- `lib/ai/vector-store.ts` in-memory map for the RAG corpus
- `MockEmbeddingProvider` for embeddings (deterministic hash-based)

You can sign in with any email — the role is derived from the prefix:
`admin@…` → admin, `planner@…` → flight_planner, `gate@…` → gate_manager,
anything else → passenger.

### 3.3 Production deployment

#### 3.3.1 AWS infrastructure (Terraform)

```bash
cd infra/terraform
terraform init
terraform plan -var="frontend_url=https://your-app.vercel.app" \
               -var="nextauth_secret=$(openssl rand -base64 32)"
terraform apply
```

This provisions: VPC + NAT, Aurora Serverless v2, RDS Proxy, Secrets Manager,
Lambda functions (users, flights, bookings, checkin, gate, admin, planning,
migrate, authorizer), and API Gateway REST API with JWT authorizer.

#### 3.3.2 Run migrations

```bash
aws lambda invoke --function-name airline-app-migrate --payload '{}' /tmp/out.json
cat /tmp/out.json
# {"applied":["001_schema",...,"012_ai_corpus"], "skipped":[]}
```

Migration `012_ai_corpus` creates the `vector_documents` and `vector_retrievals`
tables with pgvector indexing, scoped by `tenant_id` with RLS.

#### 3.3.3 Vercel deployment

```bash
vercel --prod
```

Required env vars on Vercel:
- `NEXTAUTH_SECRET` — must match Lambda's
- `NEXTAUTH_URL` — your Vercel URL
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_API_URL` — the API Gateway URL output by Terraform
- `EMBEDDING_PROVIDER=voyage` (or `openai`)
- `VOYAGE_API_KEY` or `OPENAI_API_KEY`

---

## 4. Configuration for a specific airline (tenant onboarding)

A new airline tenant is fully configured via the admin UI — no code changes.

### 4.1 Create the tenant record

In Postgres (via the admin UI or directly):

```sql
INSERT INTO tenants (slug, name, brand_primary_color, brand_logo_url)
VALUES ('aerospica', 'Aerospica Airlines', '#0A2342', 'https://...');
```

Migration 010 auto-seeds default OpsSpecs for any tenant without one.

### 4.2 Configure OpsSpecs (`/admin/ops-specs`)

The seven blocks the planner consumes:

| Block | OpsSpec ref | What to set | Used by |
|---|---|---|---|
| Fuel policy | — | contingency %, alternate min, reserve min, taxi kg | fuel phase |
| Alternate minima | C055 | destination + alternate ceiling/vis | divert advisor, brief |
| ETOPS approval | B044 | maxMinutes, authorizedTypes | aircraft phase |
| PBN authorizations | C063 / B036 | RNAV + RNP levels you're approved for | route phase |
| Cost index | — | default + per-type overrides | route phase |
| Authorized airports | A030 / A032 | ICAO list, empty = no restriction | divert + brief |
| Notes | — | free-form admin notes | display only |

### 4.3 Wire integrations (`/admin/integrations`)

Three pluggable per-tenant feeds — all support **mock** / **CSV** / **API+JWT**:

| Domain | Resolver env | Endpoint env |
|---|---|---|
| Fuel prices | `FUEL_PRICE_PROVIDER` (mock\|csv\|api_fms) | `FUEL_PRICE_API_URL` + `FUEL_PRICE_API_TOKEN` |
| MEL deferrals | `MEL_PROVIDER` (mock\|csv\|api_amos\|api_trax\|api_camo) | `MEL_API_URL` + `MEL_API_TOKEN` |
| Crew | `CREW_PROVIDER` (mock\|csv\|api_sabre\|api_jeppesen\|api_aims) | `CREW_API_ROSTER_URL` + `CREW_API_ASSIGNMENTS_URL` + `CREW_API_TOKEN` |

Token references can use `env://VAR` or `secretsmanager:arn:…`.

### 4.4 Provision dispatcher certificates (`/admin/dispatcher-certs`)

Per-dispatcher: certificate number, areas of operation, type qualifications,
§121.463(c) currency dates, license expiry, medical, line check. The release
phase blocks if the calling dispatcher isn't current for the route's area or
the assigned aircraft type.

### 4.5 Seed the AI memory (`/admin/ai/memory`) — new in this PR

This is where the GAAS layer learns about your operation. Add facts the planning
agents should know:

```
Scope: fuel
Title: Tankering threshold raised after Q3 2025 fuel volatility
Body: Internal policy is to recommend tankering only when projected saving
exceeds USD 400 (raised from USD 200) since OPEC+ Q3 cuts.
Tags: tankering, policy
```

Each fact is embedded and surfaces during the matching phase when semantically
similar to the current flight. Scopes: `general`, `brief`, `route`, `fuel`,
`aircraft`, `crew`, `release`.

---

## 5. Application features

### 5.1 Passenger surface
- Natural-language flight search (powered by `SearchAgent`)
- Round-trip aware results, seat map, booking, checkout, my-bookings
- Recommendation upsell via `RecommendationAgent`
- Customer support FAQ via `SupportAgent`
- Disruption advice via `DisruptionAgent`

### 5.2 Staff surfaces

| Page | Role | Feature |
|---|---|---|
| `/checkin` | checkin_agent | PNR/name lookup, 24h window, boarding pass, manifest |
| `/gate` | gate_manager | Status FSM transitions, board passenger, manifest |
| `/coordinator` | coordinator | Cross-flight rebooking, IROPS recovery |
| `/planner` | flight_planner | 8-phase OFP stepper |
| `/planner/divert` | flight_planner | Alternate ranking with C055 minima, authorizedAirports filter, ETOPS, TAF ETA-window check |
| `/planner/cascade` | flight_planner | Delay propagation through fleet rotations |
| `/planner/tankering` | flight_planner | Origin vs dest fuel-price differential, MTOW-aware |
| `/planner/mel` | flight_planner | Per-tail MEL conflict detection, dispatch legality |
| `/planner/deconflict` | flight_planner | 8 conflict types: maintenance, FDP, rest, double-booking |
| `/planner/notams` | flight_planner | Categorised NOTAM board with severity |
| `/planner/sigmet` | flight_planner | World-map polygon overlay, route intersection |
| `/planner/fuel-prices` | flight_planner | Per-airport price dashboard, CSV export |
| `/planner/eod` | flight_planner | End-of-day roll-up |
| `/admin` | admin | Stats, user mgmt, role updates |
| `/admin/ops-specs` | admin | Seven OpsSpec blocks |
| `/admin/integrations` | admin | Per-tenant pluggable feeds |
| `/admin/dispatcher-certs` | admin | FAA / FOO certs + currency |
| `/admin/ai/memory` | admin | **GAAS memory facts (new)** |

### 5.3 Deterministic engines (the regulatory core)

| Engine | File | What it computes |
|---|---|---|
| Fuel | `lib/perf.ts` | Trip + contingency + alternate + reserve + taxi + captains |
| ETOPS | `lib/etops.ts` | EP, alternates within bound, critical fuel, cargo fire suppression cap |
| OpsSpecs | `lib/ops-specs.ts` | Per-tenant policy loader |
| PBN | `lib/pbn.ts` | RNAV/RNP requirements derivation + authorization validation |
| Aircraft ontology | `shared/semantic/aircraft.ts` | Canonical type resolution + perf + ETOPS factors |
| Airline ontology | `shared/semantic/airline.ts` | ICAO/IATA/callsign/alias resolver |
| FIR ontology | `shared/semantic/fir.ts` | 60+ FIRs for SIGMET / oceanic detection |
| TAF parser | `lib/aviationweather.ts` | ETA ±1hr window check vs C055 minima |
| MEL | `lib/mel.ts` | Restriction evaluation, dispatch legality |
| Crew | `lib/crew.ts` | Roster, assignments, FDP |
| Crew fatigue | `lib/crew-fatigue.ts` | 0–100 fatigue score from FDP/rest/timezone |

---

## 6. AI features (the GAAS layer)

### 6.1 The five per-phase agents

Each agent extends `PlanningBaseAgent` (which extends `BaseAgent`). Each has
its own system prompt and its own retrieval kinds.

| Agent | Phase | Retrieval kinds | Output cap |
|---|---|---|---|
| `BriefAgent` | brief | rejection, sop, incident, memory | 700 tok |
| `RouteAgent` | route | rejection, opsspec, regulation, memory | 700 tok |
| `FuelAgent` | fuel | rejection, opsspec, memory | 700 tok |
| `AircraftAgent` | aircraft | rejection, opsspec, incident, memory | 900 tok |
| `ReleaseAgent` | release | rejection, regulation, memory | 800 tok |

The `PlannerOrchestrator` (`core/agents/planning/PlannerOrchestrator.ts`)
routes a phase id to the right agent. `lib/planner-phases.ts` calls
`runAgent(phase, facts, context)` and uses the returned text as the phase
summary.

### 6.2 RAG (Retrieval-Augmented Generation)

`lib/ai/rag.ts:retrieveContext()` pulls relevant docs from the vector store
and formats them as a system-prompt suffix. Steps:

1. Build a phase-summary query from the structured facts (each agent overrides
   `queryFromFacts()` to bias retrieval toward the phase-relevant slice).
2. `vectorStore.search()` returns top-N matches by cosine similarity, filtered
   by tenant + kind + phase + min score.
3. Re-rank by recency (30-day half-life) so fresh docs win ties.
4. Format into named blocks (PAST REJECTIONS / OPERATOR SPECS / SOPs /
   REGULATIONS / TENANT MEMORY / INCIDENTS) — visually quoted, treated as
   reference material not instructions.
5. Truncate each doc to 500 chars (anti-prompt-injection budget).
6. Return the system suffix + an audit list of doc ids.

### 6.3 Memory

`lib/ai/memory.ts` wraps the vector store with a fact-shaped API:

```ts
rememberFact({ scope: 'fuel', title: '...', body: '...', tags: [...] })
listFacts({ scope?, limit? })
deleteFact(id)
```

Facts are stored as `kind='memory'` rows in the vector store, scoped by tenant.
The phase tag drives which agent retrieves them (e.g., a `fuel` scope fact only
appears during the fuel phase).

### 6.4 Vector store (pluggable backend)

`lib/ai/vector-store.ts` defines a `VectorStore` interface with two
implementations:

- **InMemoryVectorStore** — `globalThis`-attached map, HMR-safe, default for
  local dev. No external dependencies.
- **RemoteVectorStore** (scaffold) — forwards to the planning Lambda's
  `/planning/vector/*` endpoints which read/write pgvector via the Aurora
  cluster. Backed by migration `012_ai_corpus`.

Selection happens in `getVectorStore()` — currently both modes use in-memory;
the remote bridge ships when the Lambda endpoints are wired (next iteration).

### 6.5 Embeddings (pluggable provider)

`lib/ai/embeddings.ts` defines `EmbeddingProvider` with three implementations:

- **MockEmbeddingProvider** — deterministic 128-dim hash-vector. Default. No
  API key required. Accuracy is lower than real models but cosine similarity
  ranking still works for round-trip tests.
- **VoyageEmbeddingProvider** — Anthropic's recommended embedding partner.
  Models: `voyage-3` (1024-dim), `voyage-3-large` (1024-dim), `voyage-3-lite`
  (512-dim).
- **OpenAIEmbeddingProvider** — `text-embedding-3-small` (1536) /
  `-large` (3072).

Selection by `EMBEDDING_PROVIDER` env var. No code changes to swap.

### 6.6 Audit trail

Every agent run returns `{ text, retrievalSource, retrievedDocIds }`. The
`retrievalSource` is appended to the phase response's `source` field, e.g.:

```
aviationweather:metar + aviationweather:taf + notam:faa + 3 rejections + 2 memorys retrieved + agent:BriefAgent
```

Migration 012 also provisions `vector_retrievals` — every search call writes
one row with the query, retrieved doc ids, scores, agent name, and flight id,
giving FAA inspectors a per-flight reproducible trail of what informed the AI's
output.

---

## 7. How it works — architecture

### 7.1 Per-phase request flow

```
       /api/planner/[phase]   → planner-phases:phase()
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
  Deterministic engines        OpsSpecs loader          AI: runAgent()
  (perf, etops, pbn, mel,      (cache: 'no-store')             │
   ops-specs, crew, …)                                         │
              │                        │                       ▼
              └─────── facts ──────────┘            ┌─────────────────────┐
                          │                          │ PlannerOrchestrator │
                          ▼                          │       │              │
                  PhaseResult.data                  │       ▼              │
                                                    │  Per-phase agent    │
                                                    │       │              │
                                                    │       ▼              │
                                                    │  RAG.retrieveContext │
                                                    │       │              │
                                                    │       ▼              │
                                                    │  VectorStore.search │
                                                    │       │              │
                                                    │       ▼              │
                                                    │  Anthropic.messages │
                                                    └──────┬──────────────┘
                                                            │
                                                            ▼
                                                  PhaseResult.summary +
                                                  PhaseResult.source
```

### 7.2 Single source of truth

| Concept | Canonical home |
|---|---|
| Aircraft type | `shared/semantic/aircraft.ts` (ICAO/IATA/marketing/family/aliases + perf + ETOPS) |
| Airline | `shared/semantic/airline.ts` (ICAO/IATA/callsign/alias) |
| FIR | `shared/semantic/fir.ts` (ICAO FIR id + label) |
| Airport | `lib/icao.ts` + `lib/airports.json` |
| Flight | `shared/schema/flight.ts` (Zod-validated `OwnFlight` discriminated union) |

Every consumer (planner, divert advisor, ETOPS check, OpsSpecs match) calls
the canonical resolver — no substring matching anywhere.

### 7.3 Multi-tenant isolation

- **JWT-driven** — every request carries the NextAuth JWT with `tenantSlug`.
  The API Gateway authorizer Lambda verifies it and injects the slug into the
  request context.
- **Postgres RLS** — `flight_plans`, `vector_documents`, `vector_retrievals`,
  `dispatcher_certificates` all enforce `tenant_id = current_setting('app.tenant_id')`.
- **Per-tenant config** — OpsSpecs, integration configs, AI memory are all
  keyed by tenant.

---

## 8. Testing the current features

### 8.1 Multi-agent system (this PR)

#### 8.1.1 Verify the BriefAgent runs

1. `npm run dev`
2. Sign in as `planner@x.com` (or any planner email)
3. Go to `/planner` → pick `BA1000 · JFK→LHR · Boeing 777-300ER`
4. Run **Brief** phase
5. The summary text is now produced by `BriefAgent`. The response source
   string ends with `… + agent:BriefAgent` — confirms the orchestrator was
   used (not the legacy `PlanningAgent.summarize`).

#### 8.1.2 Verify RAG retrieval

1. Go to `/admin/ai/memory`
2. Add a memory fact:
   - Scope: `brief`
   - Title: `Volcanic ash advisory near Iceland`
   - Body: `KEF and BIRK are commonly affected by Eyjafjallajökull-area ash plumes April–June. Always cross-check VAAC bulletins for any flight transiting Reykjavik FIR.`
3. Re-run the **Brief** phase for any North Atlantic flight (BA1000 or LH4410)
4. Open DevTools → Network → POST `/api/planner/brief` response
5. `source` field should now read `… + 1 memorys retrieved + agent:BriefAgent`
6. The summary text should reference the volcanic ash concern if the
   embedding-similarity score is high enough (expect ~0.3+ with the mock provider for North-Atlantic-related queries)

#### 8.1.3 Verify rejection-comment auto-backfill

1. After running Brief once, click **Reject** with a comment like `Did not mention destination MVFR forecast`
2. Re-run Brief for the same flight
3. The response source should include `1 rejections retrieved` — proving the
   rejection comment was auto-embedded into the vector store and surfaced via
   RAG on the next pass

#### 8.1.4 Verify per-tenant isolation

1. Sign in as a different tenant's admin (or impersonate via JWT swap)
2. `/admin/ai/memory` should show an empty list — facts don't leak across tenants

### 8.2 Other current features (recap from earlier work)

| Feature | Test path |
|---|---|
| Per-tail ETOPS perf factors | `/planner` → BA1000 Aircraft phase → look for `perf: B77W (1.05× / 2.55× / 1.65×, source: first-pass)` line |
| Cargo fire bound | Same — line shows `within 180 min (OpsSpec B044), cargo fire 195 min not binding` |
| TAF ETA-window for divert | `/planner/divert` → BA1000 weather → header chip `wx source: N TAF · M METAR`, per-row pill `✓ alt min taf` |
| OpsSpec authorizedAirports | `/admin/ops-specs` → set list to `EGKK, LFPG` → `/planner/divert` BA1000 → red banner appears |
| OpsSpec alternate minima | `/admin/ops-specs` → set 1500 ft / 5 SM → divert candidates get `✕ below alt min` pills |
| OpsSpec costIndex | `/admin/ops-specs` → set byType `B77W: 80` → BA1000 Route phase → `(CI 80)` |
| PBN authorization | `/admin/ops-specs` → remove `RNP-4` → BA1000 Route phase → `⛔ PBN: route requires RNP-4` |
| Critical-fuel ETOPS | BA1000 Aircraft phase → look for `Critical fuel (driver: depress)` on long oceanic |

### 8.3 Smoke test all five agents (when wired)

`brief` is wired in this PR; the other four phases (`route`, `fuel`,
`aircraft`, `release`) currently produce summaries deterministically. The
agents are built and ready — wiring is incremental: replace the deterministic
summary string with `await runAgent({phase, facts, context})` in each phase
function. (One-line change per phase; intentionally staged to keep the diff
auditable.)

---

## 9. Advantages over building piecewise

1. **Semantic layer collapses N×M consumer-by-spelling matrix** —
   `Boeing 777` / `B77W` / `77W` / `Boeing-777-300ER` all resolve via one
   call. New variants are one-line edits.
2. **Single source of truth for ETOPS perf** — per-type factors live in the
   ontology; planner, divert, and the agents all read from it. Override one
   place and every consumer updates.
3. **Multi-agent isolation** — each phase has its own prompt + retrieval set.
   A regression in the FuelAgent doesn't affect BriefAgent. Tuning one
   doesn't risk the other.
4. **Provider-pluggable everywhere** — fuel feed, MEL feed, crew feed,
   embeddings, vector store. Mock for dev, CSV for FMS migration, API for
   production.
5. **OpsSpec drives behaviour, not code** — admin edits flow through to
   planner/divert/agents on the next request. No deploy required.
6. **Audit trail by construction** — every agent run carries
   `retrievalSource` + doc ids. Every retrieval (in production) writes to
   `vector_retrievals`. FAA inspector gets a reproducible chain.
7. **AI failure is graceful** — if Anthropic is down, deterministic engines
   still produce a `PhaseResult.data` complete with all the structured
   numbers. Only the prose summary is missing.
8. **Per-tenant memory accumulates** — every rejection comment auto-embeds.
   The longer an airline operates on the platform, the smarter its agents get.
   No retraining, no cost.

---

## 10. Pending items

### 10.1 GAAS layer — next iterations

- **Wire the remaining four agents** (route, fuel, aircraft, release) into
  `lib/planner-phases.ts`. Today the agents are built and tested but only
  `brief` calls the orchestrator. Each is a one-line wire.
- **Replace InMemoryVectorStore in production** with the pgvector-backed
  RemoteVectorStore. Migration 012 already ships the schema; the remaining
  work is a `/planning/vector/*` Lambda handler.
- **Auto-extract memory from approved/rejected pairs** — a "MemoryAgent" that
  reads the diff between draft and final OFPs and proposes new memory facts
  for human approval.
- **Streaming responses** via Anthropic SDK's stream API — currently agents
  block until the full response. Streaming would surface the brief sentence-
  by-sentence in the UI.
- **Vercel AI Gateway integration** — flagged by the Vercel best-practices
  hooks during this PR. Would route Anthropic + Voyage + OpenAI calls through
  one observable proxy with cost tracking and provider fallback. Today the
  codebase calls Anthropic SDK directly (matches the existing
  `core/agents/base.ts` pattern); switching is a future enhancement.
- **Observability** — every route handler is currently bare. Cross-cutting
  concern; planned alongside the AI Gateway switch (one logger for both
  product code and AI calls).

### 10.2 Dispatch features still pending

From `.claude/specs/flight_planning_design.md`:

- **#1 Multi-agent refactor of PlanningAgent** — done in this PR.
- **#4 ICAO Flight Plan Form 7233-4 generator** — generate the filing string
  (Items 7/9/10/13/15/16/18/19) from the OFP.
- **#6 Re-dispatch fuel ("decision-point procedure")** — initially plan to
  closer alternate, re-release en route. Saves fuel on ultra-long-haul.
- **#7 Wind-optimized routing** — replace haversine with 4-D NOAA GFS / ECMWF
  grid. Biggest single design-doc gap.
- **#8 NAT-OTS / PACOTS oceanic tracks** — pull published tracks twice daily,
  file along them.
- **#10 Conflict zone screening** — Russia/Ukraine/Iran/Yemen polygon-vs-route
  check per EASA Conflict Zone Bulletins.

### 10.3 Already shipped (for the record)

- ✅ 8-phase planner workflow (brief / aircraft / route / fuel / W&B / crew / slot-ATC / release)
- ✅ Diversion advisor with C055 minima + authorizedAirports + ETOPS + TAF ETA-window
- ✅ Delay cascade simulator
- ✅ Tankering decision tool
- ✅ MEL impact assessment
- ✅ Schedule deconfliction (8 conflict types)
- ✅ NOTAM briefing board
- ✅ SIGMET / airspace overlay (Leaflet world map)
- ✅ Crew fatigue calculator
- ✅ Fuel price dashboard
- ✅ Real airport data with verified/heuristic dataQuality flag
- ✅ Round-trip data integrity tests
- ✅ Dispatcher certifications + § 121.463 currency
- ✅ Operations Specifications (all seven blocks wired into planning behaviour)
- ✅ ETOPS critical fuel + ±1hr alternate weather + per-tail perf factors + cargo fire bound
- ✅ Semantic ontology (aircraft, airline, FIR, airport)
- ✅ Pluggable integrations (fuel-price, MEL, crew) — mock / CSV / API+JWT
- ✅ Multi-tenant: JWT, RLS, per-tenant OpsSpecs / fleet / MEL / crew / fuel-feed
- ✅ Multi-agent GAAS layer: 5 per-phase agents + RAG + per-tenant memory + pluggable embeddings + pluggable vector store + admin UI

---

## Appendix A — File map (what was added in the GAAS PR)

```
lib/ai/
  embeddings.ts                              # pluggable embedding providers
  vector-store.ts                            # pluggable vector store (in-memory + pgvector scaffold)
  rag.ts                                     # retrieve + format + recency re-rank
  memory.ts                                  # per-tenant fact API
  tenant.ts                                  # JWT → tenant slug helper

core/agents/planning/
  PlanningBaseAgent.ts                       # shared substrate (RAG + audit)
  BriefAgent.ts                              # weather/NOTAM narrative
  RouteAgent.ts                              # route + PBN narrative
  FuelAgent.ts                               # fuel decomposition narrative
  AircraftAgent.ts                           # tail/MEL/ETOPS narrative
  ReleaseAgent.ts                            # go/no-go synthesis
  PlannerOrchestrator.ts                     # phase → agent dispatch

app/api/admin/ai/memory/route.ts             # GET/POST/DELETE memory facts
app/admin/ai/memory/page.tsx                 # admin UI for memory facts
app/admin/page.tsx                           # added link to /admin/ai/memory

infra/db/migrations/012_ai_corpus.sql        # pgvector + corpus + retrieval log
infra/lambdas/migrate/handler.ts             # registered 012

GAAS-AIRLINEOS.md                            # this document
```

## Appendix B — Environment variables reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NEXTAUTH_SECRET` | yes | — | NextAuth JWT signing |
| `NEXTAUTH_URL` | yes | — | Full app URL |
| `ANTHROPIC_API_KEY` | yes | — | Claude API for all agents |
| `NEXT_PUBLIC_API_URL` | no | unset | API Gateway base; unset = mocks |
| `EMBEDDING_PROVIDER` | no | `mock` | `mock` \| `voyage` \| `openai` |
| `VOYAGE_API_KEY` | when `voyage` | — | Voyage AI API key |
| `VOYAGE_MODEL` | no | `voyage-3` | `voyage-3` \| `voyage-3-large` \| `voyage-3-lite` |
| `OPENAI_API_KEY` | when `openai` | — | OpenAI API key |
| `OPENAI_EMBEDDING_MODEL` | no | `text-embedding-3-small` | OpenAI model id |
| `DUFFEL_ACCESS_TOKEN` | no | — | Real flight inventory |
| `FAA_CLIENT_ID` / `FAA_CLIENT_SECRET` | no | — | NOTAM API |
| `FUEL_PRICE_PROVIDER` | no | `mock` | `mock` \| `csv` \| `api_fms` |
| `MEL_PROVIDER` | no | `mock` | `mock` \| `csv` \| `api_amos` \| `api_trax` \| `api_camo` |
| `CREW_PROVIDER` | no | `mock` | `mock` \| `csv` \| `api_sabre` \| `api_jeppesen` \| `api_aims` |
