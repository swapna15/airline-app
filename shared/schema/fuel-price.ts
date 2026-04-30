/**
 * Canonical FuelPrice schema. Adapters under lib/integrations/fuelprices/
 * normalize their varied source shapes (FMS API, Platts feed, CSV, mock)
 * into this shape, then validate with `fuelPriceSchema.safeParse(...)`
 * before handing records to consumers. Anything that fails to parse is
 * logged and dropped — fail-soft is intentional so a single bad record
 * from an upstream feed can't take the whole planner down.
 */

import { z } from 'zod';

const Iata3 = z.string().regex(/^[A-Z]{3}$/, 'IATA airport code (3 chars)');
const Icao4 = z.string().regex(/^[A-Z]{4}$/, 'ICAO airport code (4 chars)');
const Currency = z.string().length(3); // ISO 4217

export const fuelPriceSchema = z.object({
  /** ICAO preferred; some feeds key by IATA. Either is accepted. */
  icao: z.union([Icao4, Iata3]),
  totalPerUSG: z.number().positive(),
  currency: Currency,
  components: z.object({
    base:         z.number(),
    differential: z.number(),
    intoPlane:    z.number().nonnegative(),
    tax:          z.number().nonnegative(),
  }).optional(),
  totalLocal:  z.number().positive().optional(),
  supplier:    z.string().optional(),
  contractRef: z.string().optional(),
  asOf:        z.string().refine((s) => !isNaN(Date.parse(s)), 'asOf must be ISO 8601'),
  validUntil:  z.string().refine((s) => !isNaN(Date.parse(s)), 'validUntil must be ISO 8601').optional(),
  source: z.enum(['mock', 'csv', 's3_csv', 'api_fms', 'api_supplier', 'api_iata', 'api_platts']),
});

export type FuelPrice = z.infer<typeof fuelPriceSchema>;
