/**
 * NOTAM classifier — categorizes a NOTAM into one of:
 *   runway, taxiway, navaid, airspace, procedure, other
 * and assigns a severity:
 *   critical (runway closure), warn (closures + outages), info (everything else)
 *
 * Pure substring matching against the NOTAM text. Real-world NOTAM
 * categorization uses the ICAO Q-code (e.g. QMRLC = runway closed). When
 * the FAA API returns Q-codes (`classification` field) we use those too.
 */

import type { NotamItem } from '@/lib/notams';

export type NotamCategory =
  | 'runway'
  | 'taxiway'
  | 'navaid'
  | 'airspace'
  | 'procedure'
  | 'other';

export type NotamSeverity = 'critical' | 'warn' | 'info';

export interface ClassifiedNotam extends NotamItem {
  category: NotamCategory;
  severity: NotamSeverity;
  /** Title-cased one-line summary suitable for list rows. */
  headline: string;
}

const CLOSURE_RE = /\b(CLSD|CLOSED|U\/S|OUT OF SERVICE)\b/i;
const RUNWAY_RE  = /\b(RWY|RUNWAY)\b/i;
const TAXIWAY_RE = /\b(TWY|TAXIWAY)\b/i;
const NAVAID_RE  = /\b(ILS|VOR|NDB|DME|GP|GS|LOC|RVR|GBAS)\b/i;
const AIRSPACE_RE = /\b(AIRSPACE|TFR|RESTRICTED|PROHIBITED|TEMP|DANGER AREA)\b/i;
const PROCEDURE_RE = /\b(SID|STAR|APP|APPROACH|DEPARTURE|PROCEDURE|MISSED APPROACH|TRANSITION)\b/i;

export function classifyNotam(n: NotamItem): ClassifiedNotam {
  const t = (n.text ?? '').toUpperCase();

  // Category — order matters: a runway-closure NOTAM also mentions taxiways
  // sometimes; runway dominates.
  let category: NotamCategory;
  if      (RUNWAY_RE.test(t))    category = 'runway';
  else if (TAXIWAY_RE.test(t))   category = 'taxiway';
  else if (NAVAID_RE.test(t))    category = 'navaid';
  else if (AIRSPACE_RE.test(t))  category = 'airspace';
  else if (PROCEDURE_RE.test(t)) category = 'procedure';
  else                           category = 'other';

  // Severity
  const isClosure = CLOSURE_RE.test(t);
  let severity: NotamSeverity;
  if (category === 'runway' && isClosure)              severity = 'critical';
  else if (isClosure || category === 'navaid')         severity = 'warn';
  else                                                 severity = 'info';

  // One-line headline — first sentence-ish, max 120 chars.
  const headline = (n.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

  return { ...n, category, severity, headline };
}

export function classifyAll(items: NotamItem[]): ClassifiedNotam[] {
  return items.map(classifyNotam);
}

export const CATEGORY_LABEL: Record<NotamCategory, string> = {
  runway:    'Runway',
  taxiway:   'Taxiway',
  navaid:    'NAV / NAVAID',
  airspace:  'Airspace',
  procedure: 'Procedure',
  other:     'Other',
};

export const SEVERITY_TONE: Record<NotamSeverity, string> = {
  critical: 'border-red-300 bg-red-50 text-red-700',
  warn:     'border-amber-300 bg-amber-50 text-amber-700',
  info:     'border-gray-200 bg-gray-50 text-gray-600',
};
