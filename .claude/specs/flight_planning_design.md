Building a Customizable, Multi-Airline SaaS Flight-Planning Platform with AI Agents — A Technical Reference for an AWS Architect
TL;DR
Flight planning is three layered (operational/dispatch, network/commercial, and passenger-trip), but the regulated "safety of flight" core is operational dispatch — anchored in the U.S. by 14 CFR Part 121 Subparts T/U and the FAA Aircraft Dispatcher Certificate (14 CFR Part 65 Subpart C), and globally by ICAO Annex 6 + Annex 1 Flight Operations Officer/Flight Dispatcher (FOO/FD) standards.
A dispatcher's identity is defined by (a) an FAA certificate number / equivalent FOO license, (b) the operator's Operations Specifications (OpsSpecs) that name the areas of operation the dispatcher is authorized for, and (c) the §121.463 area-familiarization (the famous 5-hour observation flight). U.S. dispatchers normally work from a single centralized Operations Control Center (Delta–Atlanta OCC, American–Fort Worth IOC, United–Chicago Willis Tower NOC, Southwest–Dallas NOC) and exercise operational control remotely from those airports — the regulation requires qualification for the area, not physical presence in it. Truly home-based ("work-from-home") dispatch was tested under COVID-era exemptions for SkyWest and Republic but has been heavily restricted; FAA regulations do not categorically prohibit it but it is explicitly authorized airline-by-airline and requires demonstrated equivalent safety. 
Flight Global
For a multi-tenant SaaS, the architecture should treat each airline tenant as a fully-configured "operator profile" (OpsSpecs, fleet/MEL, fuel policy, alternate rules, cost index, AIRAC navigation database, ARINC/SITA messaging endpoints), and treat AI as a decision-support layer wrapping deterministic optimizers — never as the legal decision-maker. Under FAR 121.533 the certificated dispatcher must remain the human-in-the-loop releasing the flight, so authentication, RBAC, and audit must be designed around the dispatcher certificate + area qualification, not just employee SSO. 
eCFR
1. The Three Layers of Flight Planning
Flight planning in commercial aviation is not a single activity; it is three separate domains operating on different timescales, against different criteria, and in many airlines run by different departments. The technical SaaS opportunity is largest in Layer A; Layers B and C are described for context because they constrain Layer A's inputs.

1A. Operational Flight Planning / Dispatch (the safety-of-flight core)
This is the per-flight, day-of-operation production of a dispatch release / operational flight plan (OFP) — the document that must be jointly signed by the dispatcher and the pilot-in-command (PIC) before departure under FAR 121.533(b) for U.S. domestic and flag operations. The OFP fixes the route, fuel, weather analysis, alternates, performance, and equipment status for one specific tail on one specific city pair on one specific day. 
FAR/AIM.org

Route selection. The planner must produce a flyable, ATC-acceptable route between origin and destination respecting:

Great-circle vs. wind-optimized routes — long-haul jets virtually never fly the great circle; instead the route is optimized over a 4-D wind/temperature grid (typically the NOAA GFS or ECMWF model), so a typical JFK→LHR plan is several hundred nm longer than great circle but minutes faster and burns less fuel.
Airways / RNAV / RNP — fixed-radius airways (e.g., J-routes in U.S., L/M/N/P/Q in EUR), Performance-Based Navigation (PBN) RNAV-1/2/5 and RNP-AR specifications. The aircraft's PBN authorization is encoded in the ICAO flight-plan Item 10 (e.g., letter R + the PBN/ specification in Item 18) and must match an entry in OpsSpec C063/B036.
Free-route airspace (FRA) — large parts of European upper airspace and oceanic FIRs now allow user-preferred routes between defined entry/exit points instead of mandatory airways.
Oceanic tracks — the North Atlantic Organised Track System (NAT-OTS) is published twice daily by Gander/Shanwick (eastbound after ~0100Z, westbound after ~1100Z) and the Pacific Organised Track System (PACOTS) is published daily by Oakland and Fukuoka ARTCCs. Filing example in ICAO Item 15: OEP NATA OXP. Crossing the NAT High-Level Airspace (HLA) requires RNP-4 or RNP-10 separation, CPDLC/ADS-C, and aircraft authorization.
Required Navigation Performance (RNP) — values like RNP-10 (oceanic), RNP-4 (advanced oceanic with ADS-C), RNP-2 (continental), RNP-AR (approach with authorization required) constrain which routes/approaches the airframe is eligible for.
Fuel planning. ICAO Annex 6 and the FARs both specify minimum fuel as a sum of components, and the SaaS must compute each per release:

Trip / burn fuel — from optimized route + winds + cost index.
Contingency — typically 5% of trip fuel or 5 minutes at holding speed at 1,500 ft above destination, whichever is greater (EU-OPS / EASA CAT.OP.MPA.181); FAA does not require contingency separately but is built into reserves.
Alternate fuel — fuel from missed approach at destination to landing at the most distant alternate (only required if an alternate is required).
Final reserve — 30 min holding at 1,500 ft AGL for jets (EASA), or 45 min at normal cruise for U.S. domestic IFR (14 CFR 121.639) — note the FAA flag/international rule (121.645) requires fuel to destination + alternate + 10% of trip time + 30 min holding at 1,500 ft, which for many transoceanic flights is the binding constraint. 
Legal Information Institute
Taxi fuel, APU fuel, anti-ice burn, extra/discretionary fuel, tankering — tankering (carrying extra cheap fuel from the origin to avoid expensive fuel at the destination) is a classic mixed-integer optimization decision and can be modeled as a per-leg MIP over the network.
Cost-index optimization — CI is the dimensionless ratio of time-related cost (crew, maintenance, ownership) to fuel cost. FMS uses CI to compute ECON Mach. CI=0 → maximum-range cruise; CI=999/maximum → minimum time. Real-world CIs typically run 5–80 depending on fleet, fuel price, and delay/connection cost. The flight-planning system must compute the OFP at the airline's chosen CI for that route. 
FasterCapital + 3
Weather. The dispatcher integrates:

Surface and upper-air analyses, winds aloft / temperatures aloft (FB / WAFS data) — the primary input to the wind-optimized route.
SIGMETs (significant met info: thunderstorms, severe turbulence, severe icing, volcanic ash, dust storms) and AIRMETs (less severe, U.S.-specific category for IFR conditions, mountain obscuration, moderate icing/turbulence).
METAR / TAF / TAF amendments for departure, destination, alternate, and ETOPS alternates; alternates are required if 121.619 weather thresholds aren't met.
Volcanic Ash Advisory Center (VAAC) products and Tropical Cyclone Advisory products.
Convective forecasts, icing potential (CIP/FIP), turbulence forecasts (GTG, EDR observations from in-service aircraft).
NOTAMs and airspace. The release must screen all NOTAMs along the route and at airports — runway closures, navaid outages, GPS interference, TFRs, military operating areas (MOAs), restricted/prohibited areas, ATC slots/flow restrictions, conflict zones (currently Russia/Ukraine, Belarus, parts of Yemen/Iran/Iraq/Israel/Lebanon airspace per State Department / EASA Conflict Zone Information Bulletins). NOTAMs come from the FAA's NOTAM system and ICAO AFTN; modern providers digitize and filter them.

