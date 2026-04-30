/**
 * In-memory dev persistence for flight plans + review events.
 * Mirrors the columns of `flight_plans` + `flight_plan_reviews` (migration 004).
 *
 * Lifecycle:
 *  - Process-scoped Map, survives Next.js HMR (attached to globalThis).
 *  - Restart-clean — same convention as MockAdapter elsewhere in the project.
 *  - When the planner Lambda lands, swap this module's exports for fetch calls
 *    behind `process.env.NEXT_PUBLIC_API_URL`, no API-route changes needed.
 */

export type PhaseId =
  | 'brief'
  | 'aircraft'
  | 'route'
  | 'fuel'
  | 'weight_balance'
  | 'crew'
  | 'slot_atc'
  | 'release';

export type PhaseStatus = 'pending' | 'generating' | 'ready' | 'approved' | 'rejected';

export interface PhaseState {
  status: PhaseStatus;
  summary?: string;
  source?: string;
  data?: unknown;
  comment?: string;
  generatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
}

export type PlanStatus = 'draft' | 'in_review' | 'released' | 'flown' | 'cancelled';

export interface FlightPlan {
  flightId: string;
  status: PlanStatus;
  phases: Record<PhaseId, PhaseState>;
  releasedAt?: string;
  releasedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewEvent {
  id: string;
  flightId: string;
  phase: PhaseId;
  action: 'approve' | 'reject' | 'release';
  comment?: string;
  reviewerId: string;
  createdAt: string;
}

const PHASES: PhaseId[] = ['brief', 'aircraft', 'route', 'fuel', 'weight_balance', 'crew', 'slot_atc', 'release'];

export function emptyPhases(): Record<PhaseId, PhaseState> {
  return PHASES.reduce(
    (acc, p) => ({ ...acc, [p]: { status: 'pending' as PhaseStatus } }),
    {} as Record<PhaseId, PhaseState>,
  );
}

interface Store {
  plans: Map<string, FlightPlan>;
  reviews: ReviewEvent[];
}

// HMR-safe global. Module is re-evaluated on edit in dev; attaching to globalThis
// preserves state across reloads so the planner doesn't lose progress mid-session.
const STORE: Store = ((globalThis as unknown) as { __plannerStore?: Store }).__plannerStore
  ?? { plans: new Map(), reviews: [] };
((globalThis as unknown) as { __plannerStore?: Store }).__plannerStore = STORE;

/**
 * Backfill any missing phase keys with the default `pending` shape so the
 * loaded plan always satisfies Req 10.2 — the phases map always contains
 * exactly the 8 canonical keys, regardless of what was originally saved.
 */
function normalizePhases(input: Partial<Record<PhaseId, PhaseState>> | undefined): Record<PhaseId, PhaseState> {
  return { ...emptyPhases(), ...(input ?? {}) };
}

export function getPlan(flightId: string): FlightPlan | undefined {
  const p = STORE.plans.get(flightId);
  if (!p) return undefined;
  // Defense in depth — even if a previous save bypassed savePlan() (older
  // code path, direct STORE manipulation in tests), normalize on read.
  return { ...p, phases: normalizePhases(p.phases) };
}

export function getOrCreatePlan(flightId: string): FlightPlan {
  let plan = STORE.plans.get(flightId);
  if (!plan) {
    const now = new Date().toISOString();
    plan = {
      flightId,
      status: 'draft',
      phases: emptyPhases(),
      createdAt: now,
      updatedAt: now,
    };
    STORE.plans.set(flightId, plan);
  }
  return { ...plan, phases: normalizePhases(plan.phases) };
}

export class PlannerStoreError extends Error {}

export function savePlan(plan: FlightPlan): FlightPlan {
  // Req 10.4 — reject malformed records at the boundary instead of silently
  // creating a corrupt row. flightId is the primary key in every backend
  // we'll plug in; an empty string is never valid.
  if (!plan.flightId || typeof plan.flightId !== 'string') {
    throw new PlannerStoreError('savePlan: flightId is required and must be a non-empty string');
  }
  const next: FlightPlan = {
    ...plan,
    phases: normalizePhases(plan.phases),
    updatedAt: new Date().toISOString(),
  };
  STORE.plans.set(plan.flightId, next);
  return next;
}

export function isReleased(flightId: string): boolean {
  return STORE.plans.get(flightId)?.status === 'released';
}

export function appendReview(ev: Omit<ReviewEvent, 'id' | 'createdAt'>): ReviewEvent {
  const full: ReviewEvent = {
    ...ev,
    id: `rv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  STORE.reviews.push(full);
  return full;
}

export function listReviews(flightId: string): ReviewEvent[] {
  return STORE.reviews.filter((r) => r.flightId === flightId);
}

/**
 * Cross-flight rejection comments, newest-first. Phase D feedback retrieval
 * reads this and feeds the agent. Each comment is capped at 500 chars as a
 * cheap prompt-injection defence — planners are privileged but typing
 * "ignore previous instructions" into the comment field shouldn't matter.
 */
export function listRejectionComments(
  phase?: PhaseId,
  limit = 10,
): Array<{ phase: PhaseId; comment: string; createdAt: string }> {
  const all = STORE.reviews
    .filter((r) => r.action === 'reject' && r.comment)
    .filter((r) => !phase || r.phase === phase)
    .map((r) => ({
      phase: r.phase,
      comment: r.comment!.slice(0, 500),
      createdAt: r.createdAt,
    }));
  // Newest first
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return all.slice(0, limit);
}
