import { Duffel } from '@duffel/api';
import type { AirlineAdapter, BrandConfig } from '@/types/airline';
import type { SearchParams, Flight, FlightSegment, Seat, CabinClass } from '@/types/flight';
import type { BookingRequest, BookingConfirmation, BookingDetails } from '@/types/booking';
import { generateSeatMap } from '@/utils/mockData';

const CABIN_MAP: Record<CabinClass, 'economy' | 'premium_economy' | 'business' | 'first'> = {
  economy: 'economy',
  business: 'business',
  first: 'first',
};

function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  const h = m?.[1] ? parseInt(m[1]) : 0;
  const min = m?.[2] ? parseInt(m[2]) : 0;
  return `${h}h ${min}m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSegment(seg: any, idx: number): FlightSegment {
  return {
    id: seg.id ?? `${seg.marketing_carrier?.iata_code}${seg.marketing_carrier_flight_number}-${idx}`,
    airline: {
      code: seg.operating_carrier?.iata_code ?? '',
      name: seg.operating_carrier?.name ?? '',
      logo: seg.operating_carrier?.logo_symbol_url ?? seg.operating_carrier?.iata_code ?? '',
    },
    flightNumber: `${seg.marketing_carrier?.iata_code ?? ''}${seg.marketing_carrier_flight_number ?? ''}`,
    departure: {
      airport: {
        code: seg.origin?.iata_code ?? '',
        name: seg.origin?.name ?? '',
        city: seg.origin?.city_name ?? seg.origin?.iata_city_code ?? '',
        country: seg.origin?.iata_country_code ?? '',
      },
      time: seg.departing_at ?? '',
      terminal: seg.origin_terminal ?? undefined,
    },
    arrival: {
      airport: {
        code: seg.destination?.iata_code ?? '',
        name: seg.destination?.name ?? '',
        city: seg.destination?.city_name ?? seg.destination?.iata_city_code ?? '',
        country: seg.destination?.iata_country_code ?? '',
      },
      time: seg.arriving_at ?? '',
      terminal: seg.destination_terminal ?? undefined,
    },
    duration: parseDuration(seg.duration ?? 'PT0H'),
    aircraft: seg.aircraft?.name ?? '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOffer(offer: any, cabinClass: CabinClass): Flight {
  // For round trips Duffel returns 2 slices; use slice[0] (outbound) for display.
  // The offer.id covers the full itinerary — both legs are priced together.
  const slice = offer.slices[0];
  const segments: FlightSegment[] = slice.segments.map(mapSegment);

  const baggages: { type: string; quantity?: number; weight?: number; weight_unit?: string }[] =
    offer.slices[0]?.segments[0]?.passengers?.[0]?.baggages ?? [];
  const carryOn = baggages.find((b) => b.type === 'carry_on');
  const checkedBag = baggages.find((b) => b.type === 'checked');
  const checkedIncluded = !!checkedBag && (checkedBag.quantity ?? 0) > 0;

  // Look for purchasable checked-bag service in available_services
  const availableServices: { type: string; total_amount?: string; metadata?: { type?: string; maximum_weight_kg?: number } }[] =
    offer.available_services ?? [];
  const checkedService = availableServices.find(
    (s) => s.type === 'baggage' && s.metadata?.type === 'checked',
  );
  const checkedFee = !checkedIncluded && checkedService
    ? parseFloat(checkedService.total_amount ?? '0') || undefined
    : undefined;

  const price = parseFloat(offer.total_amount ?? '0');
  const prices: Record<CabinClass, number> = { economy: 0, business: 0, first: 0 };
  prices[cabinClass] = price;

  return {
    id: offer.id,
    segments,
    totalDuration: parseDuration(slice.duration ?? 'PT0H'),
    stops: slice.segments.length - 1,
    prices,
    availability: {
      economy: cabinClass === 'economy' ? 9 : 0,
      business: cabinClass === 'business' ? 9 : 0,
      first: cabinClass === 'first' ? 9 : 0,
    },
    baggage: {
      carry: carryOn ? `${carryOn.quantity ?? 1} x carry-on` : '1 x carry-on',
      carryIncluded: true,
      checked: checkedIncluded
        ? `${checkedBag!.quantity ?? 1} x ${checkedBag!.weight ? `${checkedBag!.weight}${checkedBag!.weight_unit ?? 'kg'}` : '23kg'}`
        : 'Not included',
      checkedIncluded,
      checkedFee,
    },
    amenities: [],
  };
}

export class DuffelAdapter implements AirlineAdapter {
  id = 'duffel';

  brand: BrandConfig = {
    name: 'Live Flights (Duffel)',
    logo: '🌐',
    primaryColor: '#003580',
    secondaryColor: '#e8f0fe',
  };

  private client: Duffel;

  constructor() {
    this.client = new Duffel({ token: process.env.DUFFEL_ACCESS_TOKEN! });
  }

  async searchFlights(params: SearchParams): Promise<Flight[]> {
    if (!params.origin || !params.destination) return [];

    const passengers = [
      ...Array(params.passengers.adults).fill({ type: 'adult' }),
      ...Array(params.passengers.children).fill({ type: 'child' }),
      ...Array(params.passengers.infants).fill({ type: 'infant_without_seat' }),
    ];

    const slices = [
      {
        origin: params.origin.code,
        destination: params.destination.code,
        departure_date: params.departureDate,
        departure_time: null,
        arrival_time: null,
      },
      // For round trips, add the return slice so Duffel prices both legs together
      ...(params.tripType === 'roundTrip' && params.returnDate
        ? [
            {
              origin: params.destination.code,
              destination: params.origin.code,
              departure_date: params.returnDate,
              departure_time: null,
              arrival_time: null,
            },
          ]
        : []),
    ];

    const orq = await this.client.offerRequests.create({
      slices,
      passengers,
      cabin_class: CABIN_MAP[params.class],
    });

    const offersPage = await this.client.offers.list({
      offer_request_id: orq.data.id,
      sort: 'total_amount',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (offersPage.data as any[]).slice(0, 10).map((offer) => mapOffer(offer, params.class));
  }

  async getSeatMap(_flightId: string, cabinClass: CabinClass): Promise<Seat[][]> {
    // Duffel's SeatMap API (seatMaps.get) is per-offer and requires special ancillary access.
    // Falling back to generated mock seat map for display purposes.
    return generateSeatMap(cabinClass);
  }

  async createBooking(_details: BookingRequest): Promise<BookingConfirmation> {
    // Duffel order creation requires full passenger PII and payment via Duffel Payments.
    // Wire this up via infra/lambdas/bookings or a dedicated /api/bookings/duffel route
    // once you have a Duffel live key.
    throw new Error('Duffel booking not yet wired up. Use the Lambda backend for production bookings.');
  }

  async getBooking(_bookingId: string): Promise<BookingDetails> {
    throw new Error('Not implemented');
  }

  async cancelBooking(_bookingId: string): Promise<void> {
    throw new Error('Not implemented');
  }
}
