/**
 * Mock Minimum Equipment List (MEL) catalogue + per-tail deferrals.
 *
 * Real airlines source this from the maintenance system (AMOS, TRAX, FlyDocs,
 * Ramco). Production wiring: replace `getDeferredItems(tail)` with a REST call
 * or a nightly CSV/Parquet drop into the planner's tenant bucket.
 *
 * The catalogue below covers the operationally-impactful items planners
 * see most often. Restrictions are encoded structurally so the assessor can
 * mechanically check them against route facts — no string parsing.
 */

export type Restriction =
  | { kind: 'no_known_icing' }
  | { kind: 'no_imc_below_freezing' }
  | { kind: 'no_oceanic' }
  | { kind: 'etops_prohibited' }
  | { kind: 'no_cat_ii_iii' }
  | { kind: 'day_only' }
  | { kind: 'fl_ceiling';      maxFl: number }
  | { kind: 'mtow_reduction';  reductionKg: number }
  | { kind: 'apu_external_start' }
  | { kind: 'no_thunderstorms' }
  | { kind: 'runway_length_pct'; pct: number }
  | { kind: 'crew_workaround'; procedure: string };

export type MelCategory = 'A' | 'B' | 'C' | 'D'; // FAA repair interval categories

export interface MELItem {
  id: string;
  ataChapter: number;
  ataName: string;
  item: string;
  category: MelCategory;
  restrictions: Restriction[];
}

export interface DeferredItem {
  melId: string;
  deferredAt: string;   // ISO date the item was opened
  daysDeferred: number; // calculated against today
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export const CATALOG: MELItem[] = [
  {
    id: 'MEL-21-01', ataChapter: 21, ataName: 'Air Conditioning',
    item: 'Pack 1 inoperative', category: 'C',
    restrictions: [{ kind: 'fl_ceiling', maxFl: 250 }],
  },
  {
    id: 'MEL-22-01', ataChapter: 22, ataName: 'Auto Flight',
    item: 'Autoland (CAT III) inoperative', category: 'C',
    restrictions: [{ kind: 'no_cat_ii_iii' }],
  },
  {
    id: 'MEL-23-01', ataChapter: 23, ataName: 'Communications',
    item: 'HF radio #1 inoperative', category: 'B',
    restrictions: [{ kind: 'no_oceanic' }, { kind: 'etops_prohibited' }],
  },
  {
    id: 'MEL-24-01', ataChapter: 24, ataName: 'Electrical Power',
    item: 'APU inoperative', category: 'A',
    restrictions: [
      { kind: 'apu_external_start' },
      { kind: 'etops_prohibited' },
    ],
  },
  {
    id: 'MEL-26-01', ataChapter: 26, ataName: 'Fire Protection',
    item: 'Cargo fire detection (aft) inoperative', category: 'A',
    restrictions: [{ kind: 'crew_workaround', procedure: 'no cargo loading aft compartment' }],
  },
  {
    id: 'MEL-27-01', ataChapter: 27, ataName: 'Flight Controls',
    item: 'Yaw damper #2 inoperative', category: 'C',
    restrictions: [{ kind: 'fl_ceiling', maxFl: 290 }],
  },
  {
    id: 'MEL-29-01', ataChapter: 29, ataName: 'Hydraulic Power',
    item: 'Hydraulic pump (Green system) #2 inoperative', category: 'B',
    restrictions: [{ kind: 'no_cat_ii_iii' }],
  },
  {
    id: 'MEL-30-01', ataChapter: 30, ataName: 'Ice & Rain Protection',
    item: 'Engine anti-ice (#1) inoperative', category: 'B',
    restrictions: [{ kind: 'no_known_icing' }, { kind: 'no_imc_below_freezing' }],
  },
  {
    id: 'MEL-30-02', ataChapter: 30, ataName: 'Ice & Rain Protection',
    item: 'Wing anti-ice (left) inoperative', category: 'B',
    restrictions: [{ kind: 'no_known_icing' }],
  },
  {
    id: 'MEL-32-01', ataChapter: 32, ataName: 'Landing Gear',
    item: 'Anti-skid inoperative', category: 'C',
    restrictions: [{ kind: 'runway_length_pct', pct: 50 }],
  },
  {
    id: 'MEL-33-01', ataChapter: 33, ataName: 'Lights',
    item: 'Landing light (left) inoperative', category: 'C',
    restrictions: [{ kind: 'day_only' }],
  },
  {
    id: 'MEL-34-01', ataChapter: 34, ataName: 'Navigation',
    item: 'TCAS II inoperative', category: 'A',
    restrictions: [{ kind: 'no_oceanic' }, { kind: 'crew_workaround', procedure: 'avoid high-density terminal areas' }],
  },
  {
    id: 'MEL-34-02', ataChapter: 34, ataName: 'Navigation',
    item: 'Weather radar inoperative', category: 'B',
    restrictions: [{ kind: 'no_thunderstorms' }, { kind: 'crew_workaround', procedure: 'request datalink WX uplink hourly' }],
  },
  {
    id: 'MEL-36-01', ataChapter: 36, ataName: 'Pneumatic',
    item: 'Bleed valve (engine #1) inoperative', category: 'C',
    restrictions: [{ kind: 'fl_ceiling', maxFl: 250 }, { kind: 'mtow_reduction', reductionKg: 4_500 }],
  },
  {
    id: 'MEL-49-01', ataChapter: 49, ataName: 'Auxiliary Power Unit',
    item: 'APU generator inoperative', category: 'B',
    restrictions: [{ kind: 'apu_external_start' }, { kind: 'etops_prohibited' }],
  },
];

const BY_ID = new Map(CATALOG.map((m) => [m.id, m]));
export const getMEL = (id: string): MELItem | undefined => BY_ID.get(id);

// ── Per-tail deferrals ──────────────────────────────────────────────────────
// Mock state — in prod this is a query against the maintenance system.

const TODAY = new Date('2026-04-29');
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86400 * 1000).toISOString().slice(0, 10);

