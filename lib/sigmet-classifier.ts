/**
 * Hazard classification + color coding for SIGMETs (Req 7).
 *
 * AviationWeather's isigmet feed reports `hazard` as a short code (TURB,
 * ICE, VA, MTN, TS, IFR, …). We map those into a small color palette so the
 * map overlay is interpretable at a glance:
 *
 *   red    — turbulence (TURB)
 *   orange — icing (ICE)
 *   purple — volcanic ash (VA)
 *   grey   — everything else
 */

import type { SigmetReport } from '@/lib/aviationweather';

export type HazardCategory = 'turbulence' | 'icing' | 'volcanic-ash' | 'other';

export interface ClassifiedSigmet extends SigmetReport {
  category: HazardCategory;
  /** Hex color for fill / stroke. */
  color: string;
}

const COLORS: Record<HazardCategory, string> = {
  turbulence:    '#dc2626', // red-600
  icing:         '#ea580c', // orange-600
  'volcanic-ash':'#9333ea', // purple-600
  other:         '#6b7280', // gray-500
};

export function categorize(hazard: string | undefined): HazardCategory {
  const h = (hazard ?? '').toUpperCase();
  if (h.includes('TURB'))                         return 'turbulence';
  if (h.includes('ICE') || h.includes('ICING'))   return 'icing';
  if (h.includes('VA') || h.includes('VOLCAN'))   return 'volcanic-ash';
  return 'other';
}

export function classifySigmet(s: SigmetReport): ClassifiedSigmet {
  const category = categorize(s.hazard);
  return { ...s, category, color: COLORS[category] };
}

export function classifyAll(sigmets: SigmetReport[]): ClassifiedSigmet[] {
  return sigmets.map(classifySigmet);
}

export const CATEGORY_LABEL: Record<HazardCategory, string> = {
  turbulence:    'Turbulence',
  icing:         'Icing',
  'volcanic-ash':'Volcanic ash',
  other:         'Other',
};

export const CATEGORY_COLOR = COLORS;
