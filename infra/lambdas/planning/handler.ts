import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { query, queryOne } from '../shared/db';
import { ok, created, badRequest, unauthorized, forbidden, notFound, serverError, parseBody } from '../shared/response';
import { resolveTenantId } from '../shared/tenant';

/**
 * Planning Lambda — backs /lib/planner-store.ts when NEXT_PUBLIC_API_URL is set.
 *
 * Routes:
 *   GET    /planning/flight-plans/{flightId}                  → load (auto-create draft if missing)
 *   PUT    /planning/flight-plans/{flightId}                  → upsert phases / status
 *   GET    /planning/flight-plans/{flightId}/reviews          → list reviews for a flight plan
 *   POST   /planning/flight-plans/{flightId}/reviews          → append a review event
 *   GET    /planning/rejection-comments?phase=brief&limit=10  → cross-flight rejection comments (Phase D)
 */

const PHASES = ['brief', 'aircraft', 'route', 'fuel', 'weight_balance', 'crew', 'slot_atc', 'release'] as const;
type PhaseId = (typeof PHASES)[number];

type PhaseStatus = 'pending' | 'generating' | 'ready' | 'approved' | 'rejected';

interface PhaseState {
  status: PhaseStatus;
  summary?: string;
  source?: string;
  data?: unknown;
  comment?: string;
  generatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
}

type PlanStatus = 'draft' | 'in_review' | 'released' | 'flown' | 'cancelled';

