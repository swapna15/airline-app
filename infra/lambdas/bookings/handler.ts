import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../shared/db';
import { ok, created, badRequest, unauthorized, forbidden, notFound, serverError, parseBody } from '../shared/response';

interface PassengerInput {
  first_name: string;
  last_name: string;
  date_of_birth: string;  // YYYY-MM-DD
  passport_number?: string;
  nationality?: string;
  seat_id?: string;
}

interface ContactInput {
  email: string;
  phone: string;
}

interface CreateBookingInput {
  flight_id: string;
  return_flight_id?: string;
  cabin_class: 'economy' | 'business' | 'first';
  passengers: PassengerInput[];
  contact: ContactInput;
}

// ── POST /bookings ────────────────────────────────────────────────────────────
async function createBooking(
  body: string | null,
  userId: string,
): Promise<APIGatewayProxyResult> {
  const data = parseBody<CreateBookingInput>(body);

  if (!data?.flight_id || !data?.cabin_class || !data?.passengers?.length || !data?.contact) {
    return badRequest('flight_id, cabin_class, passengers, and contact are required');
  }
  if (!data.contact.email || !data.contact.phone) {
    return badRequest('contact email and phone are required');
  }

  // Verify flight exists
  const flight = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM flights WHERE id = $1',
    [data.flight_id],
  );
  if (!flight) return notFound('Flight');
  if (flight.status === 'cancelled') return badRequest('Flight is cancelled');

  // For each passenger with a seat_id, lock the seat
  const seatIds = data.passengers.map(p => p.seat_id).filter(Boolean) as string[];
  if (seatIds.length > 0) {
    const available = await query<{ id: string }>(
      `SELECT id FROM seats WHERE id = ANY($1) AND flight_id = $2 AND status = 'available'`,
      [seatIds, data.flight_id],
    );
    if (available.length !== seatIds.length) {
      return badRequest('One or more selected seats are no longer available');
    }
  }

  // Calculate total price from selected seats or minimum seat price
  let totalPrice = 0;
  if (seatIds.length > 0) {
    const prices = await query<{ price: string }>(
      `SELECT price FROM seats WHERE id = ANY($1)`,
      [seatIds],
    );
    totalPrice = prices.reduce((sum, r) => sum + parseFloat(r.price), 0);
  } else {
    const minPrice = await queryOne<{ price: string }>(
      `SELECT MIN(price) AS price FROM seats WHERE flight_id = $1 AND cabin_class = $2 AND status = 'available'`,
      [data.flight_id, data.cabin_class],
    );
    totalPrice = parseFloat(minPrice?.price ?? '0') * data.passengers.length;
  }

  // Generate PNR (6 char alphanumeric)
  const pnr = uuidv4().replace(/-/g, '').toUpperCase().substring(0, 6);

  // Insert booking
  const booking = await queryOne<{ id: string; pnr: string; total_price: string; status: string }>(
    `INSERT INTO bookings (user_id, flight_id, return_flight_id, cabin_class, pnr, total_price, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'confirmed')
     RETURNING id, pnr, total_price, status`,
    [userId, data.flight_id, data.return_flight_id ?? null, data.cabin_class, pnr, totalPrice],
  );

  // Insert passengers
  for (const p of data.passengers) {
    await queryOne(
      `INSERT INTO booking_passengers
         (booking_id, first_name, last_name, date_of_birth, passport_number, nationality, seat_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [booking!.id, p.first_name, p.last_name, p.date_of_birth,
       p.passport_number ?? null, p.nationality ?? null, p.seat_id ?? null],
    );

    // Reserve the seat
    if (p.seat_id) {
      await query(
        `UPDATE seats SET status = 'reserved', updated_at = now() WHERE id = $1`,
        [p.seat_id],
      );
    }
  }

  // Insert contact
  await queryOne(
    `INSERT INTO booking_contact (booking_id, email, phone) VALUES ($1, $2, $3)`,
    [booking!.id, data.contact.email, data.contact.phone],
  );

  return created({
    id: booking!.id,
    pnr: booking!.pnr,
    status: booking!.status,
    total_price: parseFloat(booking!.total_price),
  });
}

// ── GET /bookings?user_id=xxx ─────────────────────────────────────────────────
async function listBookings(
  userId: string,
  requestorId: string,
  requestorRole: string,
): Promise<APIGatewayProxyResult> {
  // Passengers can only see their own bookings
  if (requestorRole === 'passenger' && requestorId !== userId) {
    return forbidden();
  }

  const bookings = await query(
    `SELECT
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
     ORDER BY b.created_at DESC`,
    [userId],
  );

  return ok(bookings);
}

// ── GET /bookings/{id} ────────────────────────────────────────────────────────
async function getBooking(
  id: string,
  requestorId: string,
  requestorRole: string,
): Promise<APIGatewayProxyResult> {
  const booking = await queryOne<{ user_id: string }>(
    `SELECT
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
     WHERE b.id = $1`,
    [id],
  );

  if (!booking) return notFound('Booking');

  // Passengers can only view their own bookings
  if (requestorRole === 'passenger' && (booking as any).user_id !== requestorId) {
    return forbidden();
  }

  // Fetch passengers
  const passengers = await query(
    `SELECT first_name, last_name, date_of_birth, passport_number, nationality,
            s.seat_number, s.cabin_class, s.seat_type
     FROM booking_passengers bp
     LEFT JOIN seats s ON s.id = bp.seat_id
     WHERE bp.booking_id = $1`,
    [id],
  );

  // Fetch contact
  const contact = await queryOne(
    'SELECT email, phone FROM booking_contact WHERE booking_id = $1',
    [id],
  );

  return ok({ ...booking, passengers, contact });
}

// ── DELETE /bookings/{id} (cancel) ────────────────────────────────────────────
async function cancelBooking(
  id: string,
  requestorId: string,
  requestorRole: string,
): Promise<APIGatewayProxyResult> {
  const booking = await queryOne<{ user_id: string; status: string }>(
    'SELECT user_id, status FROM bookings WHERE id = $1',
    [id],
  );
  if (!booking) return notFound('Booking');

  if (requestorRole === 'passenger' && (booking as any).user_id !== requestorId) {
    return forbidden();
  }
  if ((booking as any).status === 'cancelled') {
    return badRequest('Booking is already cancelled');
  }

  // Release reserved seats
  await query(
    `UPDATE seats s SET status = 'available', updated_at = now()
     FROM booking_passengers bp
     WHERE bp.booking_id = $1 AND bp.seat_id = s.id`,
    [id],
  );

  const updated = await queryOne<{ id: string; status: string; pnr: string }>(
    `UPDATE bookings SET status = 'cancelled', updated_at = now()
     WHERE id = $1 RETURNING id, status, pnr`,
    [id],
  );

  return ok(updated);
}

// ── Router ────────────────────────────────────────────────────────────────────
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method = event.httpMethod;
    const bookingId = event.pathParameters?.id;
    const requestorId: string = (event.requestContext as any)?.authorizer?.userId ?? '';
    const requestorRole: string = (event.requestContext as any)?.authorizer?.role ?? 'passenger';

    if (!requestorId) return unauthorized();

    if (method === 'POST' && !bookingId) return createBooking(event.body, requestorId);

    if (method === 'GET' && !bookingId) {
      const userId = event.queryStringParameters?.user_id ?? requestorId;
      return listBookings(userId, requestorId, requestorRole);
    }

    if (method === 'GET' && bookingId) return getBooking(bookingId, requestorId, requestorRole);
    if (method === 'DELETE' && bookingId) return cancelBooking(bookingId, requestorId, requestorRole);

    return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
  } catch (err) {
    return serverError(err);
  }
};
