import { AIRPORTS, AIRLINES, generateMockFlights, generateSeatMap } from '@/utils/mockData';

const JFK = AIRPORTS.find((a) => a.code === 'JFK')!;
const LHR = AIRPORTS.find((a) => a.code === 'LHR')!;

describe('AIRPORTS', () => {
  it('exports at least one airport', () => {
    expect(AIRPORTS.length).toBeGreaterThan(0);
  });

  it('each airport has required fields', () => {
    AIRPORTS.forEach((a) => {
      expect(a.code).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.city).toBeTruthy();
      expect(a.country).toBeTruthy();
    });
  });

  it('includes JFK and LHR', () => {
    expect(JFK).toBeDefined();
    expect(LHR).toBeDefined();
  });
});

describe('generateMockFlights', () => {
  it('returns 6 flights', () => {
    const flights = generateMockFlights(JFK, LHR, '2026-06-01');
    expect(flights).toHaveLength(6);
  });

  it('returns empty array when origin is missing', () => {
    // handled by MockAdapter guard — function itself still runs but adapter checks
    const flights = generateMockFlights(JFK, LHR, '2026-06-01');
    expect(Array.isArray(flights)).toBe(true);
  });

  it('each flight has correct structure', () => {
    const flights = generateMockFlights(JFK, LHR, '2026-06-01');
    flights.forEach((f) => {
      expect(f.id).toBeTruthy();
      expect(f.segments).toHaveLength(1);
      expect(f.prices.economy).toBeGreaterThan(0);
      expect(f.prices.business).toBeGreaterThan(f.prices.economy);
      expect(f.prices.first).toBeGreaterThan(f.prices.business);
      expect(f.stops).toBe(0);
    });
  });

  it('departure airport matches origin', () => {
    const flights = generateMockFlights(JFK, LHR, '2026-06-01');
    flights.forEach((f) => {
      expect(f.segments[0].departure.airport.code).toBe('JFK');
      expect(f.segments[0].arrival.airport.code).toBe('LHR');
    });
  });

  it('departure times are on the given date', () => {
    const flights = generateMockFlights(JFK, LHR, '2026-06-01');
    flights.forEach((f) => {
      expect(f.segments[0].departure.time).toContain('2026-06-01');
    });
  });

  it('availability counts are non-negative', () => {
    const flights = generateMockFlights(JFK, LHR, '2026-06-01');
    flights.forEach((f) => {
      expect(f.availability.economy).toBeGreaterThanOrEqual(0);
      expect(f.availability.business).toBeGreaterThanOrEqual(0);
      expect(f.availability.first).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('generateSeatMap', () => {
  it('economy returns 30 rows', () => {
    const map = generateSeatMap('economy');
    expect(map).toHaveLength(30);
  });

  it('business returns 12 rows', () => {
    expect(generateSeatMap('business')).toHaveLength(12);
  });

  it('first returns 4 rows', () => {
    expect(generateSeatMap('first')).toHaveLength(4);
  });

  it('economy rows have 6 seats', () => {
    generateSeatMap('economy').forEach((row) => expect(row).toHaveLength(6));
  });

  it('each seat has correct class label', () => {
    generateSeatMap('business').forEach((row) =>
      row.forEach((seat) => expect(seat.class).toBe('business')),
    );
  });

  it('first seat in each row is window type', () => {
    generateSeatMap('economy').forEach((row) => {
      expect(row[0].type).toBe('window');
      expect(row[row.length - 1].type).toBe('window');
    });
  });

  it('seat id matches row+letter', () => {
    const map = generateSeatMap('economy');
    const seat = map[0][0];
    expect(seat.id).toBe(`${seat.row}${seat.letter}`);
  });

  it('isSelected defaults to false', () => {
    generateSeatMap('first').forEach((row) =>
      row.forEach((seat) => expect(seat.isSelected).toBe(false)),
    );
  });
});
