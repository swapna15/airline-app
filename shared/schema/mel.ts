/**
 * Canonical DeferredItem schema. Mirrors lib/integrations/mel/types.ts but
 * is the validation source of truth — adapters under
 * lib/integrations/mel/ feed mapped records through `deferredItemSchema.
 * safeParse(...)` so anything malformed gets logged and dropped instead of
 * leaking into the MEL assessor.
 */

import { z } from 'zod';

const Iso8601 = z.string().refine((s) => !isNaN(Date.parse(s)), 'must be ISO 8601');

export const deferredItemSchema = z.object({
  tail:        z.string().min(1),
  melId:       z.string().min(1),
  deferredAt:  Iso8601,
  daysDeferred: z.number().int().nonnegative(),

  description:           z.string().optional(),
  dueAt:                 Iso8601.optional(),
  airframeHoursAtOpen:   z.number().nonnegative().optional(),
  airframeCyclesAtOpen:  z.number().int().nonnegative().optional(),
  partsOnOrder:          z.boolean().optional(),
  placardInstalled:      z.boolean().optional(),
  releasedBy:            z.string().optional(),
  source: z.enum(['mock', 'csv', 's3_csv', 'api_amos', 'api_trax', 'api_camo']).optional(),
});

export type DeferredItem = z.infer<typeof deferredItemSchema>;
