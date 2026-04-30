/**
 * Round-trip persistence properties for lib/planner-store (Req 10).
 *
 * Each test maps to one of the four spec acceptance criteria. The store is
 * `globalThis`-attached (HMR-safe in dev), so we wipe between tests.
 */

import {
  emptyPhases, getPlan, getOrCreatePlan, savePlan, PlannerStoreError,
  type FlightPlan, type PhaseId, type PhaseState, type PhaseStatus,
} from '@/lib/planner-store';

const PHASE_IDS: PhaseId[] = [
  'brief', 'aircraft', 'route', 'fuel', 'weight_balance', 'crew', 'slot_atc', 'release',
];
const PHASE_STATUSES: PhaseStatus[] = ['pending', 'generating', 'ready', 'approved', 'rejected'];

interface GlobalStore {
  __plannerStore?: {
    plans: Map<string, FlightPlan>;
    reviews: unknown[];
  };
}

function reset() {
  const g = globalThis as unknown as GlobalStore;
  if (g.__plannerStore) {
    g.__plannerStore.plans.clear();
    g.__plannerStore.reviews.length = 0;
  }
}

beforeEach(reset);

function makePlan(flightId: string, overrides: Partial<FlightPlan> = {}): FlightPlan {
  const now = new Date('2026-04-30T08:00:00.000Z').toISOString();
  return {
    flightId,
    status: 'draft',
    phases: emptyPhases(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Req 10.1 — round-trip equality across phase status combinations', () => {
  // Generate 25 representative combinations rather than 5^8 = ~390k.
  const seeded = Array.from({ length: 25 }, (_, i) => {
    const phases = {} as Record<PhaseId, PhaseState>;
    for (let j = 0; j < PHASE_IDS.length; j++) {
      const status = PHASE_STATUSES[(i + j) % PHASE_STATUSES.length];
      phases[PHASE_IDS[j]] = { status, summary: `phase ${j} status ${status}`, source: 'test' };
    }
    return phases;
  });

  it.each(seeded.map((p, i) => [i, p]))(
    'combination %s round-trips',
    (_i, phases) => {
      const original = makePlan(`F${_i}`, { phases });
      const saved = savePlan(original);
      const loaded = getPlan(original.flightId);
      expect(loaded).toEqual(saved);
    },
  );
});

describe('Req 10.2 — phases map always contains all 8 canonical keys after a load', () => {
  it('backfills keys missing from a partial save', () => {
    const original = makePlan('F-partial', {
      phases: {
        brief: { status: 'approved' },
        // 7 keys intentionally omitted
      } as unknown as Record<PhaseId, PhaseState>,
    });
    savePlan(original);
    const loaded = getPlan('F-partial')!;
    for (const id of PHASE_IDS) {
      expect(loaded.phases[id]).toBeDefined();
    }
    expect(Object.keys(loaded.phases).sort()).toEqual([...PHASE_IDS].sort());
  });

  it('a freshly-created plan has all 8 keys with status pending', () => {
    const created = getOrCreatePlan('F-fresh');
    for (const id of PHASE_IDS) {
      expect(created.phases[id]?.status).toBe('pending');
    }
  });
});

describe('Req 10.3 — released metadata preserved across reload', () => {
  it('keeps releasedAt + releasedBy intact (no truncation, no type coercion)', () => {
    const releasedAt = '2026-04-30T12:34:56.789Z';
    const releasedBy = 'b566475c-998f-4530-8696-e9c3c41fd7eb';
    const original = makePlan('F-released', {
      status: 'released',
      releasedAt,
      releasedBy,
    });
    savePlan(original);
    const loaded = getPlan('F-released')!;
    expect(loaded.status).toBe('released');
    expect(loaded.releasedAt).toBe(releasedAt);
    expect(loaded.releasedBy).toBe(releasedBy);
    // No type coercion — strict typeof and exact value.
    expect(typeof loaded.releasedAt).toBe('string');
    expect(typeof loaded.releasedBy).toBe('string');
  });
});

describe('Req 10.4 — savePlan rejects malformed flightId', () => {
  it('throws on empty string', () => {
    const bad = makePlan('', { status: 'draft' });
    expect(() => savePlan(bad)).toThrow(PlannerStoreError);
    expect(() => savePlan(bad)).toThrow(/flightId is required/);
  });

  it('throws on non-string flightId', () => {
    const bad = makePlan(undefined as unknown as string);
    expect(() => savePlan(bad)).toThrow(PlannerStoreError);
  });

  it('does not create a record on rejection', () => {
    expect(() => savePlan(makePlan(''))).toThrow();
    // No silent write under the empty-string key
    expect(getPlan('')).toBeUndefined();
  });
});
