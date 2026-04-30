import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { query, queryOne } from '../shared/db';
import { ok, badRequest, notFound, serverError, parseBody } from '../shared/response';
import { resolveTenantId } from '../shared/tenant';

interface FlightSearchParams {
  origin: string;
  destination: string;
  date: string;          // YYYY-MM-DD
  return_date?: string;
  adults?: number;
  children?: number;
  infants?: number;
  cabin_class?: 'economy' | 'business' | 'first';
}

// Duration in minutes computed from timestamps (schema has no duration_minutes column)
const FLIGHT_SELECT = `
  f.id, f.flight_number, f.departure_time, f.arrival_time, f.status, f.gate, f.terminal,
  f.price_economy, f.price_business, f.price_first,
  f.baggage_carry, f.baggage_checked, f.aircraft,
  ROUND(EXTRACT(EPOCH FROM (f.arrival_time - f.departure_time))/60) AS duration_minutes,
  al.name  AS airline_name,
  al.code  AS airline_code,
  al.logo  AS airline_logo,
  dep.code AS origin_code,
  dep.name AS origin_name,
  dep.city AS origin_city,
  arr.code AS destination_code,
  arr.name AS destination_name,
  arr.city AS destination_city,
  COUNT(s.id) FILTER (WHERE s.is_occupied = false AND s.class = 'economy')  AS avail_economy,
  COUNT(s.id) FILTER (WHERE s.is_occupied = false AND s.class = 'business') AS avail_business,
  COUNT(s.id) FILTER (WHERE s.is_occupied = false AND s.class = 'first')    AS avail_first
`;

const FLIGHT_JOINS = `
  JOIN airlines al  ON al.code  = f.airline_code
  JOIN airports dep ON dep.code = f.origin_code
  JOIN airports arr ON arr.code = f.destination_code
  LEFT JOIN seats s ON s.flight_id = f.id
`;

const FLIGHT_GROUP = `GROUP BY f.id, al.code, dep.code, arr.code`;

// ── POST /flights/search ──────────────────────────────────────────────────────
async function searchFlights(
  body: string | null,
  tenantId: string,
): Promise<APIGatewayProxyResult> {
  const data = parseBody<FlightSearchParams>(body);
  if (!data?.origin || !data?.destination || !data?.date) {
    return badRequest('origin, destination, and date are required');
  }

  const cabinClass = data.cabin_class ?? 'economy';
  const passengers = (data.adults ?? 1) + (data.children ?? 0);
  const origin = typeof data.origin === 'object' ? (data.origin as any).code : data.origin;
  const destination = typeof data.destination === 'object' ? (data.destination as any).code : data.destination;

  const outbound = await query(
    `SELECT ${FLIGHT_SELECT}
     FROM flights f ${FLIGHT_JOINS}
     WHERE f.tenant_id = $1
       AND dep.code = $2
       AND arr.code = $3
       AND DATE(f.departure_time AT TIME ZONE 'UTC') = $4::date
       AND f.status NOT IN ('cancelled')
     ${FLIGHT_GROUP}
     HAVING COUNT(s.id) FILTER (WHERE s.is_occupied = false AND s.class = $5) >= $6
     ORDER BY f.departure_time`,
    [tenantId, origin.toUpperCase(), destination.toUpperCase(), data.date, cabinClass, passengers],
  );

  const result: Record<string, unknown> = { outbound };

  if (data.return_date) {
    const inbound = await query(
      `SELECT ${FLIGHT_SELECT}
       FROM flights f ${FLIGHT_JOINS}
       WHERE f.tenant_id = $1
         AND dep.code = $3
         AND arr.code = $2
         AND DATE(f.departure_time AT TIME ZONE 'UTC') = $4::date
         AND f.status NOT IN ('cancelled')
       ${FLIGHT_GROUP}
       HAVING COUNT(s.id) FILTER (WHERE s.is_occupied = false AND s.class = $5) >= $6
       ORDER BY f.departure_time`,
      [tenantId, origin.toUpperCase(), destination.toUpperCase(), data.return_date, cabinClass, passengers],
    );
    result.inbound = inbound;
  }

  return ok(result);
}

