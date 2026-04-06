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

## Architecture

### Frontend (Next.js 14 App Router)

The app has **two distinct user surfaces** rendered conditionally by role:

1. **Passenger surface** — search, flight results, seat map, booking, checkout, my-bookings
2. **Staff surfaces** — `/checkin`, `/gate`, `/coordinator`, `/admin` — each a role-gated page

Role is stored in the NextAuth JWT and propagated via `session.user.role`. The `middleware.ts` enforces route-level access using `ROUTE_ROLES`. The `Navbar` renders different nav links and a role badge based on session role.

**Booking state** is managed by `utils/bookingStore.tsx` (React Context + localStorage), shared across the multi-step `/booking/*` pages. Each step reads/writes the same context; state is persisted to localStorage so a page refresh during booking restores where the user left off. `reset()` clears both.

**Role system** (`types/roles.ts`):
- 5 roles: `passenger`, `checkin_agent`, `gate_manager`, `coordinator`, `admin`
- In local dev, role is derived from email prefix via `roleFromEmail()` (e.g. `admin@x.com` → admin)
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

`AirlineAdapter` interface abstracts flight search, seat map, booking CRUD. `MockAdapter` is used when `NEXT_PUBLIC_API_URL` is unset. `AdapterRegistry` allows multiple airline adapters to be registered by ID.

### AWS Serverless Backend (`infra/`)

**Schema**: `infra/db/migrations/001_schema.sql` (Aurora PostgreSQL), seeded by `002_seed.sql` (10 airports, 10 airlines, 5 demo users, 6 sample flights with full seat inventory).

**Lambdas** (`infra/lambdas/`) — all TypeScript compiled to CommonJS:
- `shared/db.ts` — singleton `pg.Pool` via RDS Proxy; credentials from Secrets Manager (`DB_SECRET_ARN` env var)
- `shared/response.ts` — standard HTTP helpers with CORS headers
- `authorizer/` — Token Authorizer: validates NextAuth JWT using `NEXTAUTH_SECRET`, injects `{ userId, email, role }` into API Gateway request context
- `users/` — register (bcrypt hash), login (bcrypt compare), get user, update role
- `flights/` — search (round-trip aware, filters by available seats), get flight, seat map
- `bookings/` — create (reserves seats, generates PNR), list, get, cancel (releases seats)
- `checkin/` — lookup by PNR or name, check-in (24h window enforced), boarding pass, flight checkin list
- `gate/` — flight list/detail, status FSM transitions, board passenger, manifest
- `admin/` — stats, paginated user/flight management, role update, soft-delete

**Terraform** (`infra/terraform/`): VPC + NAT, Aurora Serverless v2, RDS Proxy, Secrets Manager, 7 Lambda functions, API Gateway REST API with JWT Token Authorizer. Public routes: `POST /flights/search`, `GET /flights/{id}`, `POST /users/register`, `POST /users/login`. All other routes require the JWT authorizer.

### Next.js API routes → Lambda bridge

`app/api/flights/route.ts`, `app/api/bookings/route.ts`, `app/api/auth/register/route.ts` check `NEXT_PUBLIC_API_URL`:
- **Set** → forward request to the real Lambda endpoint with the session JWT as `Authorization: Bearer`
- **Unset** → fall back to `MockAdapter` or local mock response

`lib/api-client.ts` is a typed client for direct browser→API Gateway calls (used by staff pages).

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXTAUTH_SECRET` | Yes | JWT signing — must match Lambda `NEXTAUTH_SECRET` env var |
| `NEXTAUTH_URL` | Yes | Full app URL (e.g. `https://app.vercel.app`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic SDK for all 4 agents + Claude assistant |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Google OAuth | Google sign-in |
| `NEXT_PUBLIC_API_URL` | No | API Gateway base URL; omit to use Duffel or mock |
| `DUFFEL_ACCESS_TOKEN` | No | Duffel API token (`duffel_test_…` for sandbox). When set and `NEXT_PUBLIC_API_URL` is unset, real flight search is used |

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
