# Requirements Document

## Introduction

This document specifies enhancements to the existing Flight Planner role (`/planner`) in the airline operations application. The application already has a working 8-phase dispatch workflow, Diversion Advisor, Delay Cascade Simulator, and EOD Ops Report. Several phases currently return mocked data (aircraft, weight & balance, crew, slot/ATC) and three high-value planning tools are entirely absent: Tankering Decision support, MEL Impact Assessment, and Schedule Deconfliction. Additionally, the airport reference data used by the Diversion Advisor relies on heuristic fields that must be replaced with real data, and the in-memory persistence layer must be swapped for the PostgreSQL backend that already exists in the infrastructure.

The enhancements are grouped into six areas:
1. **Tankering Decisions** — fuel price feed + uplift optimisation
2. **MEL Impact Assessment** — per-tail MEL modelling + dispatch legality
3. **Schedule Deconfliction** — tail, crew FDP, and gate conflict detection
4. **Real Airport Data** — replace heuristic `fireCat`, `customs`, and `fuel` fields
5. **PostgreSQL Persistence** — swap `lib/planner-store.ts` for `pg.Pool` queries
6. **Additional Planner Tools** — NOTAM Briefing Board, SIGMET/Airspace Overlay, Crew Fatigue Calculator, Fuel Price Dashboard

---

## Glossary

- **Dispatcher**: A licensed flight dispatcher (role `flight_planner`) who prepares and releases flight plans.
- **Flight_Plan**: A per-flight record tracking the status of all 8 dispatch phases.
- **Phase**: One of the 8 steps in the dispatch workflow: `brief`, `aircraft`, `route`, `fuel`, `weight_balance`, `crew`, `slot_atc`, `release`.
- **MEL**: Minimum Equipment List — a document specifying which aircraft systems may be inoperative while still permitting dispatch.
- **MEL_Item**: A single inoperative system entry on a tail's active MEL, with a category (A/B/C/D), expiry, and operational restrictions.
- **Tail**: A specific aircraft registration (e.g. `G-XLEK`).
- **Tankering**: Uplifting extra fuel at the origin airport to avoid purchasing fuel at the (more expensive) destination.
- **Tankering_Recommendation**: The output of the tankering calculation: whether to tanker, how many extra kilograms, and the projected cost saving.
- **FDP**: Flight Duty Period — the total time a crew member is on duty from report to end of last sector.
- **FTL**: Flight Time Limitations — regulatory limits on FDP, flight time, and rest periods (e.g. EU-OPS, FAR Part 117).
- **Conflict**: A scheduling incompatibility: same tail on overlapping flights, crew FDP violation, or gate double-booking.
- **Deconfliction_Report**: The output of the Schedule Deconfliction tool listing all detected conflicts with severity and suggested resolution.
- **RFF_Category**: ICAO Rescue and Fire Fighting category (1–10) based on the longest aircraft the airport can handle.
- **ETOPS**: Extended-range Twin-engine Operational Performance Standards — requires certified diversion airports within a time radius.
- **Fuel_Price_Feed**: A data source providing Jet-A/Jet-A1 prices per airport in USD/kg or USD/USG.
- **Mock_Price_Feed**: A deterministic in-process price table used when no live fuel price API is configured.
- **Planner_Store**: The persistence abstraction (`lib/planner-store.ts`) that currently uses an in-memory Map and must be replaced by `pg.Pool` queries.
- **Planning_Lambda**: The AWS Lambda at `infra/lambdas/planning/handler.ts` that owns the Postgres-backed planning routes.
- **NOTAM**: Notice to Air Missions — a notice containing information essential to personnel concerned with flight operations.
- **SIGMET**: Significant Meteorological Information — a weather advisory for hazardous conditions affecting aircraft in flight.
- **Crew_Fatigue_Score**: A numeric estimate (0–100) of cumulative fatigue based on duty hours, rest periods, and time-zone crossings.
- **Airport_Data_Source**: The OurAirports-derived `lib/airports.json` file, currently containing heuristic `fireCat`, `customs`, and `fuel` fields.

---

## Requirements

### Requirement 1: Tankering Decision Support

