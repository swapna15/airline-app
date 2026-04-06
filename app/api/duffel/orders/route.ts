import { NextResponse } from 'next/server';
import { Duffel } from '@duffel/api';

export async function GET() {
  if (!process.env.DUFFEL_ACCESS_TOKEN) {
    return NextResponse.json({ orders: [] });
  }

  try {
    const duffel = new Duffel({ token: process.env.DUFFEL_ACCESS_TOKEN });
    const { data } = await duffel.orders.list({ limit: 50 });

    const orders = (data ?? []).map((o) => {
      const slice = o.slices?.[0];
      const seg = slice?.segments?.[0];
      const pax = o.passengers?.[0];
      return {
        id: o.id,
        pnr: o.booking_reference,
        status: o.live_mode ? 'confirmed' : 'confirmed',
        createdAt: o.created_at,
        totalAmount: o.total_amount,
        currency: o.total_currency,
        origin: seg?.origin?.iata_code ?? '',
        originCity: seg?.origin?.city_name ?? seg?.origin?.iata_code ?? '',
        destination: seg?.destination?.iata_code ?? '',
        destinationCity: seg?.destination?.city_name ?? seg?.destination?.iata_code ?? '',
        departureTime: seg?.departing_at ?? '',
        flightNumber: seg ? `${seg.marketing_carrier?.iata_code ?? ''}${seg.marketing_carrier_flight_number ?? ''}` : '',
        airlineCode: seg?.marketing_carrier?.iata_code ?? '',
        airlineName: seg?.marketing_carrier?.name ?? '',
        passengerName: pax ? `${pax.given_name ?? ''} ${pax.family_name ?? ''}`.trim() : '',
        cabinClass: slice?.fare_brand_name ?? 'Economy',
      };
    });

    return NextResponse.json({ orders });
  } catch {
    return NextResponse.json({ orders: [] });
  }
}
