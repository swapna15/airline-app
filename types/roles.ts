export type UserRole = 'passenger' | 'checkin_agent' | 'gate_manager' | 'coordinator' | 'admin';

export const ROLE_LABELS: Record<UserRole, string> = {
  passenger: 'Passenger',
  checkin_agent: 'Check-in Agent',
  gate_manager: 'Gate Manager',
  coordinator: 'Flight Coordinator',
  admin: 'Airline Admin',
};

/** Derive a role from an email address (demo/mock — replace with DB lookup in prod) */
export function roleFromEmail(email: string): UserRole {
  const prefix = email.split('@')[0].toLowerCase();
  if (prefix === 'admin') return 'admin';
  if (prefix === 'coordinator') return 'coordinator';
  if (prefix === 'gate') return 'gate_manager';
  if (prefix === 'checkin') return 'checkin_agent';
  return 'passenger';
}
