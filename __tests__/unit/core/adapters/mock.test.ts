import { MockAdapter } from '@/core/adapters/mock';
import { AIRPORTS } from '@/utils/mockData';
import type { BookingRequest } from '@/types/booking';
import type { Flight } from '@/types/flight';

const JFK = AIRPORTS.find((a) => a.code === 'JFK')!;
const LHR = AIRPORTS.find((a) => a.code === 'LHR')!;

const baseSearchParams = {
  origin: JFK,
  destination: LHR,
  departureDate: '2026-06-01',
  passengers: { adults: 1, children: 0, infants: 0 },
  class: 'economy' as const,
  tripType: 'oneWay' as const,
};

describe('MockAdapter', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('has id "mock"', () => {
    expect(adapter.id).toBe('mock');
  });

  it('has a brand with required fields', () => {
    expect(adapter.brand.name).toBeTruthy();
    expect(adapter.brand.primaryColor).toMatch(/^#/);
    expect(adapter.brand.secondaryColor).toMatch(/^#/);
  });

  describe('searchFlights', () => {
    it('returns 6 flights for valid params', async () => {
      const promise = adapter.searchFlights(baseSearchParams);
      jest.runAllTimers();
      const flights = await promise;
      expect(flights).toHaveLength(6);
    });

    it('returns empty array when origin is null', async () => {
      const promise = adapter.searchFlights({ ...baseSearchParams, origin: null });
      jest.runAllTimers();
      const flights = await promise;
      expect(flights).toHaveLength(0);
    });

    it('returns empty array when destination is null', async () => {
      const promise = adapter.searchFlights({ ...baseSearchParams, destination: null });
      jest.runAllTimers();
      const flights = await promise;
      expect(flights).toHaveLength(0);
    });

    it('flights have prices for all three cabin classes', async () => {
      const promise = adapter.searchFlights(baseSearchParams);
      jest.runAllTimers();
      const flights = await promise;
      flights.forEach((f) => {
        expect(f.prices.economy).toBeGreaterThan(0);
        expect(f.prices.business).toBeGreaterThan(0);
        expect(f.prices.first).toBeGreaterThan(0);
      });
    });
  });

  describe('getSeatMap', () => {
    it('returns a 2D seat array for economy', async () => {
      const promise = adapter.getSeatMap('flight_0', 'economy');
      jest.runAllTimers();
      const map = await promise;
      expect(map.length).toBeGreaterThan(0);
      expect(map[0].length).toBeGreaterThan(0);
    });

    it('economy has more rows than first', async () => {
      const p1 = adapter.getSeatMap('f', 'economy');
      const p2 = adapter.getSeatMap('f', 'first');
      jest.runAllTimers();
      const [eco, first] = await Promise.all([p1, p2]);
      expect(eco.length).toBeGreaterThan(first.length);
    });
  });

  describe('createBooking', () => {
    const mockFlight: Flight = {
      id: 'flight_0',
      segments: [],
      totalDuration: '7h 0m',
      stops: 0,
      prices: { economy: 320, business: 800, first: 1280 },
      availability: { economy: 40, business: 15, first: 6 },
      baggage: { carry: '1 x 7kg', carryIncluded: true, checked: '1 x 23kg', checkedIncluded: true },
      amenities: [],
    };

    const bookingRequest: BookingRequest = {
      flight: mockFlight,
      passengers: [{ id: '1', type: 'adult', title: 'Mr', firstName: 'John', lastName: 'Doe', dateOfBirth: '1990-01-01' }],
      contactInfo: {
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '1 Main St', city: 'New York', state: 'NY', zipCode: '10001', country: 'USA' },
      },
      priceBreakdown: { baseFare: 320, taxes: 48, fees: 15, seatFees: 0, baggageFees: 0, total: 383 },
    };

    it('returns a confirmed booking with bookingId and pnr', async () => {
      const promise = adapter.createBooking(bookingRequest);
      jest.runAllTimers();
      const conf = await promise;
      expect(conf.status).toBe('confirmed');
      expect(conf.bookingId).toMatch(/^MOCK-/);
      expect(conf.pnr).toHaveLength(6);
    });

    it('pnr is uppercase alphanumeric', async () => {
      const promise = adapter.createBooking(bookingRequest);
      jest.runAllTimers();
      const conf = await promise;
      expect(conf.pnr).toMatch(/^[A-Z0-9]{6}$/);
    });
  });

  describe('cancelBooking', () => {
    it('resolves without throwing', async () => {
      const promise = adapter.cancelBooking('MOCK-123');
      jest.runAllTimers();
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('getBooking', () => {
    it('throws not implemented error', async () => {
      await expect(adapter.getBooking('MOCK-123')).rejects.toThrow('not implemented');
    });
  });
});
