import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';
import { flightSchema, type OwnFlight } from '@shared/schema/flight';
import { z } from 'zod';
import { todayAt } from '@/lib/flight-display';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const responseSchema = z.object({ flights: z.array(flightSchema) });

// Fallback used in local dev (no NEXT_PUBLIC_API_URL) so the planner still
// has data to render. Same shape as the deployed Lambda would return.
const LOCAL_FALLBACK: OwnFlight[] = [
  { source: 'own', externalId: 'demo-1', carrier: 'BA', flightNumber: '1000', origin: 'JFK', destination: 'LHR', scheduledDeparture: todayAt('09:45'), scheduledArrival: todayAt('21:45'), aircraftIcao: 'B77W', aircraftType: 'Boeing 777-300ER', tail: 'G-XLEK', paxLoad: 287 },
  { source: 'own', externalId: 'demo-2', carrier: 'AA', flightNumber: '2111', origin: 'JFK', destination: 'CDG', scheduledDeparture: todayAt('11:15'), scheduledArrival: todayAt('23:30'), aircraftIcao: 'A333', aircraftType: 'Airbus A330-300',  paxLoad: 244 },
];

export async function GET(req: NextRequest) {
  if (API_URL) {
    const token = await getApiBearer(req);
    if (!token) return NextResponse.json({ flights: LOCAL_FALLBACK }, { status: 200 });
    try {
      const res = await fetch(`${API_URL}/flights/own-today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const raw = await res.json();
        const parsed = responseSchema.safeParse(raw);
        if (parsed.success) return NextResponse.json(parsed.data);
        // Schema mismatch — surface so we know the Lambda drift, but don't crash UI.
        return NextResponse.json({
          flights: [],
          warning: 'lambda response did not match canonical schema',
          detail: parsed.error.flatten(),
        });
      }
    } catch {
      // network error — fall through to fallback
    }
  }
  return NextResponse.json({ flights: LOCAL_FALLBACK });
}
