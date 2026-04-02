/**
 * Thin wrapper around the API Gateway base URL.
 * Falls back to calling local Next.js API routes when NEXT_PUBLIC_API_URL is unset
 * (i.e. during local development without a deployed backend).
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type FetchOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

async function apiFetch<T = unknown>(
  path: string,
  { method = 'GET', body, token }: FetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { error?: string })?.error ?? `API error ${res.status}`);
  }

  return data as T;
}

export const apiClient = {
  // Auth
  register: (payload: { name: string; email: string; password: string }) =>
    apiFetch('/users/register', { method: 'POST', body: payload }),

  login: (payload: { email: string; password: string }) =>
    apiFetch('/users/login', { method: 'POST', body: payload }),

  // Flights
  searchFlights: (params: unknown) =>
    apiFetch('/flights/search', { method: 'POST', body: params }),

  getFlight: (id: string) =>
    apiFetch(`/flights/${id}`),

  getSeatMap: (flightId: string, cabinClass?: string, token?: string) =>
    apiFetch(`/flights/${flightId}/seats${cabinClass ? `?cabin_class=${cabinClass}` : ''}`, { token }),

  // Bookings
  createBooking: (payload: unknown, token: string) =>
    apiFetch('/bookings', { method: 'POST', body: payload, token }),

  listBookings: (userId: string, token: string) =>
    apiFetch(`/bookings?user_id=${userId}`, { token }),

  getBooking: (id: string, token: string) =>
    apiFetch(`/bookings/${id}`, { token }),

  cancelBooking: (id: string, token: string) =>
    apiFetch(`/bookings/${id}`, { method: 'DELETE', token }),

  // Check-in
  lookupPassenger: (params: Record<string, string>, token: string) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/checkin?${qs}`, { token });
  },

  checkIn: (payload: unknown, token: string) =>
    apiFetch('/checkin', { method: 'POST', body: payload, token }),

  getBoardingPass: (checkinId: string, token: string) =>
    apiFetch(`/checkin/${checkinId}/boarding-pass`, { token }),

  getFlightCheckins: (flightId: string, token: string) =>
    apiFetch(`/checkin/flight/${flightId}`, { token }),

  // Gate
  getGateFlights: (params: Record<string, string>, token: string) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/gate/flights?${qs}`, { token });
  },

  getFlightDetail: (flightId: string, token: string) =>
    apiFetch(`/gate/flights/${flightId}`, { token }),

  updateFlightStatus: (flightId: string, payload: unknown, token: string) =>
    apiFetch(`/gate/flights/${flightId}/status`, { method: 'PATCH', body: payload, token }),

  boardPassenger: (flightId: string, payload: unknown, token: string) =>
    apiFetch(`/gate/flights/${flightId}/board`, { method: 'POST', body: payload, token }),

  getManifest: (flightId: string, token: string) =>
    apiFetch(`/gate/flights/${flightId}/manifest`, { token }),

  // Admin
  getStats: (token: string) =>
    apiFetch('/admin/stats', { token }),

  listUsers: (params: Record<string, string>, token: string) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/users?${qs}`, { token });
  },

  updateUserRole: (userId: string, role: string, token: string) =>
    apiFetch(`/admin/users/${userId}/role`, { method: 'PATCH', body: { role }, token }),

  deleteUser: (userId: string, token: string) =>
    apiFetch(`/admin/users/${userId}`, { method: 'DELETE', token }),

  listAdminFlights: (params: Record<string, string>, token: string) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/flights?${qs}`, { token });
  },
};