ETOPS / EDTO. For two-engine aircraft (and now any aircraft under FAA's expanded definition since 2007) operating more than 60 minutes from an adequate alternate, ETOPS rules apply (60, 120, 138, 180, 207, 240, 330, 370 minutes depending on type approval and operator authorization). The planner must:

Designate adequate ETOPS Alternate Airports along the route.
Compute critical-fuel scenarios (engine failure, depressurization, engine failure + depressurization at the equal-time point) — the highest of these or standard fuel becomes the required fuel. 
IVAO Documentation Library
Verify weather minima at each ETOPS alternate ±1 hr from earliest/latest ETA window (typically ILS minima + 200/½ or 400/1 buffers). 
IVAO Documentation Library
Verify time-limited systems (cargo fire suppression — 195 min for many widebodies).
This is governed by 14 CFR Part 121 Appendix P in the U.S. and ICAO Annex 6 Part I Attachment D (now using "EDTO" terminology since Amendment 36, 2012, though FAA retained the "ETOPS" acronym redefined as "ExTended OPerationS"). 
Wikipedia
Performance. The OFP must be feasible against:

Takeoff performance — runway length analysis at expected weight, temperature, wind, slope, contamination, anti-ice; Maximum Takeoff Weight (MTOW) limited by structural, climb, brake-energy, tire-speed, obstacle limits.
Climb / cruise / descent profiles — initial cruise altitude (often weight-limited), step climbs based on optimal altitude vs. wind, descent computation back-solved from the destination.
Landing performance — required field length wet/dry, autoland/CAT II/III approach eligibility, MEL/CDL items.
Weight & Balance — center-of-gravity envelope; integrates with load planning for cargo and passengers.
Aircraft configuration — Minimum Equipment List (MEL) / Configuration Deviation List (CDL) items deferred since the last release.
Alternate-airport selection criteria. The OFP designates:

Destination alternate(s) — required when destination weather forecast within ±1 hour of ETA is below 2,000 ft ceiling and 3 sm visibility (the U.S. "1-2-3 rule" of 121.619), with weather at alternate at or above operator-specific minima from OpsSpec C055.
Takeoff alternate — when departure weather is below landing minimums; typically must be within 1 hour at one-engine-inop cruise (or 2 hours under ETOPS-style relief).
ETOPS / EDTO en-route alternates — meeting the time and weather criteria above.
Re-dispatch / redispatch fuel planning (a.k.a. "decision-point procedure") — common for ultra-long-haul to reduce fuel by initially planning to a closer airport, then re-releasing en route to the actual destination.
Regulatory framework summary.

Region	Operating rule	Personnel licensing	Notes
U.S.	14 CFR Part 121 (scheduled airline)	14 CFR Part 65 Subpart C (Aircraft Dispatcher)	Joint operational control under §121.533. 
Legal Information Institute
EU/EASA	Reg. (EU) 965/2012, Part-CAT, Part-ORO	ORO.GEN.110(c) — operator-trained FOO/FD; no EASA license per se 
LinkedIn
 (EASA NPA 2023-01 proposes mandatory CBTA training aligned to ICAO Doc 10106).	PIC retains full operational responsibility; some member states (e.g., Germany via LBA / LuftPersV) issue national licenses.
ICAO (global SARPs)	Annex 6 Part I Ch. 4	Annex 1 Ch. 4: Flight Operations Officer / Flight Dispatcher License	Doc 7192 D-3 and Doc 10106 (CBTA).
Canada	CARs Part VII	Transport Canada FOO/FD certification	Joint dispatch (similar to U.S.).
India	DGCA CAR Section 7 Series J	DGCA FOO License	License-based; aligned to ICAO.
Filing the flight plan with ATC. Two formats coexist:

ICAO flight plan (FAA Form 7233-4) — the international format defined in ICAO Doc 4444. Items 7 (callsign), 8 (flight rules / type), 9 (number/type/wake category), 10 (equipment & surveillance, e.g. SDE2E3FGHIJ4J5M1RWY/LB1), 13 (departure aerodrome + EOBT), 15 (speed/level/route — e.g. N0480F360 SID1 ABCDE UN601 FGHIJ NATA TUDEP STAR1), 16 (destination + EET + 2 alternates), 18 (PBN/, NAV/, DOF/, REG/, EET/, SEL/, RMK/, etc.), 19 (SAR info).
FAA domestic flight plan (Form 7233-1) — older, simpler; the suffix code (e.g., /L for FMS+RVSM) maps to ICAO Item 10 letters. The FAA mandated ICAO format for any flight requesting RNAV routing in 2008 and is moving to ICAO format universally.
1B. Network / Commercial Flight Planning
This is the multi-week-to-multi-year planning that produces the airline's published schedule and asset deployment. It is a different organization (revenue management, network planning, fleet assignment, scheduling) and runs largely independent of dispatch — though dispatch must execute against the schedule it produces.

Network design — hub-and-spoke (Delta/ATL, AA/DFW+CLT, UA/IAH+ORD+EWR+DEN+SFO, Lufthansa/FRA+MUC) vs. point-to-point (Southwest, Ryanair, easyJet); fortress hubs where one carrier holds >70% of departures (DFW/AA, ATL/DL, CLT/AA); focus cities (intermediate). Hub design balances connectivity and load-factor optimization against complexity costs.
Schedule design and slot management — the IATA Worldwide Airport Slot Guidelines (WASG, currently Edition 4 effective Aug 2025), jointly published by IATA, ACI World, and the Worldwide Airport Coordinators Group (WWACG). Airports are categorized Level 1 (non-coordinated), Level 2 (schedules-facilitated), Level 3 (slot-coordinated, ~200+ globally — LHR, JFK, HND, PEK, FRA). Slots are allocated twice yearly at IATA Slot Conferences (June for next winter, Nov/Dec for next summer); in the U.S. only DCA, LGA, and JFK are slot-controlled. The "use-it-or-lose-it" 80/20 rule preserves historical slots. Slots have substantial market value (Heathrow morning slots have changed hands at $60–75M). 
IATA + 6
Fleet assignment & aircraft routing/tail assignment — the canonical Airline Schedule Planning chain: Schedule Design → Fleet Assignment Problem (FAP) → Aircraft Routing Problem (ARP, a.k.a. tail assignment with maintenance constraints) → Crew Pairing → Crew Rostering. These are NP-hard MIPs, traditionally solved with column generation (Barnhart et al., MIT) and now more often integrated. Vendors: Sabre AirVision, GE/Lufthansa NetLine/Plan, IBM ILOG CPLEX-based tools, Jeppesen Carmen Crew Pairing, AIMS. 
Oxford Academic
Crew pairing and rostering — a pairing is a multi-day round trip starting and ending at a crew base; rostering assigns specific named crew. Constraints come from FAR 117 (flight & duty time), CBAs, and quality-of-life rules.
Demand forecasting, pricing, RM, codeshare/interline — Origin-Destination revenue management (PROS, Sabre AirVision RM), bid-price models, codeshare/interline agreements (IATA MITA), Special Prorate Agreements.
Station / network expansion — airports are evaluated on slot availability, market O&D forecast, ground-handling cost, regulatory/bilateral access (Open Skies treaties), maintenance proximity, station fixed cost.
1C. Passenger Trip Planning (search/booking)
GDS / NDC — Amadeus, Sabre, Travelport are the three majors, ~97% of indirect bookings. They expose EDIFACT (legacy) and NDC (XML/REST/JSON, IATA's New Distribution Capability standard) APIs. NDC adoption is measured by IATA's Airline Retailing Maturity (ARM) Index (replaced the old Level 1–4 NDC certification in 2022). 
AltexSoft
ITA Matrix / QPX / Google Flights — ITA Software (acquired by Google) built the canonical multi-itinerary fare-search engine; QPX powered most metasearch until Google deprecated the public QPX Express API; Google Flights now uses the Travel API.
Fare construction, PNR, ticketing — fares are constructed under IATA Resolution 022x rules; a PNR (Passenger Name Record) holds segments and passenger info; ticketing uses an Electronic Ticket Document (ETD) settled through ARC (in U.S.) or BSP (international).
Personalization, ancillaries, IROPS recovery — airlines push ancillary revenue (seats, bags, lounge, insurance) through NDC; on disruption, OCC re-accommodation tools auto-rebook (United at Willis Tower can rebook a wide-body in minutes per published reporting). 
AirlineReporter
For the SaaS, Layer C is mostly upstream context — it tells your platform what flight needs to be planned, but the platform itself plans Layer A.

2. "Zone and Station" — How a Dispatcher Is Identified, Authorized, and Whether They Must Be On-Site
This is the heart of the user's question. The short answer is: the dispatcher's legal identity is their certificate, the airline's right to use them is the OpsSpecs, the area they may exercise dispatch jurisdiction over is set by the operator's familiarization program under §121.463(d), and they routinely work not at the station of departure or arrival but at a centralized OCC.

2.1 Regulatory Identity of a Dispatcher
United States — FAA Aircraft Dispatcher Certificate. Issued under 14 CFR Part 65 Subpart C. Requirements (§65.53–65.59):

Minimum age 23. 
Northamericanflightcontrol
English language proficiency. 
Northamericanflightcontrol
Either 2 years of qualifying experience in 3 years (assistant dispatcher, etc.) OR completion of an FAA-approved Part 65 Subpart C course (minimum 200 hours of instruction, per Appendix A and §65.61). 
eCFR + 2
Pass the ADX knowledge test (FAA Airman Knowledge Test).
Pass a practical test (PTS FAA-S-8081-10E) with respect to a representative large aircraft. 
eCFR
The certificate, once issued, has no expiration but is only usable when the dispatcher is also operator-current (see 121.463). The dispatcher's certificate number is their primary regulatory identity.

Joint operational control — 14 CFR 121.533 (domestic) and 121.535 (flag). Verbatim:

"The pilot in command and the aircraft dispatcher are jointly responsible for the preflight planning, delay, and dispatch release of a flight in compliance with this chapter and operations specifications." 
Legal Information Institute

The dispatcher is also responsible for monitoring the flight, issuing safety information, and cancelling or redispatching if the flight cannot operate safely. This joint legal responsibility is unique to U.S. and Canadian regulation; many other states put full responsibility on the PIC and the operator's nominated FOO assists but does not co-sign. 
Legal Information Institute
Wikipedia

For supplemental (charter) operations under 121.537, operational control is exercised by the Director of Operations (DO), who may delegate to flight followers — flight followers are not required to hold a dispatcher certificate, in contrast to dispatchers. Part 135 operators use flight followers, not certificated dispatchers. 
FAA
Wikipedia

ICAO — Annex 1 Chapter 4 specifies the Flight Operations Officer / Flight Dispatcher License as one of the licenses for "personnel other than flight crew." Standards cover age (≥21), knowledge (air law, aircraft general, performance/planning, human performance, meteorology, navigation, operational procedures, principles of flight, radiotelephony), and skill (preparing a flight plan, supervising a flight). Annex 6 Part I Ch. 4 makes operator use of FOOs the standard means of operational control. ICAO Doc 10106 (Manual on FOO/FD CBTA, first edition 2024) defines the competency framework; Doc 7192 D-3 is the legacy training manual. 
Wikipedia
ICAO

EASA — operator-trained, no license. EASA's ORO.GEN.110(c) requires operators using a method of operational control with FOOs to train them based on ICAO Doc 7192 D-3 and describe training in the ops manual. There is no EASA license per se; EASA NPA 2023-01 (issued 2023) proposes mandating CBTA training and standardized FOO/FD qualifications aligned to ICAO Doc 10106 to close that gap. Some EU member states (notably Germany via the LBA's LuftPersV) issue national FOO licenses, and bodies like ASISTIM Flight Dispatch Academy operate to those standards. 
LinkedIn + 2

Other jurisdictions (brief). Canada: Transport Canada FOO certification + joint operational control under CARs 705 — closest model to the U.S. India: DGCA FOO License (CAR Section 7 Series J), aligned to ICAO. UAE GCAA, Singapore CAAS, Australia CASA, China CAAC: variations of operator-trained FOO with regulator approval, generally ICAO Annex 6/1 aligned. 
Wikipedia

2.2 Station, Base, Zone Qualifications
14 CFR 121.463 — Aircraft dispatcher qualifications. This is the most operationally specific area-qualification rule and the one that creates the "zone" concept the user asked about:

(a)(2) — Each dispatcher must complete operating familiarization: at least 5 hours observing operations from the flight deck (or forward passenger seat with headset if no observer seat) of an airplane of the group they will dispatch. This may be reduced to 2½ hours by substituting takeoffs and landings (1 T/L = 1 hour). Up to 5 hours of approved Level D simulator time can substitute, with the caveat that if (a) is met by simulator, no T/L reduction is allowed. 
eCFR
(b) — Differences training by type if applicable. 
Legal Information Institute
(c) — Recurrent — within the preceding 12 calendar months, each dispatcher must complete the same 5-hour familiarization in one of the types of each group. 
GovRegs
(d) — The certificate holder must determine the dispatcher is "familiar with all essential operating procedures for that segment of the operation over which he exercises dispatch jurisdiction." A dispatcher qualified for one segment may dispatch through other segments only after coordinating with a dispatcher qualified for that segment. 
GovRegs
The "areas of operation" for which a dispatcher is qualified are the airline's authorized en-route areas defined in its Operations Specifications (OpsSpecs). OpsSpecs are FAA-approved documents (issued by the airline's Principal Operations Inspector at the assigned Certificate Management Office) that define everything the airline is authorized to do — specific airports, areas of en route operation (oceanic FIRs, polar, special MNPS regions), CAT II/III, RNP-AR, EFB use, MEL, ETOPS approval, fuel reserve policies, etc. OpsSpec paragraphs are organized A-Series (general), B-Series (en route), C-Series (airport authorizations), D-Series (maintenance), E-Series (weight & balance), H-Series (operations approvals), etc. (e.g., C055 = alternate weather minima; B036 = RNAV/RNP authorizations; A001 = issuance & applicability).