interface FlightPlanRow {
  id: string;
  tenant_id: string;
  flight_id: string;
  status: PlanStatus;
  brief: PhaseState;
  aircraft: PhaseState;
  route: PhaseState;
  fuel: PhaseState;
  weight_balance: PhaseState;
  crew: PhaseState;
  slot_atc: PhaseState;
  released_by: string | null;
  released_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewRow {
  id: string;
  flight_plan_id: string;
  phase: PhaseId;
  action: 'approve' | 'reject' | 'edit';
  comment: string | null;
  reviewer_id: string;
  created_at: string;
}

const emptyPhase = (): PhaseState => ({ status: 'pending' });

function rowToApi(row: FlightPlanRow) {
  return {
    flightId: row.flight_id,
    status: row.status,
    phases: {
      brief:          row.brief          ?? emptyPhase(),
      aircraft:       row.aircraft       ?? emptyPhase(),
      route:          row.route          ?? emptyPhase(),
      fuel:           row.fuel           ?? emptyPhase(),
      weight_balance: row.weight_balance ?? emptyPhase(),
      crew:           row.crew           ?? emptyPhase(),
      slot_atc:       row.slot_atc       ?? emptyPhase(),
      release:        row.status === 'released' ? { status: 'approved' as const } : emptyPhase(),
    },
    releasedAt: row.released_at ?? undefined,
    releasedBy: row.released_by ?? undefined,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

// ── GET /planning/flight-plans/{flightId} ─────────────────────────────────────
async function getOrCreatePlan(flightId: string, tenantId: string): Promise<APIGatewayProxyResult> {
  const existing = await queryOne<FlightPlanRow>(
    'SELECT * FROM flight_plans WHERE flight_id = $1 AND tenant_id = $2',
    [flightId, tenantId],
  );
  if (existing) return ok(rowToApi(existing));

  // Create a draft row on first load. Idempotent thanks to UNIQUE(tenant_id, flight_id).
  const inserted = await queryOne<FlightPlanRow>(
    `INSERT INTO flight_plans (tenant_id, flight_id, status)
     VALUES ($1, $2, 'draft')
     ON CONFLICT (tenant_id, flight_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [tenantId, flightId],
  );
  return ok(rowToApi(inserted!));
}

// ── PUT /planning/flight-plans/{flightId} ─────────────────────────────────────
async function upsertPlan(
  flightId: string,
  tenantId: string,
  body: string | null,
  reviewerId: string,
): Promise<APIGatewayProxyResult> {
  const data = parseBody<{
    status?: PlanStatus;
    phases?: Partial<Record<PhaseId, PhaseState>>;
    releasedAt?: string;
    releasedBy?: string;
  }>(body);
  if (!data) return badRequest('invalid JSON body');

  const current = await queryOne<FlightPlanRow>(
    'SELECT * FROM flight_plans WHERE flight_id = $1 AND tenant_id = $2',
    [flightId, tenantId],
  );
  if (!current) return notFound('flight plan');

  if (current.status === 'released') {
    return { statusCode: 409, headers: {}, body: JSON.stringify({ error: 'plan is released and immutable' }) };
  }

  // Build a JSONB merge for each phase column. Only columns present in the
  // incoming `phases` object are touched.
  const phaseSets: string[] = [];
  const params: unknown[] = [flightId, tenantId];
  let i = 3;
  for (const phase of PHASES) {
    if (phase === 'release') continue;
    const next = data.phases?.[phase];
    if (next) {
      phaseSets.push(`${phase} = $${i}::jsonb`);
      params.push(JSON.stringify(next));
      i++;
    }
  }

  let statusSet = '';
  if (data.status) {
    statusSet = `, status = $${i}`;
    params.push(data.status);
    i++;
  }

  let releasedSet = '';
  if (data.status === 'released') {
    // released_by is a UUID FK to users(id). NEVER trust data.releasedBy from
    // the body — historically clients sent the user's email there, which made
    // Postgres throw "invalid input syntax for type uuid". Always use the
    // authorizer's userId (the JWT `sub` claim, which is the user UUID).
    // If the authorizer somehow gave us a non-UUID, fail fast with a clear
    // error rather than letting Postgres surface a cryptic 22P02.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(reviewerId)) {
      return badRequest(`cannot release: authorizer userId is not a UUID (got "${reviewerId}"). The JWT's "sub" claim should be the user's DB UUID.`);
    }
    releasedSet = `, released_at = COALESCE($${i}, NOW()), released_by = $${i + 1}::uuid`;
    params.push(data.releasedAt ?? null, reviewerId);
    i += 2;
  }

  const sql =
    `UPDATE flight_plans
       SET updated_at = NOW()
           ${phaseSets.length ? ',' + phaseSets.join(', ') : ''}
           ${statusSet}
           ${releasedSet}
     WHERE flight_id = $1 AND tenant_id = $2
     RETURNING *`;

  const updated = await queryOne<FlightPlanRow>(sql, params);
  return ok(rowToApi(updated!));
}

// ── GET /planning/flight-plans/{flightId}/reviews ─────────────────────────────
async function listReviews(flightId: string, tenantId: string): Promise<APIGatewayProxyResult> {
  const reviews = await query<ReviewRow>(
    `SELECT r.*
       FROM flight_plan_reviews r
       JOIN flight_plans p ON p.id = r.flight_plan_id
      WHERE p.flight_id = $1 AND p.tenant_id = $2
      ORDER BY r.created_at DESC`,
    [flightId, tenantId],
  );
  return ok(reviews.map((r) => ({
    id: r.id,
    flightId,
    phase: r.phase,
    action: r.action,
    comment: r.comment ?? undefined,
    reviewerId: r.reviewer_id,
    createdAt: r.created_at,
  })));
}

// ── POST /planning/flight-plans/{flightId}/reviews ────────────────────────────
async function appendReview(
  flightId: string,
  tenantId: string,
  body: string | null,
  reviewerId: string,
): Promise<APIGatewayProxyResult> {
  const data = parseBody<{ phase: PhaseId; action: 'approve' | 'reject' | 'release' | 'edit'; comment?: string }>(body);
  if (!data) return badRequest('invalid JSON body');
  if (!PHASES.includes(data.phase)) return badRequest(`invalid phase: ${data.phase}`);
  if (!['approve', 'reject', 'release', 'edit'].includes(data.action)) {
    return badRequest(`invalid action: ${data.action}`);
  }
  if (data.action === 'reject' && !data.comment?.trim()) {
    return badRequest('rejection requires a comment');
  }

  // Schema records 'approve|reject|edit'; treat 'release' as approve on the release phase.
  const dbAction = data.action === 'release' ? 'approve' : data.action;

  const plan = await queryOne<{ id: string }>(
    'SELECT id FROM flight_plans WHERE flight_id = $1 AND tenant_id = $2',
    [flightId, tenantId],
  );
  if (!plan) return notFound('flight plan');

  const inserted = await queryOne<ReviewRow>(
    `INSERT INTO flight_plan_reviews (flight_plan_id, phase, action, comment, reviewer_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [plan.id, data.phase, dbAction, data.comment ?? null, reviewerId],
  );

  return created({
    id: inserted!.id,
    flightId,
    phase: inserted!.phase,
    action: data.action,
    comment: inserted!.comment ?? undefined,
    reviewerId: inserted!.reviewer_id,
    createdAt: inserted!.created_at,
  });
}

// ── GET /planning/rejection-comments?phase=brief&limit=10 ─────────────────────
async function listRejectionComments(
  tenantId: string,
  phase: string | undefined,
  limit: number,
): Promise<APIGatewayProxyResult> {
  if (phase && !PHASES.includes(phase as PhaseId)) {
    return badRequest(`invalid phase: ${phase}`);
  }
  const rows = await query<{ phase: PhaseId; comment: string; created_at: string }>(
    `SELECT r.phase, r.comment, r.created_at
       FROM flight_plan_reviews r
       JOIN flight_plans p ON p.id = r.flight_plan_id
      WHERE p.tenant_id = $1
        AND r.action = 'reject'
        AND r.comment IS NOT NULL
        ${phase ? 'AND r.phase = $2' : ''}
      ORDER BY r.created_at DESC
      LIMIT ${phase ? '$3' : '$2'}`,
    phase ? [tenantId, phase, limit] : [tenantId, limit],
  );
  return ok(rows.map((r) => ({
    phase:     r.phase,
    comment:   (r.comment ?? '').slice(0, 500),
    createdAt: r.created_at,
  })));
}

// ── GET /planning/eod-stats ───────────────────────────────────────────────────
async function eodStats(tenantId: string): Promise<APIGatewayProxyResult> {
  const planCounts = await query<{ status: PlanStatus; n: string }>(
    `SELECT status, COUNT(*) AS n FROM flight_plans WHERE tenant_id = $1 GROUP BY status`,
    [tenantId],
  );

  let released = 0;
  let other = 0;
  for (const r of planCounts) {
    const n = parseInt(r.n, 10);
    if (r.status === 'released') released += n;
    else other += n;
  }

  // In-progress = any plan with at least one non-pending phase. Approximated as
  // "any non-released plan with updated_at > created_at" — close enough and one query.
  const inProg = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM flight_plans
      WHERE tenant_id = $1 AND status != 'released' AND updated_at > created_at + interval '1 second'`,
    [tenantId],
  );
  const inProgress = parseInt(inProg?.n ?? '0', 10);
  const untouched = Math.max(0, other - inProgress);

  const reviewCounts = await query<{ action: string; phase: PhaseId; n: string }>(
    `SELECT r.action, r.phase, COUNT(*) AS n
       FROM flight_plan_reviews r
       JOIN flight_plans p ON p.id = r.flight_plan_id
      WHERE p.tenant_id = $1
      GROUP BY r.action, r.phase`,
    [tenantId],
  );

  const rejByPhase: Record<string, number> = {};
  for (const phase of PHASES) rejByPhase[phase] = 0;
  let totalApprovals = 0;
  let totalRejections = 0;
  for (const r of reviewCounts) {
    const n = parseInt(r.n, 10);
    if (r.action === 'approve') totalApprovals += n;
    if (r.action === 'reject') {
      totalRejections += n;
      rejByPhase[r.phase] = (rejByPhase[r.phase] ?? 0) + n;
    }
  }

  return ok({
    plans: { released, inProgress, untouched },
    activity: { totalApprovals, totalRejections, rejByPhase },
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method = event.httpMethod;
    const path   = event.path;
    const reviewerId: string  = (event.requestContext as any)?.authorizer?.userId ?? '';
    const role:       string  = (event.requestContext as any)?.authorizer?.role ?? 'passenger';
    const tenantSlug: string  = (event.requestContext as any)?.authorizer?.tenantSlug ?? 'aeromock';

    if (!reviewerId) return unauthorized();
    if (role !== 'flight_planner' && role !== 'admin') return forbidden('flight_planner role required');

    const tenantId = await resolveTenantId(tenantSlug);
    if (!tenantId) return badRequest(`Unknown tenant: ${tenantSlug}`);

    const flightId = event.pathParameters?.flightId;

    // Rejection comments — flat collection, no flight in path
    if (method === 'GET' && path.endsWith('/planning/rejection-comments')) {
      const phase = event.queryStringParameters?.phase;
      const limit = Math.min(50, parseInt(event.queryStringParameters?.limit ?? '10', 10) || 10);
      return listRejectionComments(tenantId, phase, limit);
    }

    // EOD stats — tenant-wide aggregation
    if (method === 'GET' && path.endsWith('/planning/eod-stats')) {
      return eodStats(tenantId);
    }

    if (!flightId) return badRequest('flightId path parameter required');

    const isReviewsPath = path.includes('/reviews');

    if (method === 'GET'  && !isReviewsPath) return getOrCreatePlan(flightId, tenantId);
    if (method === 'PUT'  && !isReviewsPath) return upsertPlan(flightId, tenantId, event.body, reviewerId);
    if (method === 'GET'  &&  isReviewsPath) return listReviews(flightId, tenantId);
    if (method === 'POST' &&  isReviewsPath) return appendReview(flightId, tenantId, event.body, reviewerId);

    return { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Route not found' }) };
  } catch (err) {
    return serverError(err);
  }
};
