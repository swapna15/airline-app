/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/flights/route';
import { AIRPORTS } from '@/utils/mockData';

const JFK = AIRPORTS.find((a) => a.code === 'JFK')!;
const LHR = AIRPORTS.find((a) => a.code === 'LHR')!;

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/flights', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/flights', () => {
  jest.setTimeout(10000);

  it('returns 400 when origin is missing', async () => {
    const req = makeRequest({ destination: LHR, departureDate: '2026-06-01' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/required/);
  });

  it('returns 400 when destination is missing', async () => {
    const req = makeRequest({ origin: JFK, departureDate: '2026-06-01' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when departureDate is missing', async () => {
    const req = makeRequest({ origin: JFK, destination: LHR });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with flights array for valid params', async () => {
    const req = makeRequest({
      origin: JFK,
      destination: LHR,
      departureDate: '2026-06-01',
      passengers: { adults: 1, children: 0, infants: 0 },
      class: 'economy',
      tripType: 'oneWay',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const { flights } = await res.json();
    expect(Array.isArray(flights)).toBe(true);
    expect(flights.length).toBeGreaterThan(0);
  });

  it('returned flights have the correct origin and destination', async () => {
    const req = makeRequest({
      origin: JFK,
      destination: LHR,
      departureDate: '2026-06-01',
      passengers: { adults: 2, children: 1, infants: 0 },
      class: 'business',
      tripType: 'roundTrip',
      returnDate: '2026-06-15',
    });
    const res = await POST(req);
    const { flights } = await res.json();
    flights.forEach((f: any) => {
      expect(f.segments[0].departure.airport.code).toBe('JFK');
      expect(f.segments[0].arrival.airport.code).toBe('LHR');
    });
  });

  it('returned flights include prices for all cabin classes', async () => {
    const req = makeRequest({ origin: JFK, destination: LHR, departureDate: '2026-06-01' });
    const res = await POST(req);
    const { flights } = await res.json();
    flights.forEach((f: any) => {
      expect(f.prices.economy).toBeGreaterThan(0);
      expect(f.prices.business).toBeGreaterThan(0);
      expect(f.prices.first).toBeGreaterThan(0);
    });
  });
});