Related concepts:

Operational control center / SOC / OCC / IOC / NOC — every airline establishes a 24/7 Systems Operations Center where dispatch, crew scheduling, maintenance control, flight following, and customer service coordinate. Naming varies: Delta = OCC (Operations & Customer Center), American = IOC (Integrated Operations Center, the consolidated center after the AA/US merger, ~150,000 ft², ~840 dispatch positions, EF-3 tornado-rated), United = NOC (Network Operations Center, located in Willis Tower in Chicago), Southwest = NOC, JetBlue = SOC (in LIC, NYC), FedEx = GOC (Global Operations Center). FAA AC 120-101 provides guidance on operational control & SOC/SOCC structure. 
Jetblue + 5
FIR / ARTCC / oceanic vs. domestic / mountainous — the FAA defines mountainous areas in 14 CFR Part 95, which affects MEAs, fuel rules, and alternate selection. Oceanic operations require additional dispatcher qualification (and often the airline applies for §121.465 duty-time exemptions for the long-haul familiarization; e.g., FAA Exemption 18274 for National Airlines, or grants for United and Polar Air to support >10-hour observation flights).
IATA station codes vs. ICAO codes — IATA 3-letter (e.g., LAX, JFK, LHR) used for passenger-facing operations and tickets; ICAO 4-letter (e.g., KLAX, KJFK, EGLL) used for ATC, flight planning, and weather (METAR/TAF). The SaaS must speak both fluently and treat ICAO as the canonical key.
"Station" in airline operations — a station is any city/airport where the airline has ground operations, with a station manager, ground-handling crew, ramp/gate agents, fueler arrangements, possibly a maintenance line, and passenger services. The airline's station network is an enumerated list in OpsSpecs paragraph A030/A032 (regular, alternate, refueling, provisional airports). Crucially, the dispatcher need not be at the station — the station personnel handle ground ops while the dispatcher in the OCC handles operational control. 
Legal Information Institute
2.3 Can a Dispatcher Operate Remotely?
The centralized-OCC reality. This is the user's specific concern, and the answer is nuanced:

