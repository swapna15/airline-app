import type { DeferredItem, MelProvider } from './types';
import type { ProviderHealthResult } from '../types';

/**
 * In-repo mock MEL deferrals — hand-crafted to surface every conflict type
 * once across the four demo tails. Same data as the original
 * `lib/mel.ts:TAIL_DEFERRALS`, moved here so `lib/mel.ts` can pick a provider
 * rather than hard-code the table.
 */

const TODAY = new Date('2026-04-29');
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86400 * 1000).toISOString().slice(0, 10);

interface RawDeferred {
  melId: string;
  deferredAt: string;
  description?: string;
  partsOnOrder?: boolean;
  placardInstalled?: boolean;
}

const TAIL_DEFERRALS: Record<string, RawDeferred[]> = {
  'G-XLEK': [
    { melId: 'MEL-30-01', deferredAt: daysAgo(3),
      description: 'Engine #1 anti-ice valve unresponsive — opened during walk-around', placardInstalled: true },
    { melId: 'MEL-33-01', deferredAt: daysAgo(8),
      description: 'Left landing light bulb burnt out — replacement on order', partsOnOrder: true, placardInstalled: true },
  ],
  'N801AA': [
    { melId: 'MEL-23-01', deferredAt: daysAgo(2),
      description: 'HF radio #1 transmitting on emergency frequency only', placardInstalled: true },
    { melId: 'MEL-22-01', deferredAt: daysAgo(5),
      description: 'CAT III autoland self-test failure during certification check' },
  ],
  'D-AIMA': [
    { melId: 'MEL-24-01', deferredAt: daysAgo(1),
      description: 'APU INOP — overhaul scheduled at next C-check', partsOnOrder: false, placardInstalled: true },
  ],
  'A6-EUC': [],
};

function row(tail: string, raw: RawDeferred): DeferredItem {
  const deferredMs = new Date(raw.deferredAt).getTime();
  const daysDeferred = Math.floor((TODAY.getTime() - deferredMs) / 86400 / 1000);
  return {
    tail,
    melId: raw.melId,
    deferredAt: raw.deferredAt,
    daysDeferred,
    description: raw.description,
    partsOnOrder: raw.partsOnOrder,
    placardInstalled: raw.placardInstalled,
    source: 'mock',
  };
}

export class MockMelProvider implements MelProvider {
  readonly name = 'mock';

  async getDeferredItems(tail: string): Promise<DeferredItem[]> {
    const raws = TAIL_DEFERRALS[tail.toUpperCase()] ?? [];
    return raws.map((r) => row(tail.toUpperCase(), r));
  }

  async listAllDeferrals(): Promise<DeferredItem[]> {
    const out: DeferredItem[] = [];
    for (const [tail, raws] of Object.entries(TAIL_DEFERRALS)) {
      for (const r of raws) out.push(row(tail, r));
    }
    return out;
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    let n = 0;
    for (const r of Object.values(TAIL_DEFERRALS)) n += r.length;
    return { ok: true, recordCount: n, checkedAt: new Date().toISOString() };
  }
}