interface RawDeferred { melId: string; deferredAt: string }

const TAIL_DEFERRALS: Record<string, RawDeferred[]> = {
  // 777-300ER with anti-ice issue + landing light
  'G-XLEK': [
    { melId: 'MEL-30-01', deferredAt: daysAgo(3) },
    { melId: 'MEL-33-01', deferredAt: daysAgo(8) },
  ],
  // A330 with HF radio and CAT III deferred — risks transatlantic dispatch
  'N801AA': [
    { melId: 'MEL-23-01', deferredAt: daysAgo(2) },
    { melId: 'MEL-22-01', deferredAt: daysAgo(5) },
  ],
  // A380 with APU INOP — heavy ramp impact
  'D-AIMA': [
    { melId: 'MEL-24-01', deferredAt: daysAgo(1) },
  ],
  // Other A380: clean
  'A6-EUC': [],
};

export function getDeferredItems(tail: string): DeferredItem[] {
  const raw = TAIL_DEFERRALS[tail.toUpperCase()] ?? [];
  const today = TODAY.getTime();
  return raw.map((r) => ({
    melId: r.melId,
    deferredAt: r.deferredAt,
    daysDeferred: Math.floor((today - new Date(r.deferredAt).getTime()) / 86400 / 1000),
  }));
}

// ── Assessor ────────────────────────────────────────────────────────────────

export interface RouteContext {
  oceanic: boolean;
  etopsRequired: boolean;
  knownIcing: boolean;
  thunderstormsForecast: boolean;
  imcBelowFreezing: boolean;
  destCatIIIRequired: boolean;
  arrivalIsNight: boolean;
  destRunwayFt: number;
  requiredRunwayFt: number;
}

export type ConflictSeverity = 'block' | 'warn';

export interface Conflict {
  melId: string;
  item: string;
  reason: string;
  severity: ConflictSeverity;
}

export interface Advisory {
  melId: string;
  item: string;
  note: string;
}

export interface MELAssessment {
  deferred: Array<DeferredItem & { mel: MELItem }>;
  conflicts: Conflict[];
  advisories: Advisory[];
  mtowReductionKg: number;
  flCeiling: number | null;
  dispatchAllowed: boolean;
}

