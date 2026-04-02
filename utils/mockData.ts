import type { Airport, Airline, Flight, FlightSegment, Seat, CabinClass } from '@/types/flight';

export const AIRPORTS: Airport[] = [
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA', timezone: 'EST' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA', timezone: 'PST' },
  { code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', timezone: 'GMT' },
  { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France', timezone: 'CET' },
  { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan', timezone: 'JST' },
  { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', timezone: 'SGT' },
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'UAE', timezone: 'GST' },
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia', timezone: 'AEST' },
  { code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong', timezone: 'HKT' },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', timezone: 'CET' },
];

export const AIRLINES: Airline[] = [
  { code: 'AA', name: 'American Airlines', logo: '🇺🇸' },
  { code: 'UA', name: 'United Airlines', logo: '🇺🇸' },
  { code: 'BA', name: 'British Airways', logo: '🇬🇧' },
  { code: 'AF', name: 'Air France', logo: '🇫🇷' },
  { code: 'JL', name: 'Japan Airlines', logo: '🇯🇵' },
  { code: 'SQ', name: 'Singapore Airlines', logo: '🇸🇬' },
  { code: 'EK', name: 'Emirates', logo: '🇦🇪' },
  { code: 'QF', name: 'Qantas', logo: '🇦🇺' },
  { code: 'CX', name: 'Cathay Pacific', logo: '🇭🇰' },
  { code: 'LH', name: 'Lufthansa', logo: '🇩🇪' },
];

export function generateMockFlights(origin: Airport, destination: Airport, date: string): Flight[] {
  const flights: Flight[] = [];
  for (let i = 0; i < 6; i++) {
    const airline = AIRLINES[i % AIRLINES.length];
    const basePrice = 200 + (i + 1) * 120;
    const departureHour = 6 + i * 3;
    const durationMin = 180 + i * 45;

    const segment: FlightSegment = {
      id: `seg_${i}`,
      airline,
      flightNumber: `${airline.code}${1000 + i * 111}`,
      departure: {
        airport: origin,
        time: `${date}T${String(departureHour).padStart(2, '0')}:00:00`,
        terminal: `T${(i % 3) + 1}`,
        gate: `${String.fromCharCode(65 + i)}${i + 10}`,
      },
      arrival: {
        airport: destination,
        time: new Date(new Date(`${date}T${String(departureHour).padStart(2, '0')}:00:00`).getTime() + durationMin * 60000).toISOString(),
        terminal: `T${(i % 2) + 1}`,
      },
      duration: `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`,
      aircraft: ['Boeing 737', 'Boeing 777', 'Airbus A320', 'Airbus A380', 'Boeing 787', 'Airbus A350'][i % 6],
    };

    flights.push({
      id: `flight_${i}`,
      segments: [segment],
      totalDuration: segment.duration,
      stops: 0,
      prices: {
        economy: basePrice,
        business: Math.round(basePrice * 2.5),
        first: Math.round(basePrice * 4),
      },
      availability: {
        economy: 40 - i * 5,
        business: 15 - i,
        first: 6 - Math.floor(i / 2),
      },
      baggage: { carry: '1 x 7kg', checked: '1 x 23kg' },
      amenities: ['Wi-Fi', 'Entertainment', 'Meals', 'Power outlets'].slice(0, 2 + (i % 3)),
    });
  }
  return flights;
}

export function generateSeatMap(cabinClass: CabinClass): Seat[][] {
  const config: Record<CabinClass, { rows: number; letters: string[] }> = {
    economy: { rows: 30, letters: ['A', 'B', 'C', 'D', 'E', 'F'] },
    business: { rows: 12, letters: ['A', 'C', 'D', 'F'] },
    first: { rows: 4, letters: ['A', 'B'] },
  };
  const { rows, letters } = config[cabinClass];
  const seats: Seat[][] = [];

  for (let row = 1; row <= rows; row++) {
    const seatRow: Seat[] = [];
    letters.forEach((letter, idx) => {
      const isWindow = idx === 0 || idx === letters.length - 1;
      const isAisle = !isWindow && (idx === Math.floor(letters.length / 2) - 1 || idx === Math.floor(letters.length / 2));
      seatRow.push({
        id: `${row}${letter}`,
        row,
        letter,
        type: isWindow ? 'window' : isAisle ? 'aisle' : 'middle',
        class: cabinClass,
        isAvailable: Math.random() > 0.3,
        isSelected: false,
        isOccupied: Math.random() > 0.65,
        price: cabinClass === 'economy' && (isWindow || isAisle) ? 25 : 0,
        features: isWindow ? ['Window view'] : isAisle ? ['Easy access'] : [],
      });
    });
    seats.push(seatRow);
  }
  return seats;
}