// ── GET /flights/{id} ─────────────────────────────────────────────────────────
async function getFlight(id: string, tenantId: string): Promise<APIGatewayProxyResult> {
  const flight = await queryOne(
    `SELECT ${FLIGHT_SELECT}
     FROM flights f ${FLIGHT_JOINS}
     WHERE f.id = $1 AND f.tenant_id = $2
     ${FLIGHT_GROUP}`,
    [id, tenantId],
  );
  if (!flight) return notFound('Flight');
  return ok(flight);
}

// ── GET /flights/{id}/seats ───────────────────────────────────────────────────
async function getSeatMap(
  flightId: string,
  tenantId: string,
  cabinClass?: string,
): Promise<APIGatewayProxyResult> {
  // Verify the flight belongs to this tenant before exposing seat data
  const flight = await queryOne(
    'SELECT id FROM flights WHERE id = $1 AND tenant_id = $2',
    [flightId, tenantId],
  );
  if (!flight) return notFound('Flight');

  const params: unknown[] = [flightId];
  let cabinFilter = '';
  if (cabinClass) {
    params.push(cabinClass);
    cabinFilter = `AND s.class = $${params.length}`;
  }

  const seats = await query(
    `SELECT
       s.id,
       s.row_number AS row,
       s.letter,
       s.type,
       s.class,
       s.is_occupied AS "isOccupied",
       s.extra_fee   AS price,
       s.features
     FROM seats s
     WHERE s.flight_id = $1 ${cabinFilter}
     ORDER BY s.class, s.row_number, s.letter`,
    params,
  );

  const grouped = seats.reduce<Record<string, unknown[]>>((acc, seat) => {
    const cabin = (seat as any).class as string;
    if (!acc[cabin]) acc[cabin] = [];
    acc[cabin].push(seat);
    return acc;
  }, {});

  return ok(grouped);
}

