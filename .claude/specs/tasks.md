# AirlineOS — Implementation Tasks

## Phase 1: Foundation
- [x] T1.1 Install additional dependencies: `lucide-react`, `clsx`, `uuid`, `@anthropic-ai/sdk`, `next-auth`
- [x] T1.2 Create `types/airline.ts` — AirlineAdapter interface, BrandConfig
- [x] T1.3 Create `types/flight.ts` — Airport, Airline, Flight, FlightSegment, Seat, SearchParams, CabinClass
- [x] T1.4 Create `types/booking.ts` — Passenger, ContactInfo, BookingRequest, BookingConfirmation, BookingDetails, PriceBreakdown
- [x] T1.5 Create `core/adapters/types.ts` — re-export adapter interface
- [x] T1.6 Create `core/adapters/registry.ts` — AdapterRegistry singleton
- [x] T1.7 Create `core/adapters/mock/index.ts` — MockAdapter with demo data
- [x] T1.8 Create `utils/mockData.ts` — generateMockFlights(), generateSeatMap(), AIRPORTS constant
- [x] T1.9 Create `utils/bookingStore.tsx` — BookingProvider + useBooking() hook (React Context + localStorage)

## Phase 2: Agent Layer
- [x] T2.1 Create `core/agents/base.ts` — BaseAgent with invoke() and AgentContext interface
- [x] T2.2 Create `core/agents/SearchAgent.ts`
- [x] T2.3 Create `core/agents/RecommendationAgent.ts`
- [x] T2.4 Create `core/agents/SupportAgent.ts`
- [x] T2.5 Create `core/agents/DisruptionAgent.ts`
- [x] T2.6 Create `core/orchestrator.ts` — AgentOrchestrator with intent-based routing

## Phase 3: API Routes
- [x] T3.1 Create `app/api/claude/route.ts` — Anthropic proxy
- [x] T3.2 Create `app/api/agents/route.ts` — Agent dispatch via orchestrator (POST `{ agent, payload, context }`)
- [x] T3.3 Create `app/api/flights/route.ts` — Flight search via adapter

## Phase 4: Authentication
- [x] T4.1 Create `auth.ts` — NextAuth config with Google + Credentials providers, JWT session strategy
- [x] T4.2 Create `app/providers.tsx` — client-side SessionProvider wrapper
- [x] T4.3 Build `app/login/page.tsx` — email/password form + Google SSO button
- [x] T4.4 Build `app/register/page.tsx` — registration form

## Phase 5: UI Components
- [x] T5.1 Create `components/Navbar.tsx`
- [x] T5.2 Create `components/FlightCard.tsx`
- [x] T5.3 Create `components/SeatMap.tsx`
- [x] T5.4 Create `components/PriceSummary.tsx`
- [x] T5.5 Create `components/ClaudeAssistant.tsx` — floating chat panel

## Phase 6: Pages
- [x] T6.1 Update `app/layout.tsx` — SessionProvider + BookingProvider + Navbar + theme CSS vars
- [x] T6.2 Build `app/page.tsx` — SearchForm + Claude NL search bar
- [x] T6.3 Build `app/search/SearchForm.tsx` — NL bar, One Way/Round Trip toggle, departure + return date fields, PassengerPicker popover (adults/children/infants with ＋/− counters), cabin class, submit guard
- [x] T6.4 Build `app/search/results/page.tsx` — flight results + filters; subtitle shows trip type, date range, and full passenger breakdown
- [x] T6.5 Build `app/booking/seats/page.tsx` — seat map selection
- [x] T6.6 Build `app/booking/passengers/page.tsx` — passenger + contact form
- [x] T6.7 Build `app/booking/checkout/page.tsx` — price summary + mock payment
- [x] T6.8 Build `app/booking/confirmation/page.tsx` — booking reference + itinerary

## Phase 7: Claude Commands
- [x] T7.1 Create `.claude/commands/add-airline.md` — scaffold new adapter
- [x] T7.2 Create `.claude/commands/run-agent.md` — invoke agent from CLI

## Verification Checklist
- [ ] `npm run dev` — loads at localhost:3000
- [ ] Register + login with email/password works
- [ ] Google SSO redirects and authenticates correctly
- [ ] One Way / Round Trip toggle shows/hides return date correctly; switching to one-way clears return date
- [ ] Return date picker enforces min = departure date; search button disabled until return date is filled for round trips
- [ ] PassengerPicker: Adults min 1, Infants capped at adult count, trigger shows total count
- [ ] NL search "return flights NYC to London next Friday, 2 adults 1 child" → form auto-fills trip type, dates, and passenger counts
- [ ] Search JFK→LHR → mock flights displayed with price/duration/stops
- [ ] Results subtitle shows correct date range and passenger breakdown for both trip types
- [ ] Select flight → seat map renders with economy/business/first zones
- [ ] Fill passengers → checkout shows correct price breakdown
- [ ] Submit checkout → confirmation page with booking reference + PNR
- [ ] ClaudeAssistant responds to "what's the baggage policy?"
- [ ] New airline adapter registers and overrides branding/colors
- [ ] Page refresh during booking restores state from localStorage