In normal U.S. major-airline practice, dispatchers are physically centralized at the airline's OCC and are not at the stations they release. Concrete examples:

Airline	OCC location	Approx. dispatcher count
Delta Air Lines	Atlanta (HQ campus, near ATL) 
Diveboard
~180 dispatchers (PAFCA-represented), 
Wikipedia
 one OCC for the whole global network
American Airlines	Fort Worth, TX (Robert L. Crandall Campus, the new IOC south of DFW)	~550 dispatchers (PAFCA-AAL-represented) 
Wikipedia
 for ~6,800 daily flights to ~350 destinations 
Wikipedia
United Airlines	Willis Tower, Chicago 
AirlineReporter
Dispatch + crew + ATC coordination + weather all on one floor; narrow-body and wide-body sides 
AirlineReporter
Southwest Airlines	Dallas (Love Field HQ; new larger NOC opened mid-2010s)	One NOC, point-to-point network
JetBlue	Long Island City, NY (LSC)	One SOC
FedEx	Memphis	GOC, global cargo
A dispatcher in Atlanta releases a Delta flight from Seoul to Detroit; she has never been to either airport. The legal requirement is that she be qualified for the area of operation (per §121.463(d) and OpsSpecs) — qualified, not present. She communicates with the cockpit, the destination station, and ATC via:

ACARS / VHF datalink / SATCOM (ARINC GLOBALink, SITA AIRCOM) to the aircraft itself. 
Learn-atc
Airsatone
Company VHF / phone patch / dispatch frequency for voice.
AFTN / SITA Type-B messaging for flight plans and ATC coordination (CFMU/EUROCONTROL NM in Europe, FAA TFMS in the U.S.).
Internal apps (the dispatch system itself: Sabre Movement Manager / Flight Plan Manager, Lido/Flight, Jeppesen JetPlan/JetPlanner, etc.) for status, weather, NOTAM, performance.
So the OCC model already operates dispatchers "remotely" relative to the flight in the sense the user means.

True work-from-home dispatch. This is what's controversial. FAA regulations do not categorically prohibit a dispatcher from being physically at home rather than at the OCC, but in practice it is allowed only with an explicit FAA authorization specifying conditions. Key data points:

March 2020 — COVID emergency. Under emergency authority, the FAA authorized SkyWest and Republic Airways (the two largest U.S. regionals) to allow up to 20% of their dispatchers to work from "alternate aircraft dispatch centers" (i.e., homes) for an initial 6 months. 
FLYING Magazine
FLYING Magazine
2021–2023 — Extensions. The cap was increased to 60% of any shift, with the last extension running through March 2023. 
FLYING Magazine
Nov 2022 — Congressional pushback. House T&I chair Peter DeFazio and Aviation subcommittee chair Rick Larsen wrote to acting Administrator Billy Nolen citing safety incidents, including (i) a Republic crew unable to reach a remote dispatcher for ~30 min while in a holding pattern preparing to divert to ALB, and (ii) an on-site dispatcher confined to her post for 12 hours (2 hours past her 121.465 duty limit) because a relief dispatcher couldn't access company systems from home due to ISP issues. The TWU labor union also raised concerns. 
Flight Global + 2
FAA position (Aug 2022 letter to TWU). "FAA regulations give airlines latitude as to where to base dispatchers." FAA confirmed it had investigated occurrences and determined Republic complied with applicable regulations. 
Flight Global
Flight Global
Current state (per industry forums, 2023+). Routine 121 work-from-home dispatch authorizations have largely lapsed; remote dispatch is now generally limited to emergency/contingency use or to specific 135 operations. Some carriers (NetJets, some 135 operators like Sierra West) allow remote work post-training. The pattern is: case-by-case FAA authorization, not blanket permission. 
Jetcareers
Jetcareers
Conditions for approving remote dispatch (industry-standard, drawn from the SkyWest/Republic letters and FAA AC 120-101). To be acceptable, an airline would need to demonstrate:

Equivalent connectivity/latency to dispatch systems and ARINC/SITA feeds.
Secured workstation (locked room, no observers, document-shred plan, no recording devices).
Inspectable home worksite (the FAA cited concern that home inspections were virtual). 
FLYING Magazine
Redundant communications (primary + backup ISP, voice failover).
SMS-based risk assessment showing equivalent level of safety.
Time-and-attendance compliance with §121.465 (10-hour duty limit + 8-hour rest). 
eCFR
Defined hand-off procedures and escalation if connectivity is lost.
Cybersecurity, redundancy, datalink for remote operations. This is where the AWS architect's expertise applies most directly. A defensible remote-dispatch architecture must include:

Hardware-rooted device identity (TPM-backed cert, MDM-enforced).
Mandatory MFA + dispatcher-certificate-bound identity; conditional access blocking unmanaged devices.
VPN/zero-trust gateway with FIPS 140-2/3 cryptography; the dispatch app exposed only behind that gateway.
ARINC / SITA messaging endpoints kept on the airline's private network, not exposed to the dispatcher's home directly.
SIEM/UEBA monitoring for anomalous dispatcher behavior (releases outside their qualified area, off-hours, unusual data exports).
Continuous-of-Operations (COOP) failover from primary OCC to a backup OCC (most majors have a redundant OCC — Delta's secondary, American's separate site) and pre-staged dispatch-from-home as Tier-3 contingency.
2.4 Identification Systems (How Dispatch Systems Authenticate and Authorize)
A real airline dispatch system tracks each dispatcher with:

The FAA Aircraft Dispatcher Certificate number (the legal identity).
The airline employee ID (HR identity, used for IAM/SSO).
A role-based authorization profile mapping the employee to one or more desks — narrow-body domestic, wide-body Atlantic, Pacific, Latin America, polar, ETOPS, dangerous-goods authorized, CAT III authorized, etc.
A binding to specific 121.463(c) currency records (last familiarization flight per airplane group) and 121.401 recurrent training records; the system should prevent release if currency is expired.
A binding to the OpsSpecs paragraphs and area authorizations the dispatcher is qualified for; any release is logged with the dispatcher's certificate number, the flight, the time, and the OFP version.
Major dispatch systems and how they fit:

