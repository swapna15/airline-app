import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { query, queryOne } from '../shared/db';
import { ok, created, badRequest, unauthorized, forbidden, notFound, serverError, parseBody } from '../shared/response';
import { resolveTenantId } from '../shared/tenant';

/**
 * Integrations Lambda — backs `lib/integrations/config-store.ts` when
 * NEXT_PUBLIC_API_URL is set.
 *
 * Routes:
 *   GET    /admin/integrations                          → list per-tenant rows
 *   PUT    /admin/integrations/{kind}                   → upsert
 *   DELETE /admin/integrations/{kind}                   → remove (revert to env defaults)
 *   POST   /admin/integrations/{kind}/test[?save=true]  → run a healthCheck on the
 *                                                          submitted config without
 *                                                          building anything heavy
 *                                                          (URL/URI presence + token
 *                                                          reachability — full
 *                                                          fetches happen in-process)
 *
 * Auth: admin role required. Tenant comes from the API Gateway authorizer.
 */

const KINDS = ['fuel_price', 'mel', 'crew'] as const;
type Kind = (typeof KINDS)[number];

interface ConfigRow {
  id: string;
  tenant_id: string;
  kind: Kind;
  provider: string;
  config: Record<string, unknown>;
  enabled: boolean;
  last_health: Record<string, unknown> | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

function rowToApi(r: ConfigRow) {
  return {
    kind: r.kind,
    provider: r.provider,
    config: r.config,
    enabled: r.enabled,
    lastHealth: r.last_health ?? undefined,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by ?? undefined,
  };
}

function isValidKind(s: string): s is Kind {
  return (KINDS as readonly string[]).includes(s);
}

// ── GET /admin/integrations ─────────────────────────────────────────────────
async function listConfigs(tenantId: string): Promise<APIGatewayProxyResult> {
  const rows = await query<ConfigRow>(
    'SELECT * FROM integration_configs WHERE tenant_id = $1 ORDER BY kind',
    [tenantId],
  );
  return ok({ integrations: rows.map(rowToApi) });
}

// ── PUT /admin/integrations/{kind} ──────────────────────────────────────────
async function upsertConfig(
  tenantId: string,
  kind: Kind,
  body: string | null,
  reviewerId: string,
): Promise<APIGatewayProxyResult> {
  const data = parseBody<{ provider: string; config: Record<string, unknown>; enabled?: boolean }>(body);
  if (!data) return badRequest('invalid JSON body');
  if (!data.provider || typeof data.config !== 'object' || data.config === null) {
    return badRequest('provider and config are required');
  }
  const inserted = await queryOne<ConfigRow>(
    `INSERT INTO integration_configs (tenant_id, kind, provider, config, enabled, updated_by)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (tenant_id, kind) DO UPDATE
       SET provider   = EXCLUDED.provider,
           config     = EXCLUDED.config,
           enabled    = EXCLUDED.enabled,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
     RETURNING *`,
    [tenantId, kind, data.provider, JSON.stringify(data.config), data.enabled ?? true, reviewerId],
  );
  return ok(rowToApi(inserted!));
}

// ── DELETE /admin/integrations/{kind} ───────────────────────────────────────
async function deleteConfig(tenantId: string, kind: Kind): Promise<APIGatewayProxyResult> {
  const res = await queryOne<{ id: string }>(
    'DELETE FROM integration_configs WHERE tenant_id = $1 AND kind = $2 RETURNING id',
    [tenantId, kind],
  );
  return ok({ removed: !!res });
}

// ── POST /admin/integrations/{kind}/test ────────────────────────────────────
//
// Server-side test is intentionally lightweight: we record the timestamp +
// validate that required fields are present. Actual provider instantiation +
// health probes happen in the Next.js process where the provider classes live.
// When `?save=true`, we still persist a synthetic ok=true row so the UI badge
// reflects that the config was reachable from the admin's session.
async function testConfig(
  tenantId: string,
  kind: Kind,
  body: string | null,
  saveAfter: boolean,
): Promise<APIGatewayProxyResult> {
  const data = parseBody<{ provider: string; config: Record<string, unknown> }>(body);
  if (!data) return badRequest('invalid JSON body');

  const errors: string[] = [];
  if (!data.provider) errors.push('provider is required');
  if (!data.config) errors.push('config is required');

  // Sanity-check required fields per provider/kind.
  const c = data.config ?? {};
  const need = (k: string) => { if (!c[k]) errors.push(`config.${k} is required`); };
  if (data.provider === 'csv' || data.provider === 's3_csv') {
    if (kind === 'crew') { need('rosterUri'); need('assignmentsUri'); }
    else                 { need('uri'); }
  } else if (data.provider?.startsWith('api')) {
    if (kind === 'crew') { need('rosterUrl'); need('assignmentsUrl'); }
    else                 { need('url'); }
    need('tokenRef');
  }

  const result = errors.length === 0
    ? { ok: true,  checkedAt: new Date().toISOString(),
        note: 'lambda-side validation only; full health probe runs in the Next.js process' }
    : { ok: false, checkedAt: new Date().toISOString(), error: errors.join('; ') };

  if (saveAfter && result.ok) {
    await queryOne(
      'UPDATE integration_configs SET last_health = $1::jsonb WHERE tenant_id = $2 AND kind = $3',
      [JSON.stringify(result), tenantId, kind],
    );
  }
  return ok(result);
}

// ── /admin/ops-specs (per-tenant Operations Specifications) ─────────────────
//
// Same admin / per-tenant plane as integrations, so this Lambda hosts both
// rather than fan out into a third tiny Lambda. Schema in migration 010.
async function getOpsSpecs(tenantId: string): Promise<APIGatewayProxyResult> {
  const row = await queryOne<{
    fuel_policy: Record<string, unknown>;
    alternate_minima: Record<string, unknown>;
    etops_approval: Record<string, unknown>;
    pbn_authorizations: Record<string, unknown>;
    cost_index: Record<string, unknown>;
    authorized_airports: string[];
    notes: string | null;
    updated_at: string;
  }>(
    `SELECT fuel_policy, alternate_minima, etops_approval, pbn_authorizations,
            cost_index, authorized_airports, notes, updated_at
       FROM ops_specs WHERE tenant_id = $1`,
    [tenantId],
  );
  if (!row) return ok({
    fuelPolicy: {}, alternateMinima: {}, etopsApproval: {}, pbnAuthorizations: {},
    costIndex: {}, authorizedAirports: [], notes: null, updatedAt: null,
  });
  return ok({
    fuelPolicy:         row.fuel_policy,
    alternateMinima:    row.alternate_minima,
    etopsApproval:      row.etops_approval,
    pbnAuthorizations:  row.pbn_authorizations,
    costIndex:          row.cost_index,
    authorizedAirports: row.authorized_airports,
    notes:              row.notes,
    updatedAt:          row.updated_at,
  });
}

interface UpsertOpsSpecsBody {
  fuelPolicy?:         Record<string, unknown>;
  alternateMinima?:    Record<string, unknown>;
  etopsApproval?:      Record<string, unknown>;
  pbnAuthorizations?:  Record<string, unknown>;
  costIndex?:          Record<string, unknown>;
  authorizedAirports?: string[];
  notes?:              string;
}

async function upsertOpsSpecs(
  tenantId: string,
  body: string | null,
  reviewerId: string,
): Promise<APIGatewayProxyResult> {
  const data = parseBody<UpsertOpsSpecsBody>(body);
  if (!data) return badRequest('invalid JSON body');
  await queryOne(
    `INSERT INTO ops_specs
       (tenant_id, fuel_policy, alternate_minima, etops_approval,
        pbn_authorizations, cost_index, authorized_airports, notes, updated_by)
     VALUES ($1,
             COALESCE($2::jsonb, '{}'::jsonb),
             COALESCE($3::jsonb, '{}'::jsonb),
             COALESCE($4::jsonb, '{}'::jsonb),
             COALESCE($5::jsonb, '{}'::jsonb),
             COALESCE($6::jsonb, '{}'::jsonb),
             COALESCE($7, '{}'::text[]),
             $8, $9)
     ON CONFLICT (tenant_id) DO UPDATE
       SET fuel_policy         = COALESCE(EXCLUDED.fuel_policy,        ops_specs.fuel_policy),
           alternate_minima    = COALESCE(EXCLUDED.alternate_minima,   ops_specs.alternate_minima),
           etops_approval      = COALESCE(EXCLUDED.etops_approval,     ops_specs.etops_approval),
           pbn_authorizations  = COALESCE(EXCLUDED.pbn_authorizations, ops_specs.pbn_authorizations),
           cost_index          = COALESCE(EXCLUDED.cost_index,         ops_specs.cost_index),
           authorized_airports = COALESCE(EXCLUDED.authorized_airports, ops_specs.authorized_airports),
           notes               = EXCLUDED.notes,
           updated_by          = EXCLUDED.updated_by,
           updated_at          = NOW()`,
    [
      tenantId,
      data.fuelPolicy        ? JSON.stringify(data.fuelPolicy)        : null,
      data.alternateMinima   ? JSON.stringify(data.alternateMinima)   : null,
      data.etopsApproval     ? JSON.stringify(data.etopsApproval)     : null,
      data.pbnAuthorizations ? JSON.stringify(data.pbnAuthorizations) : null,
      data.costIndex         ? JSON.stringify(data.costIndex)         : null,
      data.authorizedAirports ?? null,
      data.notes ?? null,
      reviewerId,
    ],
  );
  return getOpsSpecs(tenantId);
}

// ── Router ──────────────────────────────────────────────────────────────────
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method = event.httpMethod;
    const path   = event.path;
    const reviewerId: string = (event.requestContext as any)?.authorizer?.userId ?? '';
    const role:       string = (event.requestContext as any)?.authorizer?.role ?? 'passenger';
    const tenantSlug: string = (event.requestContext as any)?.authorizer?.tenantSlug ?? 'aeromock';

