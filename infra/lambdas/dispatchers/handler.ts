import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { query, queryOne } from '../shared/db';
import { ok, badRequest, unauthorized, forbidden, notFound, serverError, parseBody } from '../shared/response';

/**
 * Dispatcher certifications API — admin-only.
 *
 * Routes:
 *   GET  /admin/dispatchers                       — list all dispatchers in tenant + their cert summary
 *   GET  /admin/dispatchers/{userId}              — full cert + areas + types + currency for one user
 *   PUT  /admin/dispatchers/{userId}              — upsert certificate fields
 *   PUT  /admin/dispatchers/{userId}/areas        — replace areas list
 *   PUT  /admin/dispatchers/{userId}/types        — replace type-rating list
 *   PUT  /admin/dispatchers/{userId}/currency     — upsert one currency row (group + last_familiarization_at)
 */

interface UpsertCertBody {
  certNumber: string;
  issuingAuthority: string;
  issuedAt: string;        // YYYY-MM-DD
  expiresAt?: string;      // YYYY-MM-DD or null
  status?: 'active' | 'suspended' | 'revoked';
  notes?: string;
}

async function listDispatchers(): Promise<APIGatewayProxyResult> {
  const rows = await query<{
    user_id: string; email: string; name: string; role: string;
    cert_number: string | null; issuing_authority: string | null; cert_status: string | null;
    expires_at: string | null; expired_currency_count: string;
  }>(
    `SELECT
       u.id   AS user_id,
       u.email, u.name, u.role,
       c.cert_number,
       c.issuing_authority,
       c.status AS cert_status,
       c.expires_at,
       (SELECT COUNT(*) FROM dispatcher_currency cc
          WHERE cc.certificate_id = c.id AND cc.expires_at < CURRENT_DATE) AS expired_currency_count
     FROM users u
     LEFT JOIN dispatcher_certificates c ON c.user_id = u.id
     WHERE u.role IN ('flight_planner', 'admin')
     ORDER BY u.email`,
  );
  return ok({
    dispatchers: rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name,
      role: r.role,
      certificate: r.cert_number ? {
        certNumber: r.cert_number,
        issuingAuthority: r.issuing_authority,
        status: r.cert_status,
        expiresAt: r.expires_at,
      } : null,
      expiredCurrencyCount: parseInt(r.expired_currency_count ?? '0', 10),
    })),
  });
}

async function getDispatcher(userId: string): Promise<APIGatewayProxyResult> {
  const cert = await queryOne<{
    id: string; cert_number: string; issuing_authority: string; issued_at: string;
    expires_at: string | null; status: string; notes: string | null;
  }>(
    `SELECT id, cert_number, issuing_authority, issued_at, expires_at, status, notes
       FROM dispatcher_certificates WHERE user_id = $1`,
    [userId],
  );
  const user = await queryOne<{ id: string; email: string; name: string; role: string }>(
    `SELECT id, email, name, role FROM users WHERE id = $1`,
    [userId],
  );
  if (!user) return notFound('user');
  if (!cert) {
    return ok({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      certificate: null,
      areas: [],
      typeRatings: [],
      currency: [],
    });
  }
  const [areas, types, currency] = await Promise.all([
    query<{ area_code: string; qualified_at: string }>(
      `SELECT area_code, qualified_at FROM dispatcher_areas WHERE certificate_id = $1 ORDER BY area_code`,
      [cert.id],
    ),
    query<{ type_code: string; qualified_at: string }>(
      `SELECT type_code, qualified_at FROM dispatcher_type_ratings WHERE certificate_id = $1 ORDER BY type_code`,
      [cert.id],
    ),
    query<{ group_code: string; last_familiarization_at: string; expires_at: string; notes: string | null }>(
      `SELECT group_code, last_familiarization_at, expires_at, notes
         FROM dispatcher_currency WHERE certificate_id = $1 ORDER BY group_code`,
      [cert.id],
    ),
  ]);
  return ok({
    user,
    certificate: cert,
    areas,
    typeRatings: types,
    currency,
  });
}

