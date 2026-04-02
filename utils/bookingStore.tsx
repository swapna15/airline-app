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
        setConfirmation: (confirmation) => persist({ confirmation }),
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