// ── GET /flights/own-today ────────────────────────────────────────────────────
//
// Returns the airline's own operating flights for today (the tenant's
// schedule), shaped as canonical OwnFlight[] so the planner consumes them
// without any client-side mapping. NOT a passenger-search endpoint —
// returns every own flight regardless of seat availability.
async function listOwnFlightsToday(tenantId: string): Promise<APIGatewayProxyResult> {
  const rows = await query<{
    id: string;
    flight_number: string;
    airline_code: string;
    departure_time: string;
    arrival_time: string;
    origin_code: string;
    destination_code: string;
    aircraft: string | null;
    pax_load: number | null;
  }>(
    `SELECT
       f.id, f.flight_number, f.airline_code,
       f.departure_time, f.arrival_time,
       dep.code AS origin_code, arr.code AS destination_code,
       f.aircraft,
       (SELECT COUNT(*)::int FROM seats s
        WHERE s.flight_id = f.id AND s.is_occupied = true) AS pax_load
     FROM flights f
     JOIN airports dep ON dep.code = f.origin_code
     JOIN airports arr ON arr.code = f.destination_code
     WHERE f.tenant_id = $1
       AND f.status NOT IN ('cancelled')
       /* Today's full schedule (in UTC) + the next 24h. A dispatcher
        * reviewing the day's bank should see every flight, including
        * ones that already departed earlier in the shift. */
       AND f.departure_time >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
       AND f.departure_time <  DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '48 hours'
     ORDER BY f.departure_time`,
    [tenantId],
  );

  // Map marketing names ('Boeing 777-300ER') to ICAO type codes ('B77W').
  // OpsSpecs B044 authorizedTypes is keyed by ICAO codes, so the planner
  // needs both representations to do an exact match without dragging the
  // matching code through every consumer.
  // Marketing name → ICAO type code. Order: most-specific variant first,
  // then the bare family (the seeded flights stash 'Boeing 777' without a
  // variant suffix, so we default to the most common widebody variant).
  const deriveIcao = (m: string | undefined): string | undefined => {
    const t = (m ?? '').toUpperCase();
    if (!t) return undefined;
    // 777
    if (t.includes('777-300ER') || t.includes('77W'))     return 'B77W';
    if (t.includes('777-200LR'))                          return 'B77L';
    if (t.includes('777-200ER') || t.includes('777-200')) return 'B772';
    if (t.includes('777X') || t.includes('777-9'))        return 'B779';
    if (t.includes('777-300'))                            return 'B77W';
    if (t.includes('777'))                                return 'B77W'; // family default
    // 787
    if (t.includes('787-10'))                             return 'B78X';
    if (t.includes('787-9'))                              return 'B789';
    if (t.includes('787-8'))                              return 'B788';
    if (t.includes('787'))                                return 'B789';
    // 747
    if (t.includes('747-8'))                              return 'B748';
    if (t.includes('747-400') || t.includes('747'))       return 'B744';
    // A330
    if (t.includes('A330-900') || t.includes('A330NEO'))  return 'A339';
    if (t.includes('A330-300'))                           return 'A333';
    if (t.includes('A330-200'))                           return 'A332';
    if (t.includes('A330'))                               return 'A333';
    // A350
    if (t.includes('A350-1000'))                          return 'A35K';
    if (t.includes('A350-900') || t.includes('A350'))     return 'A359';
    // A380
    if (t.includes('A380'))                               return 'A388';
    // A340 / A320 family
    if (t.includes('A340'))                               return 'A343';
    if (t.includes('A321'))                               return 'A321';
    if (t.includes('A320'))                               return 'A320';
    if (t.includes('A319'))                               return 'A319';
    // 737 family
    if (t.includes('737-900'))                            return 'B739';
    if (t.includes('737 MAX 8') || t.includes('737-8'))   return 'B38M';
    if (t.includes('737-800') || t.includes('737NG'))     return 'B738';
    if (t.includes('737'))                                return 'B738';
    // Misc / regional
    if (t.includes('MD-11'))                              return 'MD11';
    if (t.includes('E190'))                               return 'E190';
    if (t.includes('CRJ-900') || t.includes('CRJ900'))    return 'CRJ9';
    return undefined;
  };

  // Strip the carrier prefix from flight_number if present (DB stores 'BA1000',
  // canonical wants 'BA' + '1000' separately).
  const flights = rows.map((r) => {
    const raw = r.flight_number ?? '';
    const carrier = r.airline_code;
    const flightNumber = raw.startsWith(carrier) ? raw.slice(carrier.length) : raw;
    const aircraftType = r.aircraft ?? undefined;
    const aircraftIcao = deriveIcao(aircraftType);
    return {
      source: 'own' as const,
      externalId: r.id,
      carrier,
      flightNumber,
      origin: r.origin_code,
      destination: r.destination_code,
      scheduledDeparture: r.departure_time,
      scheduledArrival:   r.arrival_time,
      aircraftType,
      aircraftIcao,
      paxLoad: r.pax_load ?? 0,
    };
  });

  return ok({ flights });
}

// ── Router ────────────────────────────────────────────────────────────────────
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method    = event.httpMethod;
    const path      = event.path;
    const flightId  = event.pathParameters?.id;
    const cabinClass = event.queryStringParameters?.cabin_class;

    // Public routes read tenant from header; auth'd routes from authorizer context
    const tenantSlug: string =
      (event.requestContext as any)?.authorizer?.tenantSlug ??
      event.headers?.['X-Tenant-ID'] ??
      event.headers?.['x-tenant-id'] ??
      'aeromock';

    const tenantId = await resolveTenantId(tenantSlug);
    if (!tenantId) return badRequest(`Unknown tenant: ${tenantSlug}`);

    if (method === 'POST' && path === '/flights/search') return searchFlights(event.body, tenantId);
    if (method === 'GET'  && path === '/flights/own-today') return listOwnFlightsToday(tenantId);
    if (method === 'GET' && flightId && path.endsWith('/seats')) return getSeatMap(flightId, tenantId, cabinClass ?? undefined);
    if (method === 'GET' && flightId) return getFlight(flightId, tenantId);

    return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
  } catch (err) {
    return serverError(err);
  }
};
