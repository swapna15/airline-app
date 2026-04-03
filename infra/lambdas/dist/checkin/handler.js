"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
// Roles allowed to perform check-in operations
const CHECKIN_ROLES = ['checkin_agent', 'coordinator', 'admin'];
// ── GET /checkin?pnr=XXX&last_name=YYY ───────────────────────────────────────
async function lookupPassenger(pnr, lastName, flightNumber) {
    if (!pnr && !(lastName && flightNumber)) {
        return (0, response_1.badRequest)('Provide pnr, or both last_name and flight_number');
    }
    let sql;
    let params;
    if (pnr) {
        sql = `
      SELECT
        b.id AS booking_id, b.pnr, b.status AS booking_status, b.cabin_class,
        bp.id AS passenger_id, bp.first_name, bp.last_name, bp.passport_number,
        s.seat_number, s.cabin_class AS seat_cabin,
        f.id AS flight_id, f.flight_number, f.departure_time, f.gate, f.terminal,
        dep.iata_code AS origin, arr.iata_code AS destination,
        ci.id AS checkin_id, ci.status AS checkin_status, ci.checked_in_at, ci.baggage_count
      FROM bookings b
      JOIN booking_passengers bp ON bp.booking_id = b.id
      LEFT JOIN seats s ON s.id = bp.seat_id
      JOIN flights f ON f.id = b.flight_id
      JOIN airports dep ON dep.id = f.origin_id
      JOIN airports arr ON arr.id = f.destination_id
      LEFT JOIN checkins ci ON ci.booking_passenger_id = bp.id
      WHERE b.pnr = $1`;
        params = [pnr.toUpperCase()];
    }
    else {
        sql = `
      SELECT
        b.id AS booking_id, b.pnr, b.status AS booking_status, b.cabin_class,
        bp.id AS passenger_id, bp.first_name, bp.last_name, bp.passport_number,
        s.seat_number, s.cabin_class AS seat_cabin,
        f.id AS flight_id, f.flight_number, f.departure_time, f.gate, f.terminal,
        dep.iata_code AS origin, arr.iata_code AS destination,
        ci.id AS checkin_id, ci.status AS checkin_status, ci.checked_in_at, ci.baggage_count
      FROM bookings b
      JOIN booking_passengers bp ON bp.booking_id = b.id
      LEFT JOIN seats s ON s.id = bp.seat_id
      JOIN flights f ON f.id = b.flight_id
      JOIN airports dep ON dep.id = f.origin_id
      JOIN airports arr ON arr.id = f.destination_id
      LEFT JOIN checkins ci ON ci.booking_passenger_id = bp.id
      WHERE LOWER(bp.last_name) = LOWER($1) AND f.flight_number = $2`;
        params = [lastName, flightNumber];
    }
    const rows = await (0, db_1.query)(sql, params);
    if (!rows.length)
        return (0, response_1.notFound)('Passenger');
    return (0, response_1.ok)(rows);
}
async function checkIn(body, agentId) {
    const data = (0, response_1.parseBody)(body);
    if (!data?.booking_passenger_id) {
        return (0, response_1.badRequest)('booking_passenger_id is required');
    }
    // Verify the passenger booking exists and is confirmed
    const passenger = await (0, db_1.queryOne)(`SELECT b.id AS booking_id, b.status AS booking_status, f.departure_time
     FROM booking_passengers bp
     JOIN bookings b ON b.id = bp.booking_id
     JOIN flights f ON f.id = b.flight_id
     WHERE bp.id = $1`, [data.booking_passenger_id]);
    if (!passenger)
        return (0, response_1.notFound)('Passenger booking');
    if (passenger.booking_status === 'cancelled') {
        return (0, response_1.badRequest)('Cannot check in a cancelled booking');
    }
    // Check if already checked in
    const existing = await (0, db_1.queryOne)(`SELECT id, status FROM checkins WHERE booking_passenger_id = $1`, [data.booking_passenger_id]);
    if (existing && existing.status === 'checked_in') {
        return (0, response_1.badRequest)('Passenger is already checked in');
    }
    // Verify check-in window (24h before, close 45min before departure)
    const departure = new Date(passenger.departure_time);
    const now = new Date();
    const hoursUntil = (departure.getTime() - now.getTime()) / 3600000;
    if (hoursUntil > 24)
        return (0, response_1.badRequest)('Check-in opens 24 hours before departure');
    if (hoursUntil < 0.75)
        return (0, response_1.badRequest)('Check-in closed 45 minutes before departure');
    // Upsert checkin record
    const checkin = await (0, db_1.queryOne)(`INSERT INTO checkins
       (booking_passenger_id, agent_id, status, baggage_count, special_requests, checked_in_at)
     VALUES ($1, $2, 'checked_in', $3, $4, now())
     ON CONFLICT (booking_passenger_id)
     DO UPDATE SET status = 'checked_in', baggage_count = $3, special_requests = $4,
                   checked_in_at = now(), agent_id = $2, updated_at = now()
     RETURNING id, status, baggage_count, checked_in_at`, [data.booking_passenger_id, agentId, data.baggage_count ?? 0, data.special_requests ?? null]);
    return (0, response_1.ok)(checkin);
}
// ── POST /checkin/{id}/boarding-pass ──────────────────────────────────────────
async function getBoardingPass(checkinId) {
    const pass = await (0, db_1.queryOne)(`SELECT
       ci.id, ci.status, ci.checked_in_at, ci.baggage_count,
       bp.first_name, bp.last_name, bp.passport_number,
       s.seat_number, s.cabin_class,
       b.pnr, b.cabin_class AS booked_cabin,
       f.flight_number, f.departure_time, f.arrival_time, f.gate, f.terminal,
       dep.iata_code AS origin, dep.city AS origin_city,
       arr.iata_code AS destination, arr.city AS destination_city,
       al.name AS airline_name, al.iata_code AS airline_code
     FROM checkins ci
     JOIN booking_passengers bp ON bp.id = ci.booking_passenger_id
     LEFT JOIN seats s ON s.id = bp.seat_id
     JOIN bookings b ON b.id = bp.booking_id
     JOIN flights f ON f.id = b.flight_id
     JOIN airports dep ON dep.id = f.origin_id
     JOIN airports arr ON arr.id = f.destination_id
     JOIN airlines al ON al.id = f.airline_id
     WHERE ci.id = $1`, [checkinId]);
    if (!pass)
        return (0, response_1.notFound)('Check-in record');
    if (pass.status !== 'checked_in')
        return (0, response_1.badRequest)('Passenger is not checked in');
    return (0, response_1.ok)(pass);
}
// ── GET /checkin/flight/{flightId} ────────────────────────────────────────────
async function getFlightCheckins(flightId) {
    const passengers = await (0, db_1.query)(`SELECT
       bp.id AS passenger_id, bp.first_name, bp.last_name, bp.passport_number,
       s.seat_number, s.cabin_class,
       b.pnr, b.cabin_class AS booked_cabin,
       ci.id AS checkin_id, ci.status AS checkin_status, ci.checked_in_at, ci.baggage_count
     FROM bookings b
     JOIN booking_passengers bp ON bp.booking_id = b.id
     LEFT JOIN seats s ON s.id = bp.seat_id
     LEFT JOIN checkins ci ON ci.booking_passenger_id = bp.id
     WHERE b.flight_id = $1 AND b.status = 'confirmed'
     ORDER BY bp.last_name, bp.first_name`, [flightId]);
    const total = passengers.length;
    const checkedIn = passengers.filter((p) => p.checkin_status === 'checked_in').length;
    return (0, response_1.ok)({ total, checked_in: checkedIn, passengers });
}
// ── Router ────────────────────────────────────────────────────────────────────
const handler = async (event) => {
    try {
        const method = event.httpMethod;
        const path = event.path;
        const requestorRole = event.requestContext?.authorizer?.role ?? 'passenger';
        const agentId = event.requestContext?.authorizer?.userId ?? '';
        if (!CHECKIN_ROLES.includes(requestorRole))
            return (0, response_1.forbidden)();
        const checkinId = event.pathParameters?.id;
        const flightId = event.pathParameters?.flightId;
        if (method === 'GET' && path === '/checkin') {
            const { pnr, last_name, flight_number } = event.queryStringParameters ?? {};
            return lookupPassenger(pnr, last_name, flight_number);
        }
        if (method === 'POST' && path === '/checkin')
            return checkIn(event.body, agentId);
        if (method === 'GET' && checkinId && path.endsWith('/boarding-pass')) {
            return getBoardingPass(checkinId);
        }
        if (method === 'GET' && flightId)
            return getFlightCheckins(flightId);
        return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
    }
    catch (err) {
        return (0, response_1.serverError)(err);
    }
};
exports.handler = handler;
