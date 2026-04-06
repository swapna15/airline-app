import { NextRequest, NextResponse } from 'next/server';
import { Duffel } from '@duffel/api';
import { AIRPORTS } from '@/utils/mockData';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  // Duffel suggestions require a non-empty query string
  if (q.length >= 2 && process.env.DUFFEL_ACCESS_TOKEN) {
    try {
      const duffel = new Duffel({ token: process.env.DUFFEL_ACCESS_TOKEN });
      const { data } = await duffel.suggestions.list({ name: q });
      const airports = (data ?? [])
        .filter((p) => p.type === 'airport' && p.iata_code)
        .slice(0, 8)
        .map((p) => ({
          code: p.iata_code,
          name: p.name,
          city: p.city_name ?? p.iata_city_code ?? p.iata_code,
          country: p.country_name ?? p.iata_country_code,
        }));
      if (airports.length > 0) return NextResponse.json(airports);
    } catch {
      // Fall through to static list if Duffel is unavailable
    }
  }

  // Static list: return all when query is empty, filter when typing
  const ql = q.toLowerCase();
  const results = q.length === 0
    ? AIRPORTS
    : AIRPORTS.filter(
        (a) =>
          a.code.toLowerCase().includes(ql) ||
          a.city.toLowerCase().includes(ql) ||
          a.name.toLowerCase().includes(ql),
      );
  return NextResponse.json(results.slice(0, 20));
}