async function upsertCertificate(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  const data = parseBody<UpsertCertBody>(body);
  if (!data?.certNumber || !data?.issuingAuthority || !data?.issuedAt) {
    return badRequest('certNumber, issuingAuthority, and issuedAt are required');
  }
  const updated = await queryOne(
    `INSERT INTO dispatcher_certificates
       (user_id, cert_number, issuing_authority, issued_at, expires_at, status, notes)
     VALUES ($1, $2, $3, $4::date, $5::date, COALESCE($6,'active'), $7)
     ON CONFLICT (user_id) DO UPDATE
       SET cert_number       = EXCLUDED.cert_number,
           issuing_authority = EXCLUDED.issuing_authority,
           issued_at         = EXCLUDED.issued_at,
           expires_at        = EXCLUDED.expires_at,
           status            = EXCLUDED.status,
           notes             = EXCLUDED.notes,
           updated_at        = NOW()
     RETURNING *`,
    [userId, data.certNumber, data.issuingAuthority, data.issuedAt, data.expiresAt ?? null, data.status ?? null, data.notes ?? null],
  );
  return ok(updated);
}

async function replaceAreas(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  const data = parseBody<{ areas: string[] }>(body);
  if (!Array.isArray(data?.areas)) return badRequest('areas: string[] required');
  const cert = await queryOne<{ id: string }>(
    `SELECT id FROM dispatcher_certificates WHERE user_id = $1`, [userId],
  );
  if (!cert) return notFound('certificate (create one first via PUT /admin/dispatchers/{userId})');
  await query(`DELETE FROM dispatcher_areas WHERE certificate_id = $1`, [cert.id]);
  for (const a of data.areas) {
    await query(
      `INSERT INTO dispatcher_areas (certificate_id, area_code) VALUES ($1, $2)`,
      [cert.id, a.toUpperCase()],
    );
  }
  return ok({ certificateId: cert.id, areas: data.areas });
}

async function replaceTypes(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  const data = parseBody<{ types: string[] }>(body);
  if (!Array.isArray(data?.types)) return badRequest('types: string[] required');
  const cert = await queryOne<{ id: string }>(
    `SELECT id FROM dispatcher_certificates WHERE user_id = $1`, [userId],
  );
  if (!cert) return notFound('certificate');
  await query(`DELETE FROM dispatcher_type_ratings WHERE certificate_id = $1`, [cert.id]);
  for (const t of data.types) {
    await query(
      `INSERT INTO dispatcher_type_ratings (certificate_id, type_code) VALUES ($1, $2)`,
      [cert.id, t.toUpperCase()],
    );
  }
  return ok({ certificateId: cert.id, types: data.types });
}

async function upsertCurrency(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  const data = parseBody<{ groupCode: string; lastFamiliarizationAt: string; notes?: string }>(body);
  if (!data?.groupCode || !data?.lastFamiliarizationAt) {
    return badRequest('groupCode and lastFamiliarizationAt are required');
  }
  const cert = await queryOne<{ id: string }>(
    `SELECT id FROM dispatcher_certificates WHERE user_id = $1`, [userId],
  );
  if (!cert) return notFound('certificate');
  // §121.463(c) — expires 12 months from last familiarization.
  const updated = await queryOne(
    `INSERT INTO dispatcher_currency (certificate_id, group_code, last_familiarization_at, expires_at, notes)
     VALUES ($1, $2, $3::date, ($3::date + INTERVAL '12 months')::date, $4)
     ON CONFLICT (certificate_id, group_code) DO UPDATE
       SET last_familiarization_at = EXCLUDED.last_familiarization_at,
           expires_at              = EXCLUDED.expires_at,
           notes                   = EXCLUDED.notes
     RETURNING *`,
    [cert.id, data.groupCode.toUpperCase(), data.lastFamiliarizationAt, data.notes ?? null],
  );
  return ok(updated);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const reviewerId: string = (event.requestContext as any)?.authorizer?.userId ?? '';
    const role: string       = (event.requestContext as any)?.authorizer?.role ?? 'passenger';
    if (!reviewerId) return unauthorized();
    if (role !== 'admin') return forbidden('admin role required');

    const method = event.httpMethod;
    const path   = event.path;
    const userId = event.pathParameters?.userId;

    if (method === 'GET' && path.endsWith('/admin/dispatchers')) return listDispatchers();
    if (!userId) return notFound('userId path parameter required');

    if (method === 'GET' && path.endsWith(`/admin/dispatchers/${userId}`))
      return getDispatcher(userId);

    if (method === 'PUT' && path.endsWith('/areas'))    return replaceAreas(userId, event.body);
    if (method === 'PUT' && path.endsWith('/types'))    return replaceTypes(userId, event.body);
    if (method === 'PUT' && path.endsWith('/currency')) return upsertCurrency(userId, event.body);
    if (method === 'PUT')                               return upsertCertificate(userId, event.body);

    return notFound('Route not found');
  } catch (err) {
    return serverError(err);
  }
};
