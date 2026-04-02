import type { SearchParams, Flight, Seat, CabinClass } from './flight';
import type { BookingRequest, BookingConfirmation, BookingDetails } from './booking';

export interface BrandConfig {
  name: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily?: string;
}

export interface AirlineAdapter {
  id: string;
  brand: BrandConfig;
  searchFlights(params: SearchParams): Promise<Flight[]>;
  getSeatMap(flightId: string, cabinClass: CabinClass): Promise<Seat[][]>;
  createBooking(details: BookingRequest): Promise<BookingConfirmation>;
  getBooking(bookingId: string): Promise<BookingDetails>;
  cancelBooking(bookingId: string): Promise<void>;
}
