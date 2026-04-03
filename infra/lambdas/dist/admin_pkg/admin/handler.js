"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
// ── GET /admin/users ──────────────────────────────────────────────────────────
async function listUsers(page, limit, search) {
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    let searchFilter = '';
    if (search) {
        params.push(`%${search}%`);
        searchFilter = `WHERE name ILIKE $${params.length} OR email ILIKE $${params.length}`;
    }
    const [users, countResult] = await Promise.all([
        (0, db_1.query)(`SELECT id, name, email, role, created_at, updated_at
       FROM users
       ${searchFilter}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`, params),
        (0, db_1.queryOne)(`SELECT COUNT(*) AS count FROM users ${searchFilter}`, search ? [params[2]] : []),
    ]);
    return (0, response_1.ok)({
        users,
        total: parseInt(countResult?.count ?? '0'),
        page,
        limit,
    });
}
// ── GET /admin/users/{id} ─────────────────────────────────────────────────────
async function getUser(id) {
    const user = await (0, db_1.queryOne)(`SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = $1`, [id]);
    if (!user)
        return (0, response_1.notFound)('User');
    return (0, response_1.ok)(user);
}
// ── PATCH /admin/users/{id}/role ──────────────────────────────────────────────
const ALLOWED_ROLES = ['passenger', 'checkin_agent', 'gate_manager', 'coordinator', 'admin'];
async function updateUserRole(id, body) {
    const data = (0, response_1.parseBody)(body);
    if (!data?.role || !ALLOWED_ROLES.includes(data.role)) {
        return (0, response_1.badRequest)(`role must be one of: ${ALLOWED_ROLES.join(', ')}`);
    }
    const user = await (0, db_1.queryOne)(`UPDATE users SET role = $1, updated_at = now()
     WHERE id = $2 RETURNING id, name, email, role`, [data.role, id]);
    if (!user)
        return (0, response_1.notFound)('User');
    return (0, response_1.ok)(user);
}
// ── DELETE /admin/users/{id} ──────────────────────────────────────────────────
async function deleteUser(id, requestorId) {
    if (id === requestorId)
        return (0, response_1.badRequest)('Cannot delete your own account');
    const user = await (0, db_1.queryOne)('SELECT id FROM users WHERE id = $1', [id]);
    if (!user)
        return (0, response_1.notFound)('User');
    // Soft-delete: anonymise PII, keep bookings for audit trail
    await (0, db_1.queryOne)(`UPDATE users
     SET name = 'Deleted User', email = 'deleted_' || id || '@deleted.invalid',
         password = '', updated_at = now()
     WHERE id = $1`, [id]);
    return (0, response_1.ok)({ id, deleted: true });
}
// ── GET /admin/stats ──────────────────────────────────────────────────────────
async function getStats() {
    const [userStats, bookingStats, flightStats] = await Promise.all([
        (0, db_1.queryOne)(`SELECT
         COUNT(*) AS total_users,
         COUNT(*) FILTER (WHERE role = 'passenger') AS passengers,
         COUNT(*) FILTER (WHERE role = 'checkin_agent') AS checkin_agents,
         COUNT(*) FILTER (WHERE role = 'gate_manager') AS gate_managers,
         COUNT(*) FILTER (WHERE role = 'coordinator') AS coordinators,
         COUNT(*) FILTER (WHERE role = 'admin') AS admins
       FROM users`, []),
        (0, db_1.queryOne)(`SELECT
         COUNT(*) AS total_bookings,
         COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
         SUM(total_price) FILTER (WHERE status = 'confirmed') AS total_revenue
       FROM bookings`, []),
        (0, db_1.queryOne)(`SELECT
         COUNT(*) AS total_flights,
         COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled,
         COUNT(*) FILTER (WHERE status = 'boarding') AS boarding,
         COUNT(*) FILTER (WHERE status = 'departed') AS departed,
         COUNT(*) FILTER (WHERE status = 'arrived') AS arrived,
         COUNT(*) FILTER (WHERE status = 'delayed') AS delayed,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
       FROM flights`, []),
    ]);
    return (0, response_1.ok)({
        users: userStats,
        bookings: {
            ...bookingStats,
            total_revenue: parseFloat(bookingStats?.total_revenue ?? '0'),
        },
        flights: flightStats,
    });
}
// ── GET /admin/flights ────────────────────────────────────────────────────────
async function listFlights(page, limit, status) {
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    let statusFilter = '';
    if (status) {
        params.push(status);
        statusFilter = `AND f.status = $${params.length}`;
    }
    const [flights, countResult] = await Promise.all([
        (0, db_1.query)(`SELECT
         f.id, f.flight_number, f.departure_time, f.arrival_time,
         f.status, f.gate, f.terminal,
         al.name AS airline_name, al.iata_code AS airline_code,
         dep.iata_code AS origin, arr.iata_code AS destination,
         COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS bookings
       FROM flights f
       JOIN airlines al ON al.id = f.airline_id
       JOIN airports dep ON dep.id = f.origin_id
       JOIN airports arr ON arr.id = f.destination_id
       LEFT JOIN bookings b ON b.flight_id = f.id
       WHERE 1=1 ${statusFilter}
       GROUP BY f.id, al.id, dep.id, arr.id
       ORDER BY f.departure_time DESC
       LIMIT $1 OFFSET $2`, params),
        (0, db_1.queryOne)(`SELECT COUNT(*) AS count FROM flights WHERE 1=1 ${statusFilter}`, status ? [status] : []),
    ]);
    return (0, response_1.ok)({
        flights,
        total: parseInt(countResult?.count ?? '0'),
        page,
        limit,
    });
}
// ── Router ────────────────────────────────────────────────────────────────────
const handler = async (event) => {
    try {
        const method = event.httpMethod;
        const path = event.path;
        const requestorRole = event.requestContext?.authorizer?.role ?? 'passenger';
        const requestorId = event.requestContext?.authorizer?.userId ?? '';
        if (requestorRole !== 'admin')
            return (0, response_1.forbidden)();
        const userId = event.pathParameters?.id;
        const qs = event.queryStringParameters ?? {};
        const page = parseInt(qs.page ?? '1');
        const limit = Math.min(parseInt(qs.limit ?? '20'), 100);
        if (method === 'GET' && path === '/admin/stats')
            return getStats();
        if (method === 'GET' && path === '/admin/users')
            return listUsers(page, limit, qs.search);
        if (method === 'GET' && userId && path.includes('/admin/users/'))
            return getUser(userId);
        if (method === 'PATCH' && userId && path.endsWith('/role'))
            return updateUserRole(userId, event.body);
        if (method === 'DELETE' && userId)
            return deleteUser(userId, requestorId);
        if (method === 'GET' && path === '/admin/flights') {
            return listFlights(page, limit, qs.status);
        }
        return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
    }
    catch (err) {
        return (0, response_1.serverError)(err);
    }
};
exports.handler = handler;
