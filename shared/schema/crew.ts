/**
 * Canonical Crew schemas. Adapters under lib/integrations/crew/ feed mapped
 * roster + assignment records through these `safeParse(...)` so malformed
 * rows from external systems (Sabre, Jeppesen, AIMS) get logged and
 * dropped instead of leaking into the fatigue calculator and FDP checks.
 */

import { z } from 'zod';

const Iso8601 = z.string().refine((s) => !isNaN(Date.parse(s)), 'must be ISO 8601');

export const crewMemberSchema = z.object({
  id:                  z.string().min(1),
  name:                z.string().min(1),
  role:                z.enum(['CAP', 'FO']),
  base:                z.string().min(1),
  typeRatings:         z.array(z.string()),
  priorFdpMin:         z.number().int().nonnegative(),
  priorFlightTimeMin:  z.number().int().nonnegative(),
  restMinSinceLastDuty: z.number().int().nonnegative(),

  licenseNumber:       z.string().optional(),
  medicalExpiresAt:    Iso8601.optional(),
  lineCheckExpiresAt:  Iso8601.optional(),
  status:              z.enum(['active', 'sick', 'reserve', 'leave']).optional(),
  source:              z.enum(['mock', 'csv', 's3_csv', 'api_sabre', 'api_jeppesen', 'api_aims']).optional(),
});

export const crewAssignmentSchema = z.object({
  crewId: z.string().min(1),
  flight: z.string().min(1),
});

export type CrewMember     = z.infer<typeof crewMemberSchema>;
export type CrewAssignment = z.infer<typeof crewAssignmentSchema>;
