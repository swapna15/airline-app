import { NextRequest, NextResponse } from 'next/server';
import { MockAdapter } from '@/core/adapters/mock';
import type { Flight, SearchParams } from '@/types/flight';

export const maxDuration = 30; // seconds — matches API Gateway max timeout

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const adapter = new MockAdapter();

function toFlight(row: Record<string, unknown>): Flight {
  const mins = parseInt(row.duration_minutes as string) || 0;
  const durationStr = `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return {
    id: row.id as string,
    segments: [{
      id: row.id as string,
      airline: {
        code: row.airline_code as string,
        name: row.airline_name as string,
        logo: row.airline_logo as string,
      },
      flightNumber: row.flight_number as string,
      departure: {
        airport: {
          code: row.origin_code as string,
          name: row.origin_name as string,
          city: row.origin_city as string,
          country: '',
        },
        time: row.departure_time as string,
        terminal: row.terminal as string | undefined,
        gate: row.gate as string | undefined,
      },
      arrival: {
        airport: {
          code: row.destination_code as string,
          name: row.destination_name as string,
          city: row.destination_city as string,
          country: '',
        },
        time: row.arrival_time as string,
      },
      duration: durationStr,
      aircraft: (row.aircraft as string) ?? '',
    }],
    totalDuration: durationStr,
    stops: 0,
    prices: {
      economy: parseFloat(row.price_economy as string),
      business: parseFloat(row.price_business as string),
      first: parseFloat(row.price_first as string),
    },
    availability: {
      economy: parseInt((row.avail_economy as string) ?? '0'),
      business: parseInt((row.avail_business as string) ?? '0'),
      first: parseInt((row.avail_first as string) ?? '0'),
    },
    baggage: {
      carry: (row.baggage_carry as string) ?? '1 x 7kg',
      checked: (row.baggage_checked as string) ?? '1 x 23kg',
    },
    amenities: [],
  };
}

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
        origin: params.origin?.code,
        destination: params.destination?.code,
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
    const flights = (data.outbound as Record<string, unknown>[]).map(toFlight);
    const returnFlights = data.inbound
      ? (data.inbound as Record<string, unknown>[]).map(toFlight)
      : undefined;
    return NextResponse.json({ flights, returnFlights });
  }

  // Local mock fallback
  const flights = await adapter.searchFlights(params);
  return NextResponse.json({ flights });
}