**User Story:** As a Dispatcher, I want to see a tankering recommendation for each flight, so that I can decide whether to uplift extra fuel at the origin to save fuel costs at the destination.

#### Acceptance Criteria

1. WHEN the Dispatcher generates the `fuel` phase for a flight, THE Fuel_Plan_Generator SHALL retrieve the current Jet-A price (USD/kg) for both the origin and destination airports from the Fuel_Price_Feed.
2. WHEN origin and destination prices are available, THE Tankering_Calculator SHALL compute the extra fuel mass (kg) that minimises total fuel cost, accounting for the weight penalty of carrying extra fuel (increased burn rate of 3% per 1,000 kg extra fuel above block fuel).
3. WHEN the cost saving from tankering exceeds USD 200, THE Tankering_Calculator SHALL set the `tankerRecommended` flag to `true` and include the extra kilograms and projected saving in the `fuel` phase `data` object.
4. WHEN the cost saving from tankering is USD 200 or less, THE Tankering_Calculator SHALL set `tankerRecommended` to `false` and include the reason "saving below threshold" in the `data` object.
5. IF the Fuel_Price_Feed is unavailable or returns an error, THEN THE Fuel_Plan_Generator SHALL fall back to the Mock_Price_Feed and include `"source": "mock://fuel-prices"` in the phase response.
6. THE Mock_Price_Feed SHALL provide deterministic prices for all airports in `lib/airports.json`, derived from a static lookup table keyed by IATA region (e.g. North America: 0.85 USD/kg, Europe: 0.95 USD/kg, Middle East: 0.70 USD/kg).
7. THE Fuel_Plan_Generator SHALL include the tankering recommendation in the `fuel` phase `summary` string shown to the Dispatcher, stating origin price, destination price, extra kg, and projected saving.
8. WHEN the Dispatcher approves the `fuel` phase, THE Planner_Store SHALL persist the `tankerRecommended` flag and extra kg alongside the existing fuel phase data.

---

### Requirement 2: MEL Impact Assessment

**User Story:** As a Dispatcher, I want to see the active MEL items for the assigned tail and their operational impact, so that I can confirm the flight is legally dispatchable.

#### Acceptance Criteria

1. WHEN the Dispatcher generates the `aircraft` phase for a flight, THE MEL_Assessor SHALL retrieve the list of active MEL_Items for the assigned tail from the MEL data source.
2. THE MEL_Assessor SHALL evaluate each active MEL_Item against the planned route (origin, destination, distance, ETOPS requirement) and classify its impact as one of: `none`, `operational_restriction`, or `no_dispatch`.
3. WHEN any MEL_Item has impact `no_dispatch`, THE MEL_Assessor SHALL set the `aircraft` phase status to `rejected` and include the blocking MEL item(s) in the `comment` field.
4. WHEN all active MEL_Items have impact `none` or `operational_restriction`, THE MEL_Assessor SHALL set the `aircraft` phase status to `ready` and list all restrictions in the `summary`.
5. WHEN no MEL_Items are active for the tail, THE MEL_Assessor SHALL include "No active MEL items" in the `aircraft` phase `summary`.
6. IF the MEL data source is unavailable, THEN THE MEL_Assessor SHALL use the Mock_MEL_Store and include `"source": "mock://mel-system"` in the phase response.
7. THE Mock_MEL_Store SHALL contain at least one tail with an active MEL_Item of each category (A, B, C, D) to enable end-to-end testing without a live maintenance system.
8. THE MEL_Assessor SHALL never invent MEL item descriptions or regulatory references — all text must come from the data source or the Mock_MEL_Store.
9. WHEN the `aircraft` phase is regenerated after a rejection, THE MEL_Assessor SHALL re-query the MEL data source to reflect any maintenance updates since the last generation.

---

### Requirement 3: Schedule Deconfliction

**User Story:** As a Dispatcher, I want to detect scheduling conflicts across tails, crew, and gates before releasing a flight plan, so that I can resolve them before they cause operational disruptions.

#### Acceptance Criteria