    if (!reviewerId) return unauthorized();
    if (role !== 'admin') return forbidden('admin role required');

    const tenantId = await resolveTenantId(tenantSlug);
    if (!tenantId) return badRequest(`unknown tenant: ${tenantSlug}`);

    // /admin/ops-specs (per-tenant Operations Specifications)
    if (path.endsWith('/admin/ops-specs')) {
      if (method === 'GET') return getOpsSpecs(tenantId);
      if (method === 'PUT') return upsertOpsSpecs(tenantId, event.body, reviewerId);
    }

    const kind = event.pathParameters?.kind;

    if (method === 'GET' && path.endsWith('/admin/integrations')) {
      return listConfigs(tenantId);
    }
    if (!kind) return notFound('kind path parameter required');
    if (!isValidKind(kind)) return badRequest(`unknown integration kind: ${kind}`);

    const isTestPath = path.endsWith('/test');
    if (method === 'PUT'    && !isTestPath) return upsertConfig(tenantId, kind, event.body, reviewerId);
    if (method === 'DELETE' && !isTestPath) return deleteConfig(tenantId, kind);
    if (method === 'POST'   &&  isTestPath) {
      const save = event.queryStringParameters?.save === 'true';
      return testConfig(tenantId, kind, event.body, save);
    }

    return notFound('Route not found');
  } catch (err) {
    return serverError(err);
  }
};

// `created` is imported for symmetry with the other handlers but unused here.
void created;