Sabre Movement Manager / Sabre Flight Plan Manager / Sabre Dispatch Manager / DECS (Sabre's platform; OCC products acquired by CAE in recent years) — used by AA legacy, Frontier, JetBlue, regional carriers; Sabre-issued role-based access tied to airline IAM.
Jeppesen JetPlan / JetPlanner / OpsControl (Boeing Digital Aviation Solutions since the Jeppesen/Boeing rebrand) — widely used; major U.S. and international airlines; web-based with role-based access.
Lufthansa Systems Lido / Flight 4D — used by Lufthansa, KLM, Emirates, Cathay, UPS, easyJet, DHL; very automation-heavy; AIRAC database management.
NavBlue N-Flight Planning (Airbus subsidiary, formerly Navtech) — used by AirAsia, BA, others.
Honeywell GoDirect Flight Planning — business aviation focused.
ForeFlight Dispatch (acquired by Boeing) — business and smaller commercial.
Smart4Aviation, AVIATAR, FlightAware Firehose, RocketRoute, PPS Flight Planning — varying market segments.
AeroData — runway analysis and weight & balance, not full flight planning.
Boeing Onboard Performance Tool (OPT) — cockpit-side performance app, integrates with dispatch.
These systems federate identity with the airline's IAM (Active Directory/Okta/Azure AD), and the dispatcher's authority is enforced at desk assignment within the dispatch app. Audit trails capture every dispatcher action against the OFP — required by FAA SAS oversight (Safety Assurance System) and for accident/incident investigations.

3. Multi-Tenant SaaS Flight Planning — Best Practices
3.1 Existing Market Landscape
The flight-planning vendor market is consolidated and bifurcated.

Vendor / Product	Owner	Market segment	Notable customers	Pricing model
Jeppesen JetPlan / JetPlanner / OpsControl	Boeing Digital Aviation Solutions	Airlines (mid-major), business aviation	Many U.S. and international carriers historically (DL via FPS 2.0 over JetPlan engine; many regionals) 
Airliners.net
Per-flight + subscription; plate/data overlay
Lido/Flight & Lido/Flight 4D	Lufthansa Systems	Major airlines (highly automated, large-fleet)	LH, KLM, Emirates, Cathay, UPS, easyJet, DHL, Korean	Enterprise license; expensive, support-heavy
Sabre Movement Manager / Flight Plan Manager / Dispatch Manager	Sabre / CAE (post-acquisition of OCC products)	U.S. majors and regionals	AA legacy, regional Sabre-DM customers	Subscription / per-flight
NavBlue N-Flight Planning	Airbus	Various (AirAsia, BA)		Subscription
Honeywell GoDirect	Honeywell	Business aviation, fractional		Subscription
ForeFlight Dispatch	Boeing	Business / charter / smaller 121		SaaS subscription
RocketRoute / FlightAware Global / PPS Flight Planning	Various	Business aviation, Part 135		Per-user / per-flight
Smart4Aviation, AVIATAR	Smart4Aviation, Lufthansa Technik	Operational add-ons (briefing, MRO)		Subscription
Market dynamics: Airline-grade systems (Lido, JetPlan, Sabre) deeply integrate with the airline's reservation system, crew system, MRO system, ARINC/SITA messaging, AIRAC nav data, and OpsSpecs — switching cost is enormous. Business-aviation systems (ForeFlight, RocketRoute, FlightAware) target single tail or small fleets and prioritize a slick UX over deep multi-system integration. Pricing models: per-flight fee (typical for business aviation, e.g., $5–25/flight), per-aircraft tail (typical for fractional), or annual enterprise subscription (typical for major airlines, often six- to seven-figure).

3.2 Multi-Tenancy and Customization Architecture
For a multi-airline SaaS, every dimension below must be a per-tenant configuration object, not a global setting:

Per-airline configuration:

Fleet — every tail registered; each tail has aircraft type, engine variant, MEL/CDL deferred items, MTOW, performance database (Boeing PEP / Airbus PEP / OEM data), winglet configuration, age-correction factor, basic operating weight, RVSM/RNP authorizations. Performance is typically tied to type with per-tail "deltas" (a specific tail might have a heavier cabin and burn 0.5% more).
OpsSpecs / company manuals — alternate weather minima (C055), fuel policies, ETOPS approval status (B044), authorized airports list, takeoff minima, special PBN authorizations.
Fuel policy — base regulatory minimum + airline policy adders (e.g., +10 min "captain's fuel," +5% taxi factor, tankering matrix, specific en-route reserve for known choke points).
Alternate selection rules — operator-specific preferences (geographically closest vs. cost-weighted vs. station-of-flying choice).
Cost index — per type, per route, possibly per time-of-day; sometimes dynamically adjusted in IROPS.
Company routes — preferred airway sequences for known city pairs; "tunnel" routes that the network ops team has tuned for performance/charges.
Branding / white-label — airline's logo, color, OFP layout, briefing-package format.
Currency policies — per-dispatcher area-qualification matrix, recurrent training records integration with LMS.
Messaging endpoints — the airline's specific ARINC/SITA addresses, ACARS routing, AFTN address.
Data isolation per tenant. Patterns from SaaS practice apply, but aviation adds regulatory data-residency:

Database-per-tenant (silo) — strongest isolation, easiest to satisfy data-residency (EU airlines must keep data in EU), simplest legal answer, highest infra cost. Recommended for major-airline tenants.
Schema-per-tenant or shared schema with tenant-id (pool) — cheaper at scale, good for smaller tenants (e.g., regionals, business aviation), but data-residency requires regional sharding.
Hybrid — major tenants on dedicated stacks, smaller tenants on a shared multi-tenant stack with row-level security.
All approaches must enforce tenant context at every layer (API, service, database, cache, queue, search index, telemetry) — a cross-tenant data leak is a regulator-attention event. 
Redis
Region-scoped deployments (e.g., us-east-1, eu-central-1, ap-southeast-1) should be a first-class field on the tenant created at onboarding, not a hidden infra setting. 
WorkOS
White-label vs branded. Most airlines will want airline-branded OFPs (their logo on every dispatcher's release) but airline-specific subdomains may or may not be required. A practical pattern: shared domain (saas.example.com) with tenant-aware login, tenant-customized themes, optional per-tenant CNAME for white-label.

Integration points (the data plane). This is what makes flight planning hard, and it's where most of the engineering effort goes:

Integration	Standard / Format	Cadence	Notes
Navigation database	ARINC 424 (raw) packed into FMS-format binaries; sourced from Jeppesen NavData 
Jeppesen
 or Lido NavDB	AIRAC 28-day cycle (effective dates: every 28 days, e.g., 16 Apr, 14 May, 11 Jun 2026). Issue dates ~42 days prior to effective. Airlines must transition all systems on AIRAC effective date.	The AIRAC cycle is mandated by ICAO Annex 15. 
IFR Magazine
 Buy a NavData service from Jeppesen, Lido, or NavBlue rather than build.
Weather	NOAA NWS (METAR/TAF/winds aloft GFS), Météo-France (ARPEGE), ECMWF (commercial), DTN (commercial), Honeywell GoDirect Weather, Schneider	Continuous, with major model runs at 00/06/12/18Z	Need both raw GRIB2 model data (for wind-optimized routing) and decoded products (for briefing).
NOTAMs	FAA NOTAM, ICAO AFTN, EUROCONTROL EAD	Continuous	Increasing focus on filtering & relevance ranking — pilots and dispatchers complain about "NOTAM noise."
ATC flight-plan filing	ICAO Doc 4444 / FAA ICAO format via AFTN, FAA TFMS / ECR for U.S. domestic, EUROCONTROL NM (CFMU) IFPS for Europe	Per flight	The system must auto-generate the FPL message and handle ACK/REJ replies.
Aircraft datalink	ACARS over VHF 
Wikipedia
 (Plain text, ARINC 620/618/702A), HFDL, SATCOM (Inmarsat/Iridium), 
Airsatone
 AOC messages	Per flight	ARINC and SITA are the two global service providers. 
Pilot Institute
Ground-side messaging	SITA Type-B (teletype heritage), AFTN	Per flight / per event	Used for flight movement messages, slot messages (SCR/SAQ/SAL/SHL per IATA SSIM Ch. 6).
Crew system	Internal API or messaging	Per flight	Read crew assignment to validate currency/qualification at release.
Maintenance / MEL system	Internal API	Per flight	Read deferred items affecting performance/dispatchability.
GDS / NDC	Amadeus, Sabre, Travelport APIs (XML SOAP for legacy, REST/JSON for NDC)	As needed	Mostly Layer C; not core to the dispatch SaaS unless the tenant wants integrated trip planning.
Performance / latency requirements. A typical OFP computation involves wind-optimized routing over a 3-D grid, fuel iteration to convergence (the route depends on weight, weight depends on fuel, fuel depends on route — fixed-point iteration), MIP for tankering, and validation against weather and NOTAMs. Realistic targets:

Single-OFP recompute: < 30 s for a medium-haul, < 90 s for an ETOPS long-haul.
Mass-recompute on weather change for a 1,000-flight day: should complete in < 15 min.
The OCC needs sub-second response for status queries and < 5 s for "what-if" scenarios.
Per-tenant scaling is not uniform: a major airline tenant may dispatch 5,000 flights/day; a regional 1,500; a charter operator 50. Plan for elastic per-tenant queues and isolated compute pools so a recompute storm at one tenant doesn't degrade others.

3.3 Security and Compliance
DO-200B / EUROCAE ED-76A — Standards for Processing Aeronautical Data. Required if you process navigation/aeronautical data. Defines data quality criteria (accuracy, resolution, integrity, traceability, timeliness, completeness, format) and quality-management processes; a Letter of Acceptance (LOA) is issued by FAA per AC 20-153B. Aviation databases used for navigation must be DO-200B compliant. 
Endeavor Elements
FAA
DO-326A / ED-202A — Airworthiness Security Process Specification + companion DO-356A/ED-203A (Methods & Considerations) and DO-355/ED-204 (In-Service Continuing Airworthiness). Mandatory since 2019 as the AMC for FAA/EASA cybersecurity airworthiness. Strictly, DO-326A applies to airborne systems and connected ground systems; ground-only flight-planning SaaS is not directly certified to DO-326A but should align with its principles, especially for any data that flows to the aircraft (CPDLC, ACARS uplink of OFP). ED-205 covers ATM/ANS ground systems. 
LDRA + 2
SOC 2 Type II, ISO 27001, ISO 27017/27018 — table stakes for any enterprise SaaS; airlines' procurement will require them.
Aviation-specific audits — IOSA (IATA Operational Safety Audit) and IS-BAO (business aviation) may pull your SaaS into the airline's audit scope.
Cybersecurity defense in depth — separate the planning system from public internet (private link / VPN / mTLS API gateways for airline integrations); zero-trust within the platform; sandboxing of tenant code if any tenant scripting is offered; dedicated-tenant isolation for the few crown-jewel customers; comprehensive WAF + DDoS protection; AWS GuardDuty / Detective / Security Hub; regular pen tests; secrets management (KMS + per-tenant encryption keys via BYOK to allow airline-controlled key rotation).
Logging & audit — every dispatcher action must be logged with certificate number, timestamp, OFP version hash, and source IP; audit logs must be retained for the duration required by FAA SAS oversight (typically 6 years for FAA records, longer for accident-related data).
4. Designing AI Agents for Flight Planning
4.1 What the Planner Agent Must Reason Over
The criteria the agent must weigh are well known to dispatchers. They form a hierarchy:

Tier	Criterion	Nature
1 (Hard)	Safety & regulatory compliance	Hard constraint — fuel reserves, ETOPS rules, alternate weather minima, airspace restrictions, MEL constraints, crew duty. Not optimizable; cannot be violated.
2 (Hard)	Aircraft performance feasibility	Hard constraint — climb capability, MTOW, runway analysis.
3 (Optimization)	Cost	Fuel ($, the dominant variable cost), overflight/navigation fees (Eurocontrol, Russian, Canadian, U.S. Customs), maintenance time-related, crew time-related — all rolled into the cost-index calculation.
4 (Optimization)	Schedule reliability / OTP	Ensuring buffer for likely disruption (weather, ATC flow), which feeds back into cost via delay penalties.
5 (Optimization)	Passenger experience	Smoothness (turbulence-avoidance routing), arrival time.
6 (Optimization)	Environmental	CO₂ emissions; contrail avoidance (Google Research + American Airlines published 2024 results showing AI-suggested altitude changes reduced contrails by 54% in 70 flights, 
Google
 and a 2026 study with ~2,400 transatlantic flights 
Mondo News
 showed 62% contrail reduction on flights that adopted suggestions, 
Bode living
 at a fuel cost of ~2%). 
Google
 EU ETS / CORSIA compliance reporting.
7 (Recovery)	IROPS resilience	Handling diversions, schedule disruption recovery, station-resource constraints.
The agent must be able to prove to the dispatcher (and to a regulator) why a particular route, altitude, fuel quantity, and alternate were selected, with the input data and rule references shown.

4.2 Agent Architecture for a Multi-Airline SaaS
A defensible architecture is multi-agent orchestration around deterministic optimizers, with LLMs as reasoning/explanation/tool-use glue — not LLMs computing the route or fuel directly. The pattern that fits is:

                ┌─────────────────────────────┐
                │ Dispatcher (HITL, Tier-1)   │  ← certificate-bound user
                │ approves / overrides / signs│
                └──────────────▲──────────────┘
                               │ explanations,
                               │ recommendations
                ┌──────────────┴──────────────┐
                │   Orchestrator Agent (LLM)  │
                │  - planning, sequencing,    │
                │    invocation of sub-agents │
                │  - constraint enforcement   │
                │  - explanation synthesis    │
                └─┬─────────┬─────────┬───────┘
                  │         │         │
   ┌──────────────▼─┐ ┌─────▼─────┐ ┌─▼────────────────┐
   │ RouteAgent     │ │ FuelAgent │ │ WeatherAgent     │
   │ (Dijkstra/A*   │ │ (MIP for  │ │ (GRIB parsing,   │
   │ over wind grid;│ │ tankering;│ │ SIGMET ingest,   │
   │ NAT/PACOTS)    │ │ reserves) │ │ turbulence/ice)  │
   └────────────────┘ └───────────┘ └──────────────────┘
   ┌────────────────┐ ┌───────────┐ ┌──────────────────┐
   │ NOTAMAgent     │ │ Perf-     │ │ ComplianceAgent  │
   │ (filter,       │ │ Agent     │ │ (OpsSpecs, FAR   │
   │ relevance,     │ │ (runway   │ │ 121, ETOPS,      │
   │ conflict zone) │ │ analysis, │ │ alternate rules) │
   │                │ │ W&B)      │ │                  │
   └────────────────┘ └───────────┘ └──────────────────┘
   ┌────────────────────────────────────────────────────┐
   │ OCCAgent (IROPS): monitors active flights,         │
   │ proposes redispatch, alternate, diversion          │
   └────────────────────────────────────────────────────┘

Knowledge layer (4-tier):
  [Data warehouse]   raw weather, NOTAM, AIRAC nav data, flight history
  [Semantic layer]   normalized aviation entities (airports, airways, fixes)
  [Knowledge graph]  airline-specific rules, decisions, learned patterns
  [Agent layer]      tool-using agents above
  [UI surfaces]      dispatcher console, mobile, regulator audit view
Tools the agents call:

Weather APIs (NOAA NOMADS GRIB, DTN, MeteoGroup, Météo-France).
NOTAM feeds (FAA NOTAM API, EUROCONTROL EAD, ICAO API).
Performance calculators (OEM-supplied performance dlls or REST services; Boeing OPT, Airbus FlySmart cloud, AeroData).
Optimizer engines: A* / Dijkstra over a 3-D wind grid for route, MIP solver (Gurobi/CPLEX) for tankering and slot-aware scheduling.
Internal microservices: fleet status, MEL, crew currency, dispatcher qualification, OpsSpecs lookup.
Messaging: ACARS/CPDLC uplink, AFTN flight-plan filing, SITA Type-B.
Knowledge & memory (the four-layer architecture pattern):

Data warehouse — raw historical OFPs, weather snapshots, NOTAMs, ATC-actual routings.
Semantic layer — canonical aviation ontology (airports, FIRs, airways, fixes, aircraft types). dbt-style lineage.
Knowledge graph — airline-specific rules, dispatcher decisions, "we always reroute around FRA when EUROCONTROL flow restrictions exceed X" learned policies. Per-tenant isolated.
Agent layer — tool-using agents above operate over (1)-(3).
Human-in-the-loop. Under FAR 121.533 the certificated dispatcher must exercise operational control — joint with the PIC. Therefore: 
GovRegs

Agents propose; the dispatcher signs the release.
Every release captures: dispatcher cert#, employee ID, decision rationale, agent recommendations accepted/overridden, OFP hash.
Agent confidence and known-unknowns must be surfaced (e.g., "weather model agreement is low; recommend +15 min hold fuel").
Override is one click but logs why and surfaces to the airline's safety management system (SMS).
Explainability and auditability. Regulators (FAA SAS oversight, EASA) and insurers will not accept a black-box recommendation. Every agent action must produce:

A decision trace (inputs, tool calls, intermediate results).
A citation to the regulatory or OpsSpec rule it satisfies.
A counterfactual (what was rejected, and why).
An immutable audit record (write-once storage, e.g., AWS S3 Object Lock).
LLM safety / hallucination mitigation / criticality bar. This is non-negotiable in a safety-of-flight context:

LLMs do not output the OFP. They sequence tool calls and explain.
Anything the LLM produces (text in the briefing package) is validated against structured data; numbers come from the deterministic optimizer, not the LLM.
Use grounded/RAG over the airline's manual, OpsSpecs, and FARs — never let the LLM "remember" a regulation.
Maintain a regression test suite of historical flights and known-edge-cases (Dec storm, JFK weather diversion, oceanic divert, MEL with partial APU); CI must pass before any model upgrade.
Adversarial / red-team testing for prompt injection through NOTAM text, weather product comments, dispatch crew chat.
4.3 Best Practices for Agent Design in This Regulated Domain
Agent as decision-support, not decision-maker. The certificated dispatcher remains the legal decision authority. The SaaS license language must reflect this.
Deterministic optimizers wrapped by LLM reasoning. Use Dijkstra/A* on the wind grid for route, MIP for tankering and tail assignment, fixed-point iteration for fuel-weight convergence — not an LLM. The LLM picks among optimizer outputs, explains them, and handles natural-language interaction with the dispatcher.
Validation, sandboxing, certification. Treat the agent layer as you would a Software Level D/C system — formal change control, traceable requirements, regression suites tied to FAA-acceptable means of compliance. Sandboxes per tenant for any tenant-specific custom rules / scripts.
Incremental introduction (advisory tier first).
Tier 1 (advisory): agent surfaces optimizations the dispatcher reviews; full HITL.
Tier 2 (assisted): agent auto-prepares the OFP for routine cases; dispatcher reviews and signs.
Tier 3 (supervised auto-release): low-risk routine flights auto-released, dispatcher monitors a queue; out-of-norm cases escalate. Requires explicit FAA acceptance via OpsSpecs amendment.
Tier 3 is years away regulatorily; design Tier 1+2 first.
Per-tenant guardrails. What's acceptable to one airline (e.g., weather thresholds, contrail avoidance trade-offs) is not acceptable to another. Tenant policies must be enforced as ComplianceAgent rules, not LLM prompt instructions.
Regulatory-grade evals. Maintain a benchmark dataset and report (per release) the agent's accuracy vs. dispatcher decisions over a held-out set. This becomes evidence in the airline's SMS.
5. Practical Recommendations for the SaaS
5.1 MVP Scope (12–18 months)
Build for business aviation and Part 135 charter first, not Part 121 majors — the regulatory bar is lower (flight followers vs. certificated dispatchers, single PIC operational control, no joint dispatch), the integration depth is narrower, and the customers iterate faster. Then move up to regionals and scheduled 121. 
Wikipedia
Pilot Institute

MVP feature set:

Tenant onboarding with operator profile (OpsSpec-equivalent config), fleet (with MEL, performance), users (with role + cert# capture + currency).
Weather + NOTAM ingestion + a single AIRAC-cycle nav database (license from Jeppesen or NavBlue rather than build).
Wind-optimized routing + fuel computation + alternate selection (deterministic optimizers).
ICAO flight-plan generation and filing (via a SITA/ARINC service provider partnership; do not build AFTN connectivity yourself).
OFP generation as PDF and as data; briefing package for the crew.
Audit log and dispatcher e-signature workflow.
Agent Tier 1 (advisory only): explanation of route choice, reroute suggestions on weather change, NOTAM relevance ranking, contrail-avoidance suggestions.
Defer: ETOPS planning depth (until you have a customer requesting it), polar/oceanic full integration (NAT/PACOTS), tankering MIP, slot-aware scheduling, IROPS recovery agents.

5.2 Roadmap (Year 2–3)
Add ETOPS / EDTO planning, oceanic tracks, polar.
Add MIP-based tankering and slot management.
Add IROPS / OCCAgent — flight monitoring and re-dispatch.
Move to per-tenant data residency for EU/APAC customers.
Pursue FAA Letter of Acceptance under DO-200B for the navigation-data process.
Build an integration with a major GDS for tenants who want unified operational + commercial planning.
Begin pre-certification work for DO-326A-aligned ground systems if you offer ACARS/CPDLC uplink.
Apply for SOC 2 Type II + ISO 27001.
Pilot Tier 2 (assisted) AI agents with one customer under controlled trial; collect data for FAA conversation about Tier 3.
5.3 Regulatory Hurdles to Plan For
Hurdle	Mitigation
Per-tenant OpsSpecs vary; you can't ship one rule engine	Design a flexible declarative rule engine; publish a "rule catalog" that tenant ops engineers can configure.
FAA SAS oversight may scope your SaaS in for an airline tenant	Be prepared to be audited; SOC 2 + ISO 27001 + clear runbooks help. Provide regulator-ready audit views.
Data-residency (EU GDPR, India DPDPA, China data-localization)	Region-scope tenants from day one. 
WorkOS
AIRAC cycle coordination	Hard 28-day cadence; build deployment automation that flips databases at AIRAC effective time per the tenant's region.
Cyber regulation (DO-326A, NIS2 in EU, TSA pipeline-style cyber rules being extended to aviation)	Default to defense-in-depth; ECS/EKS with strong boundaries; private connectivity to airline integrations.
AI/ML regulatory uncertainty	EASA AI Roadmap 2.0 and FAA's emerging AI guidance; design for explainability and HITL from day one to avoid retrofit.
5.4 How Dispatcher Identity, Station Qualifications, and Remote Operation Translate into SaaS Auth/RBAC/Audit
This is the user's specific design question. Concrete recommendations:

Identity model:

Person — natural identity (email, OIDC subject), MFA-bound, hardware-token bound for production write access.
Certificate — FAA Aircraft Dispatcher Certificate number (or ICAO FOO license number, or "operator-trained FOO" for EASA states), issuing authority, issue date. First-class entity, not a profile attribute.
Tenant assignment — a person can have certificates valid for one or more tenants (some dispatchers contract to multiple operators); per-tenant employee ID.
Currency record — last §121.463(c) familiarization per airplane group, last §121.401 recurrent training, medical (some jurisdictions), language proficiency.
RBAC model (recommended: ABAC layered on RBAC):

Role — Dispatcher, Senior Dispatcher / Duty Manager, Flight Follower (135), Read-Only OCC, Maintenance Control liaison, etc.
Attributes that gate authority — area-of-operation qualifications (e.g., domestic-CONUS, NAT, NOPAC, polar, ETOPS-180, RNP-AR), aircraft-group qualifications (B737NG, A320, B787, A350), special authorizations (CAT-III, dangerous-goods-release), shift assignment to a desk (SE-NB, Atlantic-WB, etc.).
Policy enforcement at release — the system must refuse a dispatch release if (a) the dispatcher's certificate isn't current, (b) the area of operation isn't in the dispatcher's qualifications, (c) the aircraft group isn't in their qualifications, or (d) any required currency has lapsed. Override requires a supervisor with delegation authority and is fully audited.
Remote-work specifics (the user's question):

The system should not care whether the dispatcher is at the OCC or at home — it cares whether they are authorized. But it should:
Capture and log the source IP, geo, device fingerprint of every action.
Enforce conditional-access policies per tenant: e.g., Tenant A allows release from corporate network only; Tenant B allows release from approved home networks; Tenant C requires VPN with MDM-enforced device.
Enforce time-of-duty caps (§121.465) by tracking duty start, duty end, and the consecutive 10-hour rule; warn the supervisor at 9 hours.
Provide a "remote-mode" flag with stricter audit (e.g., session video for high-risk actions, pre-flight system check before assuming a desk).
Provide redundant connectivity hooks: when a dispatcher loses connectivity, the system auto-pages a backup dispatcher and the OCC supervisor.
This translates the regulatory requirement that the dispatcher "be qualified for the area, not present in it" into enforced policy code: area + currency + identity + secured channel = release authority.
Audit model:

Immutable, append-only event log (e.g., AWS QLDB or S3 Object Lock).
Every release event captures: tenant ID, dispatcher cert#, employee ID, OFP version hash, fuel breakdown, route hash, weather snapshot ID, NOTAM snapshot ID, AIRAC cycle, dispatcher's accepted-vs-overridden agent recommendations, source IP, MFA factor used.
Retention: per FAA 6 years minimum for U.S. tenants; longer for accident-related records (no destruction during pending investigations).
Regulator view: pre-built export package for SAS oversight inspections.
5.5 Key Criteria for the AI Flight-Planner Agent (Summary Checklist)
When the architect designs the agent layer, the following criteria are the ones to anchor the requirements on:

Hard constraints inviolable. Fuel reserves, ETOPS rules, alternate selection, airspace, MEL, dispatcher-currency: hard constraints expressed as deterministic checks; agent cannot "talk past" them.
Per-tenant configurability. Every constraint and preference is a tenant config object — fuel policy, alternate rules, cost index, contrail-trade-off, branding.
Deterministic core, LLM glue. Optimizers compute; LLMs sequence, explain, dialogue. No safety-relevant numeric output is ever LLM-generated.
Explainability and audit by default. Every recommendation has provenance (tool calls, source data, rule references) and is captured immutably.
HITL release. The certificated dispatcher always signs the release; the system enforces certificate and area qualifications.
Regulator-readiness. The system is designed to be auditable by FAA SAS / EASA inspectors; SOC 2 Type II, ISO 27001, DO-200B alignment, and DO-326A-style airworthiness security where applicable.
Per-tenant data residency and isolation. Region-pinned tenants, encryption with tenant-managed keys for top-tier customers, no cross-tenant data sharing without explicit airline consent.
Resilient remote operation. The platform supports OCC, backup OCC, and (where authorized) remote dispatch with strong device identity, conditional access, redundant connectivity, and full session logging.
AIRAC-aware deployment. All nav-database changes flip on the AIRAC effective date; deployment automation orchestrates this per tenant region.
Incremental autonomy. Ship as Tier-1 advisory; collect operational data and dispatcher feedback; advance toward Tier-2 assisted only when regulator and customer evidence supports it.
A flight planner is, in the end, a system that produces a legally-signable document under joint dispatcher/PIC responsibility, against thousands of regulatory and operational constraints, in minutes, for thousands of flights a day. The AI doesn't replace the dispatcher; it makes the dispatcher fast enough to keep up with what the airline wants to do. That is the right framing for a multi-tenant SaaS with AI agents in this domain.

Caveats
Regulations evolve. Cited section numbers (e.g., 14 CFR 121.463, 121.533, 121.639, Part 65 Subpart C) and ICAO Annex paragraphs were current as of 2025-2026 references; verify against the current eCFR and ICAO publications at design time. WASG Edition 4 became effective Aug 2025; AIRAC cycles are continuous.
EASA NPA 2023-01 is a Notice of Proposed Amendment — its provisions had not been finalized into binding EU regulation at the time of available sources; treat as forthcoming, not current law.
Remote dispatch authorizations. The SkyWest/Republic remote-dispatch authorizations were COVID-era exemptions repeatedly extended through March 2023; current status is that routine work-from-home for Part 121 dispatch is largely curtailed but not categorically prohibited, with case-by-case FAA authorizations. Industry chatter (Jetcareers forum and Flight Global reporting) suggests SkyWest may be exploring remote dispatch for its 135 charter operations separately. Anyone designing a SaaS feature claiming "supports remote dispatch" should verify the current FAA position with their operator customer's POI.
Dispatcher headcount figures for individual airlines (e.g., Delta ~180, American ~550) come from union-disclosed numbers and may have changed.
Vendor market positions shift — Sabre's OCC products were acquired by CAE and the long-term product roadmap was unclear in the most recent industry forum chatter; Boeing has been consolidating Jeppesen and ForeFlight under Boeing Digital Aviation Solutions.
AI contrail-avoidance results (Google + American Airlines) are early operational pilots; the 54%/62% reductions are reported by Google and have been peer-reviewed through arXiv preprints but the full operational, safety, and fuel-burn trade-off is still being characterized. Real-world deployment will need to address ice-supersaturated-region (ISSR) forecast accuracy, contingency fuel for altitude changes, and integration with dispatcher workflow.
DO-326A applicability to ground SaaS is an interpretive area. The standard formally targets airborne systems and connected ground systems; a pure flight-planning SaaS that only outputs documents and files plans is generally outside its hard scope, but any uplink to the aircraft (CPDLC clearances, ACARS uplink of an OFP) brings it back in. Consult an airworthiness specialist when scoping.
The Boeing/passenger-laptop hacking story referenced in the DO-326A primer text was widely reported but its technical accuracy has been questioned by subject-matter experts; it is cited by industry commentators as a motivating event rather than a definitively documented exploit.
This report is a technical orientation for an architect, not legal or regulatory advice; engagement with each tenant airline's POI/CAA inspector and an aviation cybersecurity specialist is necessary before deployment.
