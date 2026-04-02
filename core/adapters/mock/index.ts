import type { AirlineAdapter, BrandConfig } from '@/types/airline';
import type { SearchParams, Flight, Seat, CabinClass } from '@/types/flight';
import type { BookingRequest, BookingConfirmation, BookingDetails } from '@/types/booking';
import { generateMockFlights, generateSeatMap } from '@/utils/mockData';

export class MockAdapter implements AirlineAdapter {
  id = 'mock';

  brand: BrandConfig = {
    name: 'SkyMock Airlines',
    logo: '✈️',
    primaryColor: '#1a56db',
    secondaryColor: '#e8f0fe',
    fontFamily: 'Inter, sans-serif',
  };

  async searchFlights(params: SearchParams): Promise<Flight[]> {
    if (!params.origin || !params.destination) return [];
    await new Promise((r) => setTimeout(r, 400)); // simulate latency
    return generateMockFlights(params.origin, params.destination, params.departureDate);
  }

  async getSeatMap(flightId: string, cabinClass: CabinClass): Promise<Seat[][]> {
    await new Promise((r) => setTimeout(r, 200));
    return generateSeatMap(cabinClass);
  }

  async createBooking(details: BookingRequest): Promise<BookingConfirmation> {
    await new Promise((r) => setTimeout(r, 600));
    return {
      bookingId: `MOCK-${Date.now()}`,
      pnr: Math.random().toString(36).substring(2, 8).toUpperCase(),
      status: 'confirmed',
    };
  }

  async getBooking(bookingId: string): Promise<BookingDetails> {
    throw new Error('getBooking not implemented in MockAdapter');
  }

  async cancelBooking(bookingId: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 300));
  }
}
