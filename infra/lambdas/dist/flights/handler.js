"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
// ── POST /flights/search ──────────────────────────────────────────────────────
async function searchFlights(body) {
    const data = (0, response_1.parseBody)(body);
    if (!data?.origin || !data?.destination || !data?.date) {
        return (0, response_1.badRequest)('origin, destination, and date are required');
    }
    const cabinClass = data.cabin_class ?? 'economy';
    const passengers = (data.adults ?? 1) + (data.children ?? 0);
    // Find outbound flights with available seats
    const outbound = await (0, db_1.query)(`SELECT
       f.id, f.flight_number, f.departure_time, f.arrival_time,
       f.duration_minutes, f.status,
       al.name  AS airline_name,
       al.iata_code AS airline_code,
       al.logo_url  AS airline_logo,
       dep.iata_code AS origin_code,
       dep.name      AS origin_name,
       dep.city      AS origin_city,
       arr.iata_code AS destination_code,
       arr.name      AS destination_name,
       arr.city      AS destination_city,
       COUNT(s.id) FILTER (WHERE s.status = 'available' AND s.cabin_class = $4) AS available_seats,
       MIN(s.price)  FILTER (WHERE s.status = 'available' AND s.cabin_class = $4) AS price
     FROM flights f
     JOIN airlines  al  ON al.id  = f.airline_id
     JOIN airports  dep ON dep.id = f.origin_id
     JOIN airports  arr ON arr.id = f.destination_id
     JOIN seats     s   ON s.flight_id = f.id
     WHERE dep.iata_code = $1
       AND arr.iata_code = $2
       AND DATE(f.departure_time AT TIME ZONE 'UTC') = $3::date
       AND f.status NOT IN ('cancelled', 'diverted')
     GROUP BY f.id, al.id, dep.id, arr.id
     HAVING COUNT(s.id) FILTER (WHERE s.status = 'available' AND s.cabin_class = $4) >= $5
     ORDER BY f.departure_time`, [data.origin.toUpperCase(), data.destination.toUpperCase(), data.date, cabinClass, passengers]);
    const result = { outbound };
    // Round-trip: also search return flights
    if (data.return_date) {
        const inbound = await (0, db_1.query)(`SELECT
         f.id, f.flight_number, f.departure_time, f.arrival_time,
         f.duration_minutes, f.status,
         al.name  AS airline_name,
         al.iata_code AS airline_code,
         al.logo_url  AS airline_logo,
         dep.iata_code AS origin_code,
         dep.name      AS origin_name,
         dep.city      AS origin_city,
         arr.iata_code AS destination_code,
         arr.name      AS destination_name,
         arr.city      AS destination_city,
         COUNT(s.id) FILTER (WHERE s.status = 'available' AND s.cabin_class = $4) AS available_seats,
         MIN(s.price)  FILTER (WHERE s.status = 'available' AND s.cabin_class = $4) AS price
       FROM flights f
       JOIN airlines  al  ON al.id  = f.airline_id
       JOIN airports  dep ON dep.id = f.origin_id
       JOIN airports  arr ON arr.id = f.destination_id
       JOIN seats     s   ON s.flight_id = f.id
       WHERE dep.iata_code = $2
         AND arr.iata_code = $1
         AND DATE(f.departure_time AT TIME ZONE 'UTC') = $3::date
         AND f.status NOT IN ('cancelled', 'diverted')
       GROUP BY f.id, al.id, dep.id, arr.id
       HAVING COUNT(s.id) FILTER (WHERE s.status = 'available' AND s.cabin_class = $4) >= $5
       ORDER BY f.departure_time`, [data.origin.toUpperCase(), data.destination.toUpperCase(), data.return_date, cabinClass, passengers]);
        result.inbound = inbound;
    }
    return (0, response_1.ok)(result);
}
// ── GET /flights/{id} ─────────────────────────────────────────────────────────
async function getFlight(id) {
    const flight = await (0, db_1.queryOne)(`SELECT
       f.id, f.flight_number, f.departure_time, f.arrival_time,
       f.duration_minutes, f.status, f.gate, f.terminal,
       al.name AS airline_name, al.iata_code AS airline_code, al.logo_url AS airline_logo,
       dep.iata_code AS origin_code, dep.name AS origin_name, dep.city AS origin_city,
       arr.iata_code AS destination_code, arr.name AS destination_name, arr.city AS destination_city
     FROM flights f
     JOIN airlines al  ON al.id  = f.airline_id
     JOIN airports dep ON dep.id = f.origin_id
     JOIN airports arr ON arr.id = f.destination_id
     WHERE f.id = $1`, [id]);
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
        cabinFilter = `AND cabin_class = $${params.length}`;
    }
    const seats = await (0, db_1.query)(`SELECT id, seat_number, cabin_class, seat_type, status, price, amenities
     FROM seats
     WHERE flight_id = $1 ${cabinFilter}
     ORDER BY cabin_class, seat_number`, params);
    // Group by cabin class for easier rendering
    const grouped = seats.reduce((acc, seat) => {
        const cabin = seat.cabin_class;
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
