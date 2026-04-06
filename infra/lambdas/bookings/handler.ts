import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../shared/db';
import { ok, created, badRequest, unauthorized, forbidden, notFound, serverError, parseBody } from '../shared/response';
import { resolveTenantId } from '../shared/tenant';

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
  tenantId: string,
): Promise<APIGatewayProxyResult> {
  const data = parseBody<CreateBookingInput>(body);

  if (!data?.flight_id || !data?.cabin_class || !data?.passengers?.length || !data?.contact) {
    return badRequest('flight_id, cabin_class, passengers, and contact are required');
  }
  if (!data.contact.email || !data.contact.phone) {
    return badRequest('contact email and phone are required');
  }

  // Verify flight exists and belongs to this tenant
  const flight = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM flights WHERE id = $1 AND tenant_id = $2',
    [data.flight_id, tenantId],
  );
  if (!flight) return notFound('Flight');
  if (flight.status === 'cancelled') return badRequest('Flight is cancelled');

  // Lock requested seats
  const seatIds = data.passengers.map(p => p.seat_id).filter(Boolean) as string[];
  if (seatIds.length > 0) {
    const available = await query<{ id: string }>(
      `SELECT id FROM seats WHERE id = ANY($1) AND flight_id = $2 AND is_occupied = false`,
      [seatIds, data.flight_id],
    );
    if (available.length !== seatIds.length) {
      return badRequest('One or more selected seats are no longer available');
    }
  }

  // Calculate total from seat extra_fees + base price
  let baseFare = 0;
  const priceCol =
    data.cabin_class === 'business' ? 'price_business' :
    data.cabin_class === 'first'    ? 'price_first'    : 'price_economy';

  const priceRow = await queryOne<Record<string, string>>(
    `SELECT ${priceCol} AS price FROM flights WHERE id = $1`,
    [data.flight_id],
  );
  baseFare = parseFloat(priceRow?.price ?? '0') * data.passengers.length;

  let seatFees = 0;
  if (seatIds.length > 0) {
    const fees = await query<{ extra_fee: string }>(
      'SELECT extra_fee FROM seats WHERE id = ANY($1)',
      [seatIds],
    );
    seatFees = fees.reduce((sum, r) => sum + parseFloat(r.extra_fee), 0);
  }

  const taxes = Math.round(baseFare * 0.12 * 100) / 100;
  const total = baseFare + taxes + seatFees;

  // Generate PNR (6 char alphanumeric)
  const pnr = uuidv4().replace(/-/g, '').toUpperCase().substring(0, 6);

  // Insert booking (includes tenant_id)
  const booking = await queryOne<{ id: string; pnr: string; status: string }>(
    `INSERT INTO bookings
       (tenant_id, user_id, flight_id, return_flight_id, pnr, status,
        base_fare, taxes, fees, seat_fees, total)
     VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, 0, $8, $9)
     RETURNING id, pnr, status`,
    [tenantId, userId, data.flight_id, data.return_flight_id ?? null,
     pnr, baseFare, taxes, seatFees, total],
  );

  // Insert passengers + reserve seats
  for (const p of data.passengers) {
    await queryOne(
      `INSERT INTO booking_passengers
         (booking_id, type, title, first_name, last_name,
          date_of_birth, passport_number, nationality, seat_id)
       VALUES ($1, 'adult', 'Mr', $2, $3, $4, $5, $6, $7)`,
      [booking!.id, p.first_name, p.last_name, p.date_of_birth,
       p.passport_number ?? null, p.nationality ?? null, p.seat_id ?? null],
    );

    if (p.seat_id) {
      await query(
        'UPDATE seats SET is_occupied = true WHERE id = $1',
        [p.seat_id],
      );
    }
  }

  // Insert contact
  await queryOne(
    `INSERT INTO booking_contact (booking_id, email, phone, street, city, state, zip_code, country)
     VALUES ($1, $2, $3, '', '', '', '', '')`,
    [booking!.id, data.contact.email, data.contact.phone],
  );

  return created({
    id: booking!.id,
    pnr: booking!.pnr,
    status: booking!.status,
    base_fare: baseFare,
    taxes,
    seat_fees: seatFees,
    total,
  });
}

