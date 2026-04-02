# AirlineOS — Design

## Architecture Overview

AirlineOS has three layers:
1. **Core** — Airline adapters, agent orchestration, booking engine (framework-agnostic TypeScript)
2. **App** — Next.js 14 App Router pages and API routes
3. **UI** — React components themed per airline

```
airline-app/
├── .claude/
│   ├── specs/
│   │   ├── requirements.md
│   │   ├── design.md
│   │   └── tasks.md
│   └── commands/
│       ├── add-airline.md       # Slash command: scaffold new airline adapter
│       └── run-agent.md         # Slash command: invoke a specific agent
│
├── core/
│   ├── adapters/
│   │   ├── types.ts             # Re-exports AirlineAdapter + BrandConfig from types/
│   │   ├── registry.ts          # AdapterRegistry (singleton)
│   │   └── mock/
│   │       └── index.ts         # MockAdapter (demo data, no real API)
│   ├── agents/
│   │   ├── base.ts              # BaseAgent class (shared Claude call logic, AgentContext)
│   │   ├── SearchAgent.ts       # NL query → SearchParams
│   │   ├── RecommendationAgent.ts  # Seat/class recommendations
│   │   ├── SupportAgent.ts      # FAQ + policy answers
│   │   └── DisruptionAgent.ts   # Disruption detection + rebooking
│   └── orchestrator.ts          # AgentOrchestrator: routes by AgentIntent
│
├── types/
│   ├── airline.ts               # AirlineAdapter, BrandConfig
│   ├── flight.ts                # Airport, Airline, Flight, FlightSegment, Seat, SearchParams, CabinClass
│   └── booking.ts               # Passenger, ContactInfo, BookingRequest, BookingConfirmation, BookingDetails, PriceBreakdown
│
├── utils/
│   ├── mockData.ts              # generateMockFlights(), generateSeatMap(), AIRPORTS constant
│   └── bookingStore.tsx         # BookingProvider + useBooking() hook (React Context + localStorage)
│
├── auth.ts                      # NextAuth config (Google + Credentials providers, JWT sessions)
│
├── app/
│   ├── layout.tsx               # Root layout: SessionProvider + BookingProvider + Navbar + theme injection
│   ├── page.tsx                 # Home: SearchForm + Claude NL search bar
│   ├── providers.tsx            # Client-side SessionProvider wrapper
│   ├── login/page.tsx           # Sign-in: email/password + Google SSO
│   ├── register/page.tsx        # Registration form
│   ├── search/
│   │   ├── SearchForm.tsx       # Search form: NL bar, trip type toggle, date fields, PassengerPicker, cabin class
│   │   └── results/page.tsx     # Flight results; header shows trip type, dates, full passenger breakdown
│   ├── booking/
│   │   ├── seats/page.tsx       # Seat map selection
│   │   ├── passengers/page.tsx  # Passenger + contact form
│   │   ├── checkout/page.tsx    # Price summary + mock payment
│   │   └── confirmation/page.tsx # Booking reference + itinerary
│   └── api/
│       ├── claude/route.ts      # Anthropic API proxy
│       ├── agents/route.ts      # Agent dispatch endpoint (POST {agent, payload, context})
│       └── flights/route.ts     # Flight search via registered adapter
│
└── components/
    ├── Navbar.tsx
    ├── FlightCard.tsx
    ├── SeatMap.tsx
    ├── PriceSummary.tsx
    └── ClaudeAssistant.tsx      # Floating chat panel (agent-aware)
```

---

## Airline Adapter Interface

```typescript
// types/airline.ts
export interface BrandConfig {
  name: string;
  logo: string;           // URL or emoji
  primaryColor: string;   // hex
  secondaryColor: string; // hex
  fontFamily?: string;
}

export interface AirlineAdapter {
  id: string;
  brand: BrandConfig;
  searchFlights(params: SearchParams): Promise<Flight[]>;
  getSeatMap(flightId: string, cabinClass: CabinClass): Promise<Seat[][]>;
  createBooking(details: BookingRequest): Promise<BookingConfirmation>;
  getBooking(bookingId: string): Promise<BookingDetails>;
  cancelBooking(bookingId: string): Promise<void>;
}
```

Any airline creates a class implementing `AirlineAdapter` and registers it:
```typescript
AdapterRegistry.register(new MyAirlineAdapter());
```

---

## Agent Architecture

All agents extend `BaseAgent`:
```typescript
// core/agents/base.ts
export interface AgentContext {
  airlineName?: string;
  flightId?: string;
  bookingId?: string;
  [key: string]: unknown;
}

export abstract class BaseAgent {
  protected model = 'claude-sonnet-4-6';
  abstract systemPrompt: string;
  abstract name: string;

  async invoke(userMessage: string, context?: AgentContext): Promise<string>
}
```