1. WHEN the Dispatcher opens the Schedule Deconfliction tool (`/planner/deconflict`), THE Deconfliction_Engine SHALL scan all rotations in the fleet plan and produce a Deconfliction_Report.
2. THE Deconfliction_Engine SHALL detect tail conflicts: a single Tail assigned to two or more flights whose block times overlap (STD of later flight < STA of earlier flight + minimum ground time).
3. THE Deconfliction_Engine SHALL detect crew FDP violations: a crew member whose planned FDP for a duty sequence exceeds the applicable FTL limit (default: 14 hours for augmented long-haul, 13 hours for non-augmented).
4. THE Deconfliction_Engine SHALL detect gate conflicts: two flights assigned the same gate at the same airport with overlapping ground times.
5. WHEN a conflict is detected, THE Deconfliction_Engine SHALL assign it a severity of `critical` (tail or crew FDP) or `advisory` (gate).
6. THE Deconfliction_Report SHALL include, for each conflict: conflict type, affected flight numbers, tail or crew ID, overlap duration in minutes, severity, and a suggested resolution string.
7. WHEN no conflicts are detected, THE Deconfliction_Engine SHALL return an empty conflicts array and a `"status": "clean"` field.
8. WHILE the Deconfliction_Engine is scanning, THE Deconfliction_Tool_UI SHALL display a loading indicator and disable the "Re-scan" button.
9. THE Deconfliction_Engine SHALL complete its scan within 5 seconds for a fleet plan containing up to 200 legs.
10. IF the fleet plan data source is unavailable, THEN THE Deconfliction_Engine SHALL fall back to `lib/fleet.ts` rotation data and include `"source": "mock://fleet-plan"` in the report.

---

### Requirement 4: Real Airport Data for Diversion Advisor

**User Story:** As a Dispatcher, I want the Diversion Advisor to use accurate RFF category, customs availability, and fuel availability data, so that I can trust the alternate airport rankings for ETOPS and emergency diversions.

#### Acceptance Criteria

1. THE Airport_Data_Source SHALL provide a real ICAO RFF category (integer 1–10) for each airport, replacing the current heuristic (large=9, medium=7).
2. THE Airport_Data_Source SHALL provide a `customs24h` boolean indicating whether the airport has 24-hour customs and immigration service, replacing the current heuristic derived from airport size and scheduled service.
3. THE Airport_Data_Source SHALL provide a `fuelTypes` array listing available fuel grades (e.g. `["Jet-A", "Jet-A1", "Avgas"]`) per airport, replacing the current single `fuel` field heuristic.
4. WHEN the `import-ourairports.mjs` script is run, THE Airport_Import_Script SHALL merge the OurAirports base data with a supplementary JSON file (`scripts/airport-supplements.json`) that contains real `fireCat`, `customs24h`, and `fuelTypes` values for the top 500 busiest airports.
5. WHEN an airport is not present in the supplementary file, THE Airport_Import_Script SHALL retain the existing heuristic values and set a `dataQuality` field to `"heuristic"`.
6. WHEN an airport is present in the supplementary file, THE Airport_Import_Script SHALL use the supplementary values and set `dataQuality` to `"verified"`.
7. THE Diversion_Advisor SHALL use the `fireCat` field from the Airport_Data_Source when evaluating RFF adequacy, and SHALL display the `dataQuality` indicator alongside each alternate in the ranked list.
8. WHEN the Dispatcher filters alternates by `dataQuality = "verified"`, THE Diversion_Advisor SHALL return only airports with verified data.
9. THE Airport_Data_Source SHALL be regenerated without downtime — the import script writes to a staging file and atomically replaces `lib/airports.json` on success.

---

### Requirement 5: PostgreSQL Persistence

**User Story:** As a Dispatcher, I want flight plans to persist across server restarts and be accessible to all dispatchers on the team, so that work is not lost and the team can collaborate on the same plan.

#### Acceptance Criteria