// ── GET /bookings?user_id=xxx ─────────────────────────────────────────────────
async function listBookings(
  userId: string,
  requestorId: string,
  requestorRole: string,
  tenantId: string,
): Promise<APIGatewayProxyResult> {
  if (requestorRole === 'passenger' && requestorId !== userId) {
    return forbidden();
  }

  const bookings = await query(
    `SELECT
       b.id, b.pnr, b.status, b.total, b.created_at,
       f.flight_number, f.departure_time, f.arrival_time,
       dep.code AS origin, arr.code AS destination,
       al.name AS airline_name
     FROM bookings b
     JOIN flights f    ON f.id   = b.flight_id
     JOIN airports dep ON dep.code = f.origin_code
     JOIN airports arr ON arr.code = f.destination_code
     JOIN airlines al  ON al.code  = f.airline_code
     WHERE b.user_id = $1 AND b.tenant_id = $2
     ORDER BY b.created_at DESC`,
    [userId, tenantId],
  );

  return ok(bookings);
}

// ── GET /bookings/{id} ────────────────────────────────────────────────────────
async function getBooking(
  id: string,
  requestorId: string,
  requestorRole: string,
  tenantId: string,
): Promise<APIGatewayProxyResult> {
  const booking = await queryOne<{ user_id: string }>(
    `SELECT
       b.id, b.pnr, b.status, b.total, b.created_at, b.user_id,
       f.id AS flight_id, f.flight_number, f.departure_time, f.arrival_time, f.gate, f.terminal,
       dep.code AS origin_code, dep.city AS origin_city,
       arr.code AS destination_code, arr.city AS destination_city,
       al.name AS airline_name
     FROM bookings b
     JOIN flights f    ON f.id   = b.flight_id
     JOIN airports dep ON dep.code = f.origin_code
     JOIN airports arr ON arr.code = f.destination_code
     JOIN airlines al  ON al.code  = f.airline_code
     WHERE b.id = $1 AND b.tenant_id = $2`,
    [id, tenantId],
  );

  if (!booking) return notFound('Booking');

  if (requestorRole === 'passenger' && (booking as any).user_id !== requestorId) {
    return forbidden();
  }

  const passengers = await query(
    `SELECT bp.first_name, bp.last_name, bp.date_of_birth, bp.passport_number,
            s.row_number, s.letter, s.class, s.type
     FROM booking_passengers bp
     LEFT JOIN seats s ON s.id = bp.seat_id
     WHERE bp.booking_id = $1`,
    [id],
  );

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
  tenantId: string,
): Promise<APIGatewayProxyResult> {
  const booking = await queryOne<{ user_id: string; status: string }>(
    'SELECT user_id, status FROM bookings WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
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
    `UPDATE seats s SET is_occupied = false
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
    const method      = event.httpMethod;
    const bookingId   = event.pathParameters?.id;
    const requestorId: string = (event.requestContext as any)?.authorizer?.userId ?? '';
    const requestorRole: string = (event.requestContext as any)?.authorizer?.role ?? 'passenger';
    const tenantSlug: string = (event.requestContext as any)?.authorizer?.tenantSlug ?? 'aeromock';

    if (!requestorId) return unauthorized();

    const tenantId = await resolveTenantId(tenantSlug);
    if (!tenantId) return badRequest(`Unknown tenant: ${tenantSlug}`);

    if (method === 'POST' && !bookingId) return createBooking(event.body, requestorId, tenantId);

    if (method === 'GET' && !bookingId) {
      const userId = event.queryStringParameters?.user_id ?? requestorId;
      return listBookings(userId, requestorId, requestorRole, tenantId);
    }

    if (method === 'GET'    && bookingId) return getBooking(bookingId, requestorId, requestorRole, tenantId);
    if (method === 'DELETE' && bookingId) return cancelBooking(bookingId, requestorId, requestorRole, tenantId);

    return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
  } catch (err) {
    return serverError(err);
  }
};
