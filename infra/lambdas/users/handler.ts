import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../shared/db';
import { ok, created, badRequest, unauthorized, notFound, serverError, parseBody } from '../shared/response';

// ── POST /users/register ─────────────────────────────────────────────────────
async function register(body: string | null): Promise<APIGatewayProxyResult> {
  const data = parseBody<{ name: string; email: string; password: string }>(body);
  if (!data?.name || !data?.email || !data?.password) {
    return badRequest('name, email, and password are required');
  }
  if (data.password.length < 8) {
    return badRequest('Password must be at least 8 characters');
  }

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existing) return badRequest('Email already registered');

  const hash = await bcrypt.hash(data.password, 10);

  const user = await queryOne<{ id: string; name: string; email: string; role: string }>(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, 'passenger')
     RETURNING id, name, email, role`,
    [data.name.trim(), data.email.toLowerCase(), hash],
  );

  return created({ id: user!.id, name: user!.name, email: user!.email, role: user!.role });
}

// ── POST /users/login ─────────────────────────────────────────────────────────
async function login(body: string | null): Promise<APIGatewayProxyResult> {
  const data = parseBody<{ email: string; password: string }>(body);
  if (!data?.email || !data?.password) {
    return badRequest('email and password are required');
  }

  const user = await queryOne<{ id: string; name: string; email: string; password: string; role: string }>(
    'SELECT id, name, email, password, role FROM users WHERE email = $1',
    [data.email.toLowerCase()],
  );

  if (!user) return unauthorized('Invalid email or password');

  const valid = await bcrypt.compare(data.password, user.password);
  if (!valid) return unauthorized('Invalid email or password');

  // Never return the hashed password
  return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
}

// ── GET /users/{id} ───────────────────────────────────────────────────────────
async function getUser(id: string): Promise<APIGatewayProxyResult> {
  const user = await queryOne<{ id: string; name: string; email: string; role: string; created_at: string }>(
    'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
    [id],
  );
  if (!user) return notFound('User');
  return ok(user);
}

// ── PATCH /users/{id}/role ────────────────────────────────────────────────────
async function updateRole(
  id: string,
  body: string | null,
  requestorRole: string,
): Promise<APIGatewayProxyResult> {
  if (requestorRole !== 'admin') {
    return { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const data = parseBody<{ role: string }>(body);
  const allowed = ['passenger', 'checkin_agent', 'gate_manager', 'coordinator', 'flight_planner', 'admin'];
  if (!data?.role || !allowed.includes(data.role)) {
    return badRequest(`role must be one of: ${allowed.join(', ')}`);
  }

  const user = await queryOne<{ id: string; name: string; email: string; role: string }>(
    'UPDATE users SET role = $1, updated_at = now() WHERE id = $2 RETURNING id, name, email, role',
    [data.role, id],
  );
  if (!user) return notFound('User');
  return ok(user);
}

// ── Router ────────────────────────────────────────────────────────────────────
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method = event.httpMethod;
    const path = event.path;
    const userId = event.pathParameters?.id;
    const requestorRole = (event.requestContext as any)?.authorizer?.role ?? 'passenger';

    if (method === 'POST' && path === '/users/register') return register(event.body);
    if (method === 'POST' && path === '/users/login')    return login(event.body);
    if (method === 'GET'  && userId)                     return getUser(userId);
    if (method === 'PATCH' && userId)                    return updateRole(userId, event.body, requestorRole);

    return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
  } catch (err) {
    return serverError(err);
  }
};
