# AirlineOS — Requirements

## Vision
AirlineOS is an agentic AI platform built on Claude that any airline can plug into their existing infrastructure. It provides a suite of intelligent agents, a pluggable adapter interface, and embeddable UI components — turning any airline's booking flow into a fully AI-assisted experience.

---

## Functional Requirements

### FR1 — Airline Adapter System
- Any airline can implement the `AirlineAdapter` interface to connect their own APIs
- The interface contract includes: `searchFlights`, `getSeatMap`, `createBooking`, `getBooking`, `cancelBooking`
- A built-in `MockAdapter` ships for development and demo purposes
- Adapters are registered at startup via a central `AdapterRegistry`
- Branding (`BrandConfig`: name, logo, primaryColor, secondaryColor, fontFamily) is configurable per adapter

### FR2 — Flight Search
- Users can search by origin, destination, departure date, passengers, and cabin class via a structured form or natural language
- **Trip type toggle**: One Way or Round Trip; switching to one-way clears and disables the return date field
- **Return date**: shown for round trips; enforces a minimum equal to the departure date; search button is disabled until a return date is provided for round-trip searches
- **Passenger picker**: dropdown popover with ＋/− counters for Adults (min 1), Children (age 2–11, min 0), and Infants (under 2, min 0); infants are capped at the number of adults; trigger shows total passenger count (e.g. "3 passengers")
- **Cabin class**: Economy, Business, First Class
- Claude SearchAgent translates natural language into structured `SearchParams` (including trip type, return date, and passenger breakdown); client strips markdown code fences before parsing the JSON response
- Results page header shows origin → destination with "(Return)" label for round trips; subtitle shows departure → return dates and full passenger breakdown (e.g. "2 adults, 1 child")
- Results are filterable by: price, duration, stops, airline, departure time
- Results display: airline, flight number, times, duration, stops, price per class
- Flights are multi-segment (`FlightSegment[]`) to support connecting itineraries

### FR3 — Seat Selection
- Interactive seat map rendered from adapter-provided seat data (`getSeatMap`)
- Seat types: window, middle, aisle — with visual distinction
- Class zones: economy, business, first — switchable view
- Occupied/available/selected states with pricing overlay
- Seat features list (e.g. extra legroom) supported per seat

### FR4 — Passenger Details
- Form for each passenger: title, first/last name, DOB, passport number (optional), passport expiry (optional), nationality (optional)
- Supports adult, child, and infant passenger types
- Each passenger can have an assigned seat
- Contact info: email, phone, full billing address (street, city, state, zip, country)

### FR5 — Checkout & Booking
- Price breakdown: base fare, taxes, fees, seat fees, total
- Supports outbound flight and optional return flight in a single booking
- Mock payment form (card number, expiry, CVV) — no real payments
- On submit: adapter's `createBooking()` is called, returns booking reference + PNR
- Booking stored in session state (React Context + localStorage via `BookingProvider`)
- `reset()` clears both context state and localStorage

### FR6 — Booking Confirmation
- Displays booking reference, PNR, itinerary, passenger names, total paid
- Confirmation status: confirmed / pending / cancelled
- Option to download/print (future)
- Option to manage booking (cancel via `cancelBooking`, retrieve via `getBooking`)

### FR7 — Claude AI Agents
- **SearchAgent**: Natural language → structured `SearchParams`; suggests alternatives
- **RecommendationAgent**: Recommends seat/class based on trip type and preferences
- **SupportAgent**: Answers FAQs, explains policies, handles complaints via chat
- **DisruptionAgent**: Detects disruptions (simulated), suggests rebooking options
- All agents extend `BaseAgent` and use `claude-sonnet-4-6` via the Anthropic SDK
- Agents accept an `AgentContext` (airlineName, flightId, bookingId, …) to personalise responses
- An `AgentOrchestrator` routes requests by intent (`search | recommend | support | disruption`)
- Agents are called server-side via the `/api/agents` endpoint (POST `{ agent, payload, context }`)

### FR8 — Authentication
- Users can register and log in with email/password (credentials-based, mock DB)
- Google OAuth sign-in supported via NextAuth
- Session managed with JWT strategy; sign-in page at `/login`, register at `/register`
- Auth is handled by NextAuth with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET` env vars

### FR9 — Embeddable UI Kit
- All React components are self-contained and accept a `theme` prop
- Airline colors/fonts are injected via CSS variables from branding config
- Components can be used standalone or as a full booking flow
- ClaudeAssistant floating panel is always accessible during booking

---

## Non-Functional Requirements
- NFR1: TypeScript throughout — strict mode
- NFR2: No real external APIs or payments required (mock-first)
- NFR3: Claude calls are made server-side only; `/api/agents` proxies all agent requests (API key never exposed to client)
- NFR4: App must run with `npm run dev` — no infra setup needed
- NFR5: Agents must be extensible — new agent types addable by extending `BaseAgent` and registering an intent in `AgentOrchestrator`