1. WHEN `NEXT_PUBLIC_API_URL` is set, THE Planner_Store SHALL route all read and write operations to the Planning_Lambda via the existing `GET/PUT /planning/flight-plans/{flightId}` and `POST /planning/flight-plans/{flightId}/reviews` endpoints.
2. WHEN `NEXT_PUBLIC_API_URL` is unset, THE Planner_Store SHALL continue to use the in-memory Map (current behaviour) so local development requires no database.
3. THE Planning_Lambda SHALL persist all 8 phase JSONB columns including the new `tankerRecommended` and `melItems` fields added by Requirements 1 and 2, without requiring a schema migration (JSONB columns absorb new fields).
4. WHEN a flight plan is released (`status = 'released'`), THE Planning_Lambda SHALL return HTTP 409 on any subsequent PUT, preserving immutability of released plans.
5. THE Planning_Lambda SHALL enforce tenant isolation: a Dispatcher may only read and write plans belonging to their own `tenant_id`, derived from the JWT authorizer context.
6. WHEN the Planning_Lambda receives a PUT for a flight plan that does not yet exist, THE Planning_Lambda SHALL create a draft plan using `INSERT … ON CONFLICT DO UPDATE` (idempotent upsert).
7. THE Planner_Store interface (function signatures in `lib/planner-store.ts`) SHALL remain unchanged so that no API route or UI component requires modification when switching backends.
8. WHEN the Planning_Lambda is unavailable and `NEXT_PUBLIC_API_URL` is set, THE Planner_Store SHALL log the error and fall back to the in-memory store for the duration of the request, returning a `"source": "fallback://in-memory"` indicator in the response.

---

### Requirement 6: NOTAM Briefing Board

**User Story:** As a Dispatcher, I want a dedicated NOTAM board that aggregates and categorises active NOTAMs for all airports in today's schedule, so that I can quickly identify operationally significant notices without reading each flight brief individually.

#### Acceptance Criteria

1. WHEN the Dispatcher opens the NOTAM Briefing Board (`/planner/notams`), THE NOTAM_Board SHALL fetch active NOTAMs for all origin and destination airports in the current day's rotation schedule.
2. THE NOTAM_Board SHALL categorise each NOTAM into one of: `runway`, `taxiway`, `navaid`, `airspace`, `procedure`, or `other`.
3. THE NOTAM_Board SHALL display NOTAMs sorted by category, then by airport ICAO code, then by effective start time ascending.
4. WHEN a NOTAM affects a runway at an airport used by a flight in today's schedule, THE NOTAM_Board SHALL highlight that NOTAM with a `critical` badge and list the affected flight numbers.
5. THE NOTAM_Board SHALL refresh its data every 15 minutes while the page is open, without requiring a full page reload.
6. IF the FAA NOTAM API is unavailable, THEN THE NOTAM_Board SHALL display the last successfully fetched data with a staleness timestamp and a warning banner.
7. THE NOTAM_Board SHALL allow the Dispatcher to filter NOTAMs by airport, category, and severity.
8. WHEN the Dispatcher clicks a NOTAM, THE NOTAM_Board SHALL expand the full NOTAM text in a detail panel.

---

### Requirement 7: SIGMET / Airspace Overlay

**User Story:** As a Dispatcher, I want to see active SIGMETs and restricted airspace overlaid on a route map, so that I can visually assess weather and airspace hazards along planned routes.

#### Acceptance Criteria

1. WHEN the Dispatcher opens the SIGMET Overlay tool (`/planner/sigmet`), THE SIGMET_Overlay SHALL fetch all active international SIGMETs from AviationWeather.gov (`/api/data/isigmet`).
2. THE SIGMET_Overlay SHALL display each SIGMET as a shaded polygon on a world map, colour-coded by hazard type: red for turbulence, orange for icing, purple for volcanic ash, grey for other.
3. WHEN the Dispatcher selects a flight from the schedule, THE SIGMET_Overlay SHALL draw the great-circle route for that flight and highlight any SIGMET whose bounding polygon intersects the route within ±100 nm.
4. THE SIGMET_Overlay SHALL display the SIGMET hazard type, altitude range (FL), valid time window, and issuing FIR for each intersecting SIGMET in a sidebar.
5. THE SIGMET_Overlay SHALL refresh SIGMET data every 10 minutes while the page is open.
6. IF AviationWeather.gov is unavailable, THEN THE SIGMET_Overlay SHALL display the last successfully fetched SIGMETs with a staleness timestamp.
7. THE SIGMET_Overlay SHALL render correctly on screens with a minimum width of 1024 px.