/**
 * Walk every restriction on every deferred item against the route context.
 * - block  → dispatch is illegal under that MEL configuration
 * - warn   → legal but flight-crew procedure adjustment required
 * - advisory → planner should know but no operational restriction triggered
 */
export function assessMEL(deferred: DeferredItem[], ctx: RouteContext): MELAssessment {
  const conflicts: Conflict[]   = [];
  const advisories: Advisory[]  = [];
  let   mtowReductionKg         = 0;
  let   flCeiling: number | null = null;

  const enriched = deferred
    .map((d) => ({ ...d, mel: BY_ID.get(d.melId) }))
    .filter((d): d is DeferredItem & { mel: MELItem } => !!d.mel);

  for (const d of enriched) {
    const { mel } = d;
    for (const r of mel.restrictions) {
      switch (r.kind) {
        case 'no_known_icing':
          if (ctx.knownIcing) {
            conflicts.push({ melId: mel.id, item: mel.item, reason: 'known/forecast icing on route', severity: 'block' });
          }
          break;
        case 'no_imc_below_freezing':
          if (ctx.imcBelowFreezing) {
            conflicts.push({ melId: mel.id, item: mel.item, reason: 'IMC forecast below freezing', severity: 'block' });
          }
          break;
        case 'no_oceanic':
          if (ctx.oceanic) {
            conflicts.push({ melId: mel.id, item: mel.item, reason: 'oceanic routing required', severity: 'block' });
          }
          break;
        case 'etops_prohibited':
          if (ctx.etopsRequired) {
            conflicts.push({ melId: mel.id, item: mel.item, reason: 'ETOPS routing required', severity: 'block' });
          }
          break;
        case 'no_cat_ii_iii':
          if (ctx.destCatIIIRequired) {
            conflicts.push({ melId: mel.id, item: mel.item, reason: 'CAT II/III required at destination', severity: 'block' });
          }
          break;
        case 'day_only':
          if (ctx.arrivalIsNight) {
            conflicts.push({ melId: mel.id, item: mel.item, reason: 'arrival in night IMC, item is day-only', severity: 'block' });
          }
          break;
        case 'no_thunderstorms':
          if (ctx.thunderstormsForecast) {
            conflicts.push({ melId: mel.id, item: mel.item, reason: 'thunderstorms forecast on route', severity: 'warn' });
          }
          break;
        case 'fl_ceiling':
          flCeiling = flCeiling === null ? r.maxFl : Math.min(flCeiling, r.maxFl);
          advisories.push({ melId: mel.id, item: mel.item, note: `cruise ceiling capped at FL${r.maxFl}` });
          break;
        case 'mtow_reduction':
          mtowReductionKg += r.reductionKg;
          advisories.push({ melId: mel.id, item: mel.item, note: `MTOW reduced by ${r.reductionKg.toLocaleString()} kg` });
          break;
        case 'runway_length_pct': {
          const required = ctx.requiredRunwayFt * (1 + r.pct / 100);
          if (ctx.destRunwayFt < required) {
            conflicts.push({
              melId: mel.id, item: mel.item,
              reason: `runway ${ctx.destRunwayFt.toLocaleString()} ft < ${Math.round(required).toLocaleString()} ft (+${r.pct}%) required by MEL`,
              severity: 'block',
            });
          } else {
            advisories.push({ melId: mel.id, item: mel.item, note: `runway margin ok with +${r.pct}% MEL factor` });
          }
          break;
        }
        case 'apu_external_start':
          advisories.push({ melId: mel.id, item: mel.item, note: 'external power required at every station turn' });
          break;
        case 'crew_workaround':
          advisories.push({ melId: mel.id, item: mel.item, note: r.procedure });
          break;
      }
    }
  }

  const dispatchAllowed = conflicts.every((c) => c.severity !== 'block');

  return { deferred: enriched, conflicts, advisories, mtowReductionKg, flCeiling, dispatchAllowed };
}
