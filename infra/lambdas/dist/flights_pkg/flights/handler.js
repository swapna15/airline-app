"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
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
async function searchFlights(body) {
    const data = (0, response_1.parseBody)(body);
    if (!data?.origin || !data?.destination || !data?.date) {
        return (0, response_1.badRequest)('origin, destination, and date are required');
    }
    const cabinClass = data.cabin_class ?? 'economy';
    const passengers = (data.adults ?? 1) + (data.children ?? 0);
    const outbound = await (0, db_1.query)(`SELECT ${FLIGHT_SELECT}
     FROM flights f ${FLIGHT_JOINS}
     WHERE dep.code = $1
       AND arr.code = $2
       AND DATE(f.departure_time AT TIME ZONE 'UTC') = $3::date
       AND f.status NOT IN ('cancelled')
     ${FLIGHT_GROUP}
     HAVING COUNT(s.id) FILTER (WHERE s.is_occupied = false AND s.class = $4) >= $5
     ORDER BY f.departure_time`, [data.origin.toUpperCase(), data.destination.toUpperCase(), data.date, cabinClass, passengers]);
    const result = { outbound };
    if (data.return_date) {
        const inbound = await (0, db_1.query)(`SELECT ${FLIGHT_SELECT}
       FROM flights f ${FLIGHT_JOINS}
       WHERE dep.code = $2
         AND arr.code = $1
         AND DATE(f.departure_time AT TIME ZONE 'UTC') = $3::date
         AND f.status NOT IN ('cancelled')
       ${FLIGHT_GROUP}
       HAVING COUNT(s.id) FILTER (WHERE s.is_occupied = false AND s.class = $4) >= $5
       ORDER BY f.departure_time`, [data.origin.toUpperCase(), data.destination.toUpperCase(), data.return_date, cabinClass, passengers]);
        result.inbound = inbound;
    }
    return (0, response_1.ok)(result);
}
// ── GET /flights/{id} ─────────────────────────────────────────────────────────
async function getFlight(id) {
    const flight = await (0, db_1.queryOne)(`SELECT ${FLIGHT_SELECT}
     FROM flights f ${FLIGHT_JOINS}
     WHERE f.id = $1
     ${FLIGHT_GROUP}`, [id]);
    if (!flight)
        return (0, response_1.notFound)('Flight');
    return (0, response_1.ok)(flight);
}
// ── GET /flights/{id}/seats ───────────────────────────────────────────────────
async function getSeatMap(flightId, cabinClass) {
    const params = [flightId];
    let cabinFilter = '';
    if (cabinClass) {
        params.push(cabinClass);
        cabinFilter = `AND s.class = $${params.length}`;
    }
    const seats = await (0, db_1.query)(`SELECT
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
     ORDER BY s.class, s.row_number, s.letter`, params);
    const grouped = seats.reduce((acc, seat) => {
        const cabin = seat.class;
        if (!acc[cabin])
            acc[cabin] = [];
        acc[cabin].push(seat);
        return acc;
    }, {});
    return (0, response_1.ok)(grouped);
}
// ── Router ────────────────────────────────────────────────────────────────────
const handler = async (event) => {
    try {
        const method = event.httpMethod;
        const path = event.path;
        const flightId = event.pathParameters?.id;
        const cabinClass = event.queryStringParameters?.cabin_class;
        if (method === 'POST' && path === '/flights/search')
            return searchFlights(event.body);
        if (method === 'GET' && flightId && path.endsWith('/seats'))
            return getSeatMap(flightId, cabinClass ?? undefined);
        if (method === 'GET' && flightId)
            return getFlight(flightId);
        return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
    }
    catch (err) {
        return (0, response_1.serverError)(err);
    }
};
exports.handler = handler;
