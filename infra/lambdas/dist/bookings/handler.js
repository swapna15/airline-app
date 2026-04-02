"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const uuid_1 = require("uuid");
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
// ── POST /bookings ────────────────────────────────────────────────────────────
async function createBooking(body, userId) {
    const data = (0, response_1.parseBody)(body);
    if (!data?.flight_id || !data?.cabin_class || !data?.passengers?.length || !data?.contact) {
        return (0, response_1.badRequest)('flight_id, cabin_class, passengers, and contact are required');
    }
    if (!data.contact.email || !data.contact.phone) {
        return (0, response_1.badRequest)('contact email and phone are required');
    }
    // Verify flight exists
    const flight = await (0, db_1.queryOne)('SELECT id, status FROM flights WHERE id = $1', [data.flight_id]);
    if (!flight)
        return (0, response_1.notFound)('Flight');
    if (flight.status === 'cancelled')
        return (0, response_1.badRequest)('Flight is cancelled');
    // For each passenger with a seat_id, lock the seat
    const seatIds = data.passengers.map(p => p.seat_id).filter(Boolean);
    if (seatIds.length > 0) {
        const available = await (0, db_1.query)(`SELECT id FROM seats WHERE id = ANY($1) AND flight_id = $2 AND status = 'available'`, [seatIds, data.flight_id]);
        if (available.length !== seatIds.length) {
            return (0, response_1.badRequest)('One or more selected seats are no longer available');
        }
    }
    // Calculate total price from selected seats or minimum seat price
    let totalPrice = 0;
    if (seatIds.length > 0) {
        const prices = await (0, db_1.query)(`SELECT price FROM seats WHERE id = ANY($1)`, [seatIds]);
        totalPrice = prices.reduce((sum, r) => sum + parseFloat(r.price), 0);
    }
    else {
        const minPrice = await (0, db_1.queryOne)(`SELECT MIN(price) AS price FROM seats WHERE flight_id = $1 AND cabin_class = $2 AND status = 'available'`, [data.flight_id, data.cabin_class]);
        totalPrice = parseFloat(minPrice?.price ?? '0') * data.passengers.length;
    }
    // Generate PNR (6 char alphanumeric)
    const pnr = (0, uuid_1.v4)().replace(/-/g, '').toUpperCase().substring(0, 6);
    // Insert booking
    const booking = await (0, db_1.queryOne)(`INSERT INTO bookings (user_id, flight_id, return_flight_id, cabin_class, pnr, total_price, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'confirmed')
     RETURNING id, pnr, total_price, status`, [userId, data.flight_id, data.return_flight_id ?? null, data.cabin_class, pnr, totalPrice]);
    // Insert passengers
    for (const p of data.passengers) {
        await (0, db_1.queryOne)(`INSERT INTO booking_passengers
         (booking_id, first_name, last_name, date_of_birth, passport_number, nationality, seat_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [booking.id, p.first_name, p.last_name, p.date_of_birth,
            p.passport_number ?? null, p.nationality ?? null, p.seat_id ?? null]);
        // Reserve the seat
        if (p.seat_id) {
            await (0, db_1.query)(`UPDATE seats SET status = 'reserved', updated_at = now() WHERE id = $1`, [p.seat_id]);
        }
    }
    // Insert contact
    await (0, db_1.queryOne)(`INSERT INTO booking_contact (booking_id, email, phone) VALUES ($1, $2, $3)`, [booking.id, data.contact.email, data.contact.phone]);
    return (0, response_1.created)({
        id: booking.id,
        pnr: booking.pnr,
        status: booking.status,
        total_price: parseFloat(booking.total_price),
    });
}
// ── GET /bookings?user_id=xxx ─────────────────────────────────────────────────
async function listBookings(userId, requestorId, requestorRole) {
    // Passengers can only see their own bookings
    if (requestorRole === 'passenger' && requestorId !== userId) {
        return (0, response_1.forbidden)();
    }
    const bookings = await (0, db_1.query)(`SELECT
       b.id, b.pnr, b.status, b.cabin_class, b.total_price, b.created_at,
       f.flight_number, f.departure_time, f.arrival_time,
       dep.iata_code AS origin, arr.iata_code AS destination,
       al.name AS airline_name
     FROM bookings b
     JOIN flights f   ON f.id  = b.flight_id
     JOIN airports dep ON dep.id = f.origin_id
     JOIN airports arr ON arr.id = f.destination_id
     JOIN airlines al  ON al.id  = f.airline_id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC`, [userId]);
    return (0, response_1.ok)(bookings);
}
// ── GET /bookings/{id} ────────────────────────────────────────────────────────
async function getBooking(id, requestorId, requestorRole) {
    const booking = await (0, db_1.queryOne)(`SELECT
       b.id, b.pnr, b.status, b.cabin_class, b.total_price, b.created_at,
       b.user_id,
       f.id AS flight_id, f.flight_number, f.departure_time, f.arrival_time, f.gate, f.terminal,
       dep.iata_code AS origin_code, dep.city AS origin_city,
       arr.iata_code AS destination_code, arr.city AS destination_city,
       al.name AS airline_name
     FROM bookings b
     JOIN flights f   ON f.id  = b.flight_id
     JOIN airports dep ON dep.id = f.origin_id
     JOIN airports arr ON arr.id = f.destination_id
     JOIN airlines al  ON al.id  = f.airline_id
     WHERE b.id = $1`, [id]);
    if (!booking)
        return (0, response_1.notFound)('Booking');
    // Passengers can only view their own bookings
    if (requestorRole === 'passenger' && booking.user_id !== requestorId) {
        return (0, response_1.forbidden)();
    }
    // Fetch passengers
    const passengers = await (0, db_1.query)(`SELECT first_name, last_name, date_of_birth, passport_number, nationality,
            s.seat_number, s.cabin_class, s.seat_type
     FROM booking_passengers bp
     LEFT JOIN seats s ON s.id = bp.seat_id
     WHERE bp.booking_id = $1`, [id]);
    // Fetch contact
    const contact = await (0, db_1.queryOne)('SELECT email, phone FROM booking_contact WHERE booking_id = $1', [id]);
    return (0, response_1.ok)({ ...booking, passengers, contact });
}
// ── DELETE /bookings/{id} (cancel) ────────────────────────────────────────────
async function cancelBooking(id, requestorId, requestorRole) {
    const booking = await (0, db_1.queryOne)('SELECT user_id, status FROM bookings WHERE id = $1', [id]);
    if (!booking)
        return (0, response_1.notFound)('Booking');
    if (requestorRole === 'passenger' && booking.user_id !== requestorId) {
        return (0, response_1.forbidden)();
    }
    if (booking.status === 'cancelled') {
        return (0, response_1.badRequest)('Booking is already cancelled');
    }
    // Release reserved seats
    await (0, db_1.query)(`UPDATE seats s SET status = 'available', updated_at = now()
     FROM booking_passengers bp
     WHERE bp.booking_id = $1 AND bp.seat_id = s.id`, [id]);
    const updated = await (0, db_1.queryOne)(`UPDATE bookings SET status = 'cancelled', updated_at = now()
     WHERE id = $1 RETURNING id, status, pnr`, [id]);
    return (0, response_1.ok)(updated);
}
// ── Router ────────────────────────────────────────────────────────────────────
const handler = async (event) => {
    try {
        const method = event.httpMethod;
        const bookingId = event.pathParameters?.id;
        const requestorId = event.requestContext?.authorizer?.userId ?? '';
        const requestorRole = event.requestContext?.authorizer?.role ?? 'passenger';
        if (!requestorId)
            return (0, response_1.unauthorized)();
        if (method === 'POST' && !bookingId)
            return createBooking(event.body, requestorId);
        if (method === 'GET' && !bookingId) {
            const userId = event.queryStringParameters?.user_id ?? requestorId;
            return listBookings(userId, requestorId, requestorRole);
        }
        if (method === 'GET' && bookingId)
            return getBooking(bookingId, requestorId, requestorRole);
        if (method === 'DELETE' && bookingId)
            return cancelBooking(bookingId, requestorId, requestorRole);
        return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
    }
    catch (err) {
        return (0, response_1.serverError)(err);
    }
};
exports.handler = handler;
