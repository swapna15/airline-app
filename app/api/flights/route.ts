import { NextRequest, NextResponse } from 'next/server';
import { MockAdapter } from '@/core/adapters/mock';
import { DuffelAdapter } from '@/core/adapters/duffel';
import type { Flight, SearchParams } from '@/types/flight';

export const maxDuration = 30; // seconds — matches API Gateway max timeout

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const mockAdapter = new MockAdapter();
const duffelAdapter = process.env.DUFFEL_ACCESS_TOKEN ? new DuffelAdapter() : null;

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
      carryIncluded: true,
      checked: (row.baggage_checked as string) ?? '1 x 23kg',
      checkedIncluded: !!(row.baggage_checked as string),
      checkedFee: (row.baggage_checked as string) ? undefined : 35,
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

  // 1. Duffel — real-time search; falls through on any error
  if (duffelAdapter) {
    try {
      const flights = await duffelAdapter.searchFlights(params);
      if (flights.length > 0) return NextResponse.json({ flights });
    } catch {
      // fall through to Lambda or mock
    }
  }

  // 2. Lambda backend
  if (API_URL) {
    try {
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
      if (res.ok) {
        const flights = ((data.outbound ?? []) as Record<string, unknown>[]).map(toFlight);
        const returnFlights = data.inbound
          ? (data.inbound as Record<string, unknown>[]).map(toFlight)
          : undefined;
        if (flights.length > 0) return NextResponse.json({ flights, returnFlights });
      }
    } catch {
      // fall through to mock
    }
  }

  // 3. Mock — always works, used when Duffel and Lambda both fail or return empty
  const flights = await mockAdapter.searchFlights(params);
  return NextResponse.json({ flights });
}
