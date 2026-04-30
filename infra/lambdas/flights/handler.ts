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
       AND f.departure_time >= NOW() - INTERVAL '4 hours'
       AND f.departure_time <  NOW() + INTERVAL '36 hours'
     ORDER BY f.departure_time`,
    [tenantId],
  );

  // Strip the carrier prefix from flight_number if present (DB stores 'BA1000',
  // canonical wants 'BA' + '1000' separately).
  const flights = rows.map((r) => {
    const raw = r.flight_number ?? '';
    const carrier = r.airline_code;
    const flightNumber = raw.startsWith(carrier) ? raw.slice(carrier.length) : raw;
    return {
      source: 'own' as const,
      externalId: r.id,
      carrier,
      flightNumber,
      origin: r.origin_code,
      destination: r.destination_code,
      scheduledDeparture: r.departure_time,
      scheduledArrival:   r.arrival_time,
      aircraftType: r.aircraft ?? undefined,
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
