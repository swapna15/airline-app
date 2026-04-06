'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SearchParams, Flight, Seat } from '@/types/flight';
import type { Passenger, ContactInfo, PriceBreakdown, BookingConfirmation } from '@/types/booking';
import type { AirlineAdapter } from '@/types/airline';
import { MockAdapter } from '@/core/adapters/mock';

interface BookingState {
  adapter: AirlineAdapter;
  searchParams: SearchParams | null;
  selectedFlight: Flight | null;
  selectedSeats: Seat[];
  passengers: Passenger[];
  contactInfo: ContactInfo | null;
  priceBreakdown: PriceBreakdown | null;
  confirmation: BookingConfirmation | null;
}

interface BookingActions {
  setSearchParams: (params: SearchParams) => void;
  setSelectedFlight: (flight: Flight) => void;
  setSelectedSeats: (seats: Seat[]) => void;
  setPassengers: (passengers: Passenger[]) => void;
  setContactInfo: (info: ContactInfo) => void;
  setPriceBreakdown: (breakdown: PriceBreakdown) => void;
  setConfirmation: (confirmation: BookingConfirmation) => void;
  reset: () => void;
}

const defaultAdapter = new MockAdapter();

const defaultState: BookingState = {
  adapter: defaultAdapter,
  searchParams: null,
  selectedFlight: null,
  selectedSeats: [],
  passengers: [],
  contactInfo: null,
  priceBreakdown: null,
  confirmation: null,
};

const BookingContext = createContext<BookingState & BookingActions>({
  ...defaultState,
  setSearchParams: () => {},
  setSelectedFlight: () => {},
  setSelectedSeats: () => {},
  setPassengers: () => {},
  setContactInfo: () => {},
  setPriceBreakdown: () => {},
  setConfirmation: () => {},
  reset: () => {},
});

const STORAGE_KEY = 'airlineos_booking';

/** Returns the active tenant ID from localStorage (never throws). */
function activeTenantId(): string {
  try { return localStorage.getItem('airlineos_active_tenant') ?? 'aeromock'; }
  catch { return 'aeromock'; }
}

/** Booking history is scoped per tenant so tenants don't see each other's data. */
function historyKey(): string {
  return `airlineos_booking_history_${activeTenantId()}`;
}

export interface SavedBooking {
  bookingId: string;
  pnr: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  bookedAt: string;
  cabinClass: string;
  total: number;
  contactEmail?: string;
  cancelledAt?: string;
  flight: {
    airline: { code: string; name: string };
    flightNumber: string;
    origin: { code: string; city: string };
    destination: { code: string; city: string };
    departureTime: string;
    arrivalTime?: string;
    totalDuration: string;
  };
  passengers: { firstName: string; lastName: string; seat?: string }[];
  priceBreakdown?: {
    baseFare: number;
    taxes: number;
    fees: number;
    seatFees: number;
    baggageFees: number;
    total: number;
  };
  baggage?: {
    carry: string;
    carryIncluded: boolean;
    checked: string;
    checkedIncluded: boolean;
    checkedFee?: number;
  };
}

export function getBookingHistory(): SavedBooking[] {
  try {
    return JSON.parse(localStorage.getItem(historyKey()) ?? '[]');
  } catch {
    return [];
  }
}

export function cancelBookingLocally(pnr: string): boolean {
  try {
    const history = getBookingHistory();
    const next = history.map((b) =>
      b.pnr === pnr ? { ...b, status: 'cancelled' as const, cancelledAt: new Date().toISOString() } : b,
    );
    localStorage.setItem(historyKey(), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function getBookingByPnr(pnr: string): SavedBooking | undefined {
  return getBookingHistory().find((b) => b.pnr === pnr);
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookingState>(defaultState);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setState((prev) => ({ ...prev, ...parsed, adapter: defaultAdapter }));
      }
    } catch {}
  }, []);

  const persist = (next: Partial<BookingState>) => {
    setState((prev) => {
      const updated = { ...prev, ...next };
      try {
        const { adapter, ...toSave } = updated;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch {}
      return updated;
    });
  };

  return (
    <BookingContext.Provider
      value={{
        ...state,
        setSearchParams: (searchParams) => persist({ searchParams }),
        setSelectedFlight: (selectedFlight) => persist({ selectedFlight }),
        setSelectedSeats: (selectedSeats) => persist({ selectedSeats }),
        setPassengers: (passengers) => persist({ passengers }),
        setContactInfo: (contactInfo) => persist({ contactInfo }),
        setPriceBreakdown: (priceBreakdown) => persist({ priceBreakdown }),
        setConfirmation: (confirmation) => {
          // Persist the completed booking to history before updating flow state
          if (state.selectedFlight && state.passengers.length > 0) {
            try {
              const segment = state.selectedFlight.segments[0];
              const entry: SavedBooking = {
                ...confirmation,
                bookedAt: new Date().toISOString(),
                cabinClass: state.searchParams?.class ?? 'economy',
                total: state.priceBreakdown?.total ?? 0,
                contactEmail: state.contactInfo?.email,
                flight: {
                  airline: { code: segment.airline.code, name: segment.airline.name },
                  flightNumber: segment.flightNumber,
                  origin: { code: segment.departure.airport.code, city: segment.departure.airport.city },
                  destination: { code: segment.arrival.airport.code, city: segment.arrival.airport.city },
                  departureTime: segment.departure.time,
                  arrivalTime: segment.arrival.time,
                  totalDuration: state.selectedFlight.totalDuration,
                },
                passengers: state.passengers.map((p, i) => ({
                  firstName: p.firstName,
                  lastName: p.lastName,
                  seat: state.selectedSeats[i]?.id,
                })),
                priceBreakdown: state.priceBreakdown ?? undefined,
                baggage: state.selectedFlight?.baggage
                  ? {
                      carry: state.selectedFlight.baggage.carry,
                      carryIncluded: state.selectedFlight.baggage.carryIncluded,
                      checked: state.priceBreakdown && state.priceBreakdown.baggageFees > 0
                        ? '1 x 23kg (added)'
                        : state.selectedFlight.baggage.checked,
                      checkedIncluded: state.selectedFlight.baggage.checkedIncluded ||
                        (state.priceBreakdown ? state.priceBreakdown.baggageFees > 0 : false),
                      checkedFee: state.selectedFlight.baggage.checkedFee,
                    }
                  : undefined,
              };
              const history = getBookingHistory();
              localStorage.setItem(historyKey(), JSON.stringify([entry, ...history]));
            } catch {}
          }
          persist({ confirmation });
        },
        reset: () => {
          localStorage.removeItem(STORAGE_KEY);
          setState(defaultState);
        },
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  return useContext(BookingContext);
}
