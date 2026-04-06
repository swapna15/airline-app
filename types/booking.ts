import type { Flight, Seat } from './flight';

export interface Passenger {
  id: string;
  type: 'adult' | 'child' | 'infant';
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  passportNumber?: string;
  passportExpiry?: string;
  nationality?: string;
  seat?: Seat;
}

export interface ContactInfo {
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export interface PriceBreakdown {
  baseFare: number;
  taxes: number;
  fees: number;
  seatFees: number;
  baggageFees: number;
  total: number;
}

export interface BookingRequest {
  flight: Flight;
  returnFlight?: Flight;
  passengers: Passenger[];
  contactInfo: ContactInfo;
  priceBreakdown: PriceBreakdown;
}

export interface BookingConfirmation {
  bookingId: string;
  pnr: string;
  status: 'confirmed' | 'pending' | 'cancelled';
}

export interface BookingDetails extends BookingRequest {
  id: string;
  bookingDate: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  paymentInfo?: {
    method: string;
    transactionId: string;
  };
}
