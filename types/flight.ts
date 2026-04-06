export type CabinClass = 'economy' | 'business' | 'first';

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone?: string;
}

export interface Airline {
  code: string;
  name: string;
  logo: string;
}

export interface FlightSegment {
  id: string;
  airline: Airline;
  flightNumber: string;
  departure: {
    airport: Airport;
    time: string;
    terminal?: string;
    gate?: string;
  };
  arrival: {
    airport: Airport;
    time: string;
    terminal?: string;
    gate?: string;
  };
  duration: string;
  aircraft: string;
}

export interface Flight {
  id: string;
  segments: FlightSegment[];
  totalDuration: string;
  stops: number;
  prices: Record<CabinClass, number>;
  availability: Record<CabinClass, number>;
  baggage: {
    carry: string;           // display string e.g. "1 x 7kg"
    carryIncluded: boolean;
    checked: string;         // display string e.g. "1 x 23kg" or "Not included"
    checkedIncluded: boolean;
    checkedFee?: number;     // per-passenger fee to add a checked bag (undefined = not purchasable)
  };
  amenities: string[];
}

export interface Seat {
  id: string;
  row: number;
  letter: string;
  type: 'window' | 'middle' | 'aisle';
  class: CabinClass;
  isAvailable: boolean;
  isSelected: boolean;
  isOccupied: boolean;
  price?: number;
  features?: string[];
}

export interface SearchParams {
  origin: Airport | null;
  destination: Airport | null;
  departureDate: string;
  returnDate?: string;
  passengers: {
    adults: number;
    children: number;
    infants: number;
  };
  class: CabinClass;
  tripType: 'oneWay' | 'roundTrip';
}
