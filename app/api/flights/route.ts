import { NextRequest, NextResponse } from 'next/server';
import { MockAdapter } from '@/core/adapters/mock';
import type { SearchParams } from '@/types/flight';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const adapter = new MockAdapter();

export async function POST(req: NextRequest) {
  const params = await req.json() as SearchParams;

  if (!params.origin || !params.destination || !params.departureDate) {
    return NextResponse.json(
      { error: 'origin, destination, and departureDate are required' },
      { status: 400 },
    );
  }

  // Forward to Lambda backend when deployed
  if (API_URL) {
    const res = await fetch(`${API_URL}/flights/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: params.origin,
        destination: params.destination,
        date: params.departureDate,
        return_date: params.returnDate,
        adults: params.passengers?.adults,
        children: params.passengers?.children,
        infants: params.passengers?.infants,
        cabin_class: params.class,
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json({ flights: data.outbound, returnFlights: data.inbound });
  }

  // Local mock fallback
  const flights = await adapter.searchFlights(params);
  return NextResponse.json({ flights });
}