---

### Requirement 8: Crew Fatigue Calculator

**User Story:** As a Dispatcher, I want to calculate a fatigue score for each crew member based on their recent duty history, so that I can identify fatigued crew before assigning them to a flight.

#### Acceptance Criteria

1. WHEN the Dispatcher generates the `crew` phase for a flight, THE Crew_Fatigue_Calculator SHALL compute a Crew_Fatigue_Score (0–100) for each assigned crew member based on: cumulative FDP hours in the preceding 7 days, number of rest periods shorter than 10 hours, and number of time-zone crossings (each crossing of 3+ hours counts as one unit).
2. WHEN a crew member's Crew_Fatigue_Score exceeds 70, THE Crew_Fatigue_Calculator SHALL flag that crew member as `high_fatigue` and include a warning in the `crew` phase `summary`.
3. WHEN a crew member's Crew_Fatigue_Score exceeds 85, THE Crew_Fatigue_Calculator SHALL set the `crew` phase status to `rejected` and include the affected crew member(s) in the `comment` field.
4. THE Crew_Fatigue_Calculator SHALL display the score breakdown (FDP contribution, rest contribution, timezone contribution) in the `crew` phase `data` object.
5. IF the crew scheduling system is unavailable, THEN THE Crew_Fatigue_Calculator SHALL use the Mock_Crew_Store and include `"source": "mock://crew-scheduling"` in the phase response.
6. THE Mock_Crew_Store SHALL contain at least one crew member with a Crew_Fatigue_Score above 85 to enable end-to-end testing of the rejection path.
7. THE Crew_Fatigue_Calculator SHALL never invent duty history — all inputs must come from the crew scheduling system or the Mock_Crew_Store.

---

### Requirement 9: Fuel Price Dashboard

**User Story:** As a Dispatcher, I want a dashboard showing current fuel prices at all airports in today's schedule, so that I can make informed tankering decisions across the entire day's operation.

#### Acceptance Criteria

1. WHEN the Dispatcher opens the Fuel Price Dashboard (`/planner/fuel-prices`), THE Fuel_Price_Dashboard SHALL display the current Jet-A/Jet-A1 price (USD/kg) for every airport appearing as an origin or destination in today's rotation schedule.
2. THE Fuel_Price_Dashboard SHALL highlight airports where the price is more than 15% above the fleet-wide average price with an amber indicator, and more than 30% above with a red indicator.
3. THE Fuel_Price_Dashboard SHALL display the price source (`live` or `mock`) and the timestamp of the last price update for each airport.
4. THE Fuel_Price_Dashboard SHALL show the tankering opportunity summary: for each origin–destination pair in today's schedule, the estimated saving (USD) if tankering is applied, sorted by saving descending.
5. THE Fuel_Price_Dashboard SHALL refresh price data every 30 minutes while the page is open.
6. IF the Fuel_Price_Feed is unavailable, THEN THE Fuel_Price_Dashboard SHALL display Mock_Price_Feed data with a prominent "MOCK PRICES — not for release" banner.
7. THE Fuel_Price_Dashboard SHALL allow the Dispatcher to export the price table as a CSV file.

---

### Requirement 10: Round-Trip Data Integrity for Persistence

**User Story:** As a Dispatcher, I want to be confident that saving and reloading a flight plan produces exactly the same data, so that no information is silently lost during persistence.

#### Acceptance Criteria

1. FOR ALL FlightPlan objects with any combination of phase statuses, saving a plan to the Planner_Store and immediately reloading it SHALL produce an object equal to the original (round-trip property).
2. FOR ALL FlightPlan objects, the `phases` map SHALL always contain exactly the 8 canonical phase keys (`brief`, `aircraft`, `route`, `fuel`, `weight_balance`, `crew`, `slot_atc`, `release`) after a load, even if some were not explicitly saved.
3. WHEN a FlightPlan is saved with `status = 'released'`, THE Planner_Store SHALL preserve `releasedAt` and `releasedBy` across a reload without truncation or type coercion.
4. THE Planner_Store SHALL reject a save of a FlightPlan whose `flightId` is an empty string, returning an error rather than silently creating an invalid record.
