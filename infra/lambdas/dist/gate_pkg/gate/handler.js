"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
const GATE_ROLES = ['gate_manager', 'coordinator', 'admin'];
const VALID_STATUSES = [
    'scheduled', 'boarding', 'departed', 'arrived', 'delayed', 'cancelled', 'diverted',
];
// Status transitions that are allowed
const ALLOWED_TRANSITIONS = {
    scheduled: ['boarding', 'delayed', 'cancelled'],
    boarding: ['departed', 'delayed', 'cancelled'],
    delayed: ['boarding', 'cancelled'],
    departed: ['arrived', 'diverted'],
    arrived: [],
    cancelled: [],
    diverted: [],
};
// ── GET /gate/flights?date=YYYY-MM-DD&airport=XXX ────────────────────────────
async function getGateFlights(date, airport) {
    const today = date ?? new Date().toISOString().split('T')[0];
    const params = [today];
    let airportFilter = '';
    if (airport) {
        params.push(airport.toUpperCase());
        airportFilter = `AND (dep.iata_code = $2 OR arr.iata_code = $2)`;
    }
    const flights = await (0, db_1.query)(`SELECT
       f.id, f.flight_number, f.departure_time, f.arrival_time,
       f.status, f.gate, f.terminal, f.duration_minutes,
       al.name AS airline_name, al.iata_code AS airline_code,
       dep.iata_code AS origin_code, dep.city AS origin_city,
       arr.iata_code AS destination_code, arr.city AS destination_city,
       COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS booked_count,
       COUNT(ci.id) FILTER (WHERE ci.status = 'checked_in') AS checked_in_count
     FROM flights f
     JOIN airlines al ON al.id = f.airline_id
     JOIN airports dep ON dep.id = f.origin_id
     JOIN airports arr ON arr.id = f.destination_id
     LEFT JOIN bookings b ON b.flight_id = f.id
     LEFT JOIN booking_passengers bp ON bp.booking_id = b.id
     LEFT JOIN checkins ci ON ci.booking_passenger_id = bp.id
     WHERE DATE(f.departure_time AT TIME ZONE 'UTC') = $1::date
     ${airportFilter}
     GROUP BY f.id, al.id, dep.id, arr.id
     ORDER BY f.departure_time`, params);
    return (0, response_1.ok)(flights);
}
// ── GET /gate/flights/{id} ────────────────────────────────────────────────────
async function getFlightDetail(flightId) {
    const flight = await (0, db_1.queryOne)(`SELECT
       f.id, f.flight_number, f.departure_time, f.arrival_time,
       f.status, f.gate, f.terminal, f.duration_minutes,
       al.name AS airline_name, al.iata_code AS airline_code,
       dep.iata_code AS origin_code, dep.city AS origin_city,
       arr.iata_code AS destination_code, arr.city AS destination_city
     FROM flights f
     JOIN airlines al ON al.id = f.airline_id
     JOIN airports dep ON dep.id = f.origin_id
     JOIN airports arr ON arr.id = f.destination_id
     WHERE f.id = $1`, [flightId]);
    if (!flight)
        return (0, response_1.notFound)('Flight');
    // Boarding stats
    const stats = await (0, db_1.queryOne)(`SELECT
       COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS booked,
       COUNT(ci.id) FILTER (WHERE ci.status = 'checked_in') AS checked_in,
       COUNT(ci.id) FILTER (WHERE ci.status = 'boarded') AS boarded
     FROM bookings b
     LEFT JOIN booking_passengers bp ON bp.booking_id = b.id
     LEFT JOIN checkins ci ON ci.booking_passenger_id = bp.id
     WHERE b.flight_id = $1`, [flightId]);
    return (0, response_1.ok)({
        ...flight,
        stats: {
            booked: parseInt(stats?.booked ?? '0'),
            checked_in: parseInt(stats?.checked_in ?? '0'),
            boarded: parseInt(stats?.boarded ?? '0'),
        },
    });
}
async function updateFlightStatus(flightId, body) {
    const data = (0, response_1.parseBody)(body);
    if (!data?.status)
        return (0, response_1.badRequest)('status is required');
    if (!VALID_STATUSES.includes(data.status)) {
        return (0, response_1.badRequest)(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    const flight = await (0, db_1.queryOne)('SELECT id, status, departure_time FROM flights WHERE id = $1', [flightId]);
    if (!flight)
        return (0, response_1.notFound)('Flight');
    const currentStatus = flight.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed.includes(data.status)) {
        return (0, response_1.badRequest)(`Cannot transition from '${currentStatus}' to '${data.status}'`);
    }
    // Build update fields
    const updates = ['status = $2', 'updated_at = now()'];
    const params = [flightId, data.status];
    if (data.gate) {
        params.push(data.gate);
        updates.push(`gate = $${params.length}`);
    }
    if (data.terminal) {
        params.push(data.terminal);
        updates.push(`terminal = $${params.length}`);
    }
    if (data.status === 'delayed' && data.delay_minutes) {
        // Shift departure time
        params.push(data.delay_minutes);
        updates.push(`departure_time = departure_time + ($${params.length} * interval '1 minute')`);
        params.push(data.delay_minutes);
        updates.push(`arrival_time = arrival_time + ($${params.length} * interval '1 minute')`);
    }
    const updated = await (0, db_1.queryOne)(`UPDATE flights SET ${updates.join(', ')} WHERE id = $1
     RETURNING id, flight_number, status, gate, terminal, departure_time, arrival_time`, params);
    return (0, response_1.ok)(updated);
}
async function boardPassenger(flightId, body) {
    const data = (0, response_1.parseBody)(body);
    if (!data?.checkin_id)
        return (0, response_1.badRequest)('checkin_id is required');
    // Verify the checkin belongs to this flight
    const checkin = await (0, db_1.queryOne)(`SELECT ci.status, b.flight_id
     FROM checkins ci
     JOIN booking_passengers bp ON bp.id = ci.booking_passenger_id
     JOIN bookings b ON b.id = bp.booking_id
     WHERE ci.id = $1`, [data.checkin_id]);
    if (!checkin)
        return (0, response_1.notFound)('Check-in record');
    if (checkin.flight_id !== flightId)
        return (0, response_1.badRequest)('Check-in does not belong to this flight');
    if (checkin.status === 'boarded')
        return (0, response_1.badRequest)('Passenger has already boarded');
    if (checkin.status !== 'checked_in')
        return (0, response_1.badRequest)('Passenger is not checked in');
    const updated = await (0, db_1.queryOne)(`UPDATE checkins SET status = 'boarded', updated_at = now()
     WHERE id = $1 RETURNING id, status`, [data.checkin_id]);
    return (0, response_1.ok)(updated);
}
// ── GET /gate/flights/{id}/manifest ──────────────────────────────────────────
async function getManifest(flightId) {
    const manifest = await (0, db_1.query)(`SELECT
       bp.id AS passenger_id, bp.first_name, bp.last_name, bp.passport_number,
       s.seat_number, s.cabin_class,
       b.pnr, b.cabin_class AS booked_cabin,
       ci.id AS checkin_id, ci.status AS checkin_status,
       ci.baggage_count, ci.checked_in_at, ci.special_requests
     FROM bookings b
     JOIN booking_passengers bp ON bp.booking_id = b.id
     LEFT JOIN seats s ON s.id = bp.seat_id
     LEFT JOIN checkins ci ON ci.booking_passenger_id = bp.id
     WHERE b.flight_id = $1 AND b.status = 'confirmed'
     ORDER BY s.seat_number NULLS LAST, bp.last_name`, [flightId]);
    const flight = await (0, db_1.queryOne)(`SELECT f.flight_number, f.departure_time, f.status, f.gate, f.terminal,
            dep.iata_code AS origin, arr.iata_code AS destination
     FROM flights f
     JOIN airports dep ON dep.id = f.origin_id
     JOIN airports arr ON arr.id = f.destination_id
     WHERE f.id = $1`, [flightId]);
    if (!flight)
        return (0, response_1.notFound)('Flight');
    return (0, response_1.ok)({
        flight,
        total: manifest.length,
        boarded: manifest.filter((p) => p.checkin_status === 'boarded').length,
        checked_in: manifest.filter((p) => p.checkin_status === 'checked_in').length,
        not_checked_in: manifest.filter((p) => !p.checkin_status).length,
        passengers: manifest,
    });
}
// ── Router ────────────────────────────────────────────────────────────────────
const handler = async (event) => {
    try {
        const method = event.httpMethod;
        const path = event.path;
        const requestorRole = event.requestContext?.authorizer?.role ?? 'passenger';
        if (!GATE_ROLES.includes(requestorRole))
            return (0, response_1.forbidden)();
        const flightId = event.pathParameters?.id;
        const qs = event.queryStringParameters ?? {};
        if (method === 'GET' && path === '/gate/flights') {
            return getGateFlights(qs.date, qs.airport);
        }
        if (method === 'GET' && flightId && path.endsWith('/manifest')) {
            return getManifest(flightId);
        }
        if (method === 'GET' && flightId)
            return getFlightDetail(flightId);
        if (method === 'PATCH' && flightId && path.endsWith('/status')) {
            return updateFlightStatus(flightId, event.body);
        }
        if (method === 'POST' && flightId && path.endsWith('/board')) {
            return boardPassenger(flightId, event.body);
        }
        return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
    }
    catch (err) {
        return (0, response_1.serverError)(err);
    }
};
exports.handler = handler;