System prompts support `{airline}` interpolation via `buildSystemPrompt(context)` — replaced with `context.airlineName` at call time.

### SearchAgent
- System prompt: extracts origin, destination, departure date, return date, trip type, passengers (adults/children/infants), and cabin class from natural language. Returns `SearchParams` JSON.
- Input: natural language string (e.g. "return flights NYC to London next Friday, 2 adults 1 child business class")
- Output: `SearchParams` JSON (client strips markdown code fences before parsing)

### RecommendationAgent
- System prompt: seat/class expert — recommends based on flight details and passenger preferences
- Input: flight details + passenger count + trip purpose
- Output: recommendation with rationale

### SupportAgent
- System prompt: customer support for `{airline}` — answers baggage, check-in, policy, and booking questions
- Input: user question + booking context
- Output: helpful answer

### DisruptionAgent
- System prompt: monitors flight disruptions — suggests best rebooking options given delay/cancellation
- Input: original flight + available alternatives
- Output: ranked suggestions with reasoning

---

## AgentOrchestrator

```typescript
// core/orchestrator.ts
export type AgentIntent = 'search' | 'recommend' | 'support' | 'disruption';

export class AgentOrchestrator {
  async route(intent: AgentIntent, payload: string, context?: AgentContext): Promise<string>
}

export const orchestrator = AgentOrchestrator; // singleton export
```

The `/api/agents` route dispatches via the orchestrator:
```
POST /api/agents
{ "agent": "search" | "recommend" | "support" | "disruption", "payload": "...", "context": { ... } }
→ { "result": "..." }
```

The orchestrator is imported dynamically (server-side only) inside the route handler to avoid bundling the Anthropic SDK on the client.

---

## Authentication

Handled by NextAuth (`auth.ts`):
- **Providers**: Google OAuth + Credentials (email/password)
- **Session strategy**: JWT
- **Pages**: sign-in at `/login`, registration at `/register`
- **Credentials authorize**: mock lookup (replace with real DB); returns `{ id, name, email }`
- **Environment variables required**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`
- `SessionProvider` is wrapped in `app/providers.tsx` (client component) and mounted in `app/layout.tsx`

---

## State Management

`BookingContext` (in `utils/bookingStore.tsx`) holds the full booking session:
```typescript
interface BookingState {
  adapter: AirlineAdapter;        // defaults to MockAdapter, never null
  searchParams: SearchParams | null;
  selectedFlight: Flight | null;
  selectedSeats: Seat[];
  passengers: Passenger[];
  contactInfo: ContactInfo | null;
  priceBreakdown: PriceBreakdown | null;
  confirmation: BookingConfirmation | null;
}
```

All state is persisted to `localStorage` (key: `airlineos_booking`) on every update, excluding the `adapter` instance. `reset()` clears both context state and localStorage.

---

## Search Form UI

`app/search/SearchForm.tsx` contains two components:

### `PassengerPicker`
A self-contained dropdown popover (click-outside aware via `useRef` + `mousedown` listener) with ＋/− counters for:
- **Adults** (age 12+, min 1)
- **Children** (age 2–11, min 0)
- **Infants** (under 2, min 0 — capped at adult count)

Trigger button shows total (e.g. "3 passengers"). A "Done" button closes the popover.

### `SearchForm`
Layout: NL bar → trip type toggle → 2×3 grid (origin, destination, departure, return, passengers, class) → search button.

- **Trip type toggle**: pill switcher ("One Way" / "Round Trip"); toggling to one-way resets `returnDate` to `''`
- **Return date**: always rendered in the grid; `disabled` when one-way; `min` attribute set to `departureDate` to prevent invalid ranges
- **Submit guard** (`canSubmit`): requires origin, destination, departure date, and — for round trips — a return date; button is `disabled` otherwise
- **NL auto-fill**: SearchAgent response is parsed and merged into form state, including `tripType` and `returnDate`

---

## Claude API Proxy

`/api/claude` accepts the full Anthropic messages payload and proxies it, keeping the API key server-side.

`/api/agents` wraps specific agent invocations with pre-configured system prompts. The frontend posts `{ agent, payload, context }` and receives `{ result }` — it never constructs raw Claude payloads directly.

---

## Theming

At layout render, the active adapter's `BrandConfig` is injected as CSS variables:
```css
:root {
  --airline-primary: #1a56db;
  --airline-secondary: #e8f0fe;
  --airline-name: "SkyMock Airlines";
}
```
All components reference `var(--airline-primary)` instead of hardcoded colors.
