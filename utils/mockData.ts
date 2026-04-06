import type { Airport, Airline, Flight, FlightSegment, Seat, CabinClass } from '@/types/flight';

export const AIRPORTS: Airport[] = [
  // North America
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA', timezone: 'America/New_York' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark', country: 'USA', timezone: 'America/New_York' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', country: 'USA', timezone: 'America/New_York' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles' },
  { code: 'ORD', name: "O'Hare International Airport", city: 'Chicago', country: 'USA', timezone: 'America/Chicago' },
  { code: 'MDW', name: 'Chicago Midway International Airport', city: 'Chicago', country: 'USA', timezone: 'America/Chicago' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', country: 'USA', timezone: 'America/New_York' },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas', country: 'USA', timezone: 'America/Chicago' },
  { code: 'DEN', name: 'Denver International Airport', city: 'Denver', country: 'USA', timezone: 'America/Denver' },
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', country: 'USA', timezone: 'America/Los_Angeles' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'USA', timezone: 'America/Los_Angeles' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', country: 'USA', timezone: 'America/New_York' },
  { code: 'BOS', name: 'Boston Logan International Airport', city: 'Boston', country: 'USA', timezone: 'America/New_York' },
  { code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington DC', country: 'USA', timezone: 'America/New_York' },
  { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'Canada', timezone: 'America/Toronto' },
  { code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', country: 'Canada', timezone: 'America/Vancouver' },
  { code: 'MEX', name: 'Benito Juárez International Airport', city: 'Mexico City', country: 'Mexico', timezone: 'America/Mexico_City' },
  // Europe
  { code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', timezone: 'Europe/London' },
  { code: 'LGW', name: 'London Gatwick Airport', city: 'London', country: 'United Kingdom', timezone: 'Europe/London' },
  { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France', timezone: 'Europe/Paris' },
  { code: 'ORY', name: 'Paris Orly Airport', city: 'Paris', country: 'France', timezone: 'Europe/Paris' },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', timezone: 'Europe/Berlin' },
  { code: 'MUC', name: 'Munich Airport', city: 'Munich', country: 'Germany', timezone: 'Europe/Berlin' },
  { code: 'AMS', name: 'Amsterdam Schiphol Airport', city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam' },
  { code: 'MAD', name: 'Adolfo Suárez Madrid-Barajas Airport', city: 'Madrid', country: 'Spain', timezone: 'Europe/Madrid' },
  { code: 'BCN', name: 'Barcelona El Prat Airport', city: 'Barcelona', country: 'Spain', timezone: 'Europe/Madrid' },
  { code: 'FCO', name: 'Leonardo da Vinci International Airport', city: 'Rome', country: 'Italy', timezone: 'Europe/Rome' },
  { code: 'MXP', name: 'Milan Malpensa Airport', city: 'Milan', country: 'Italy', timezone: 'Europe/Rome' },
  { code: 'ZUR', name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland', timezone: 'Europe/Zurich' },
  { code: 'VIE', name: 'Vienna International Airport', city: 'Vienna', country: 'Austria', timezone: 'Europe/Vienna' },
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country: 'Belgium', timezone: 'Europe/Brussels' },
  { code: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark', timezone: 'Europe/Copenhagen' },
  { code: 'ARN', name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm' },
  { code: 'OSL', name: 'Oslo Gardermoen Airport', city: 'Oslo', country: 'Norway', timezone: 'Europe/Oslo' },
  { code: 'HEL', name: 'Helsinki-Vantaa Airport', city: 'Helsinki', country: 'Finland', timezone: 'Europe/Helsinki' },
  { code: 'ATH', name: 'Athens International Airport', city: 'Athens', country: 'Greece', timezone: 'Europe/Athens' },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', timezone: 'Europe/Istanbul' },
  { code: 'SVO', name: 'Sheremetyevo International Airport', city: 'Moscow', country: 'Russia', timezone: 'Europe/Moscow' },
  // Middle East & Africa
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai' },
  { code: 'AUH', name: 'Abu Dhabi International Airport', city: 'Abu Dhabi', country: 'UAE', timezone: 'Asia/Dubai' },
  { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'Qatar', timezone: 'Asia/Qatar' },
  { code: 'RUH', name: 'King Khalid International Airport', city: 'Riyadh', country: 'Saudi Arabia', timezone: 'Asia/Riyadh' },
  { code: 'TLV', name: 'Ben Gurion International Airport', city: 'Tel Aviv', country: 'Israel', timezone: 'Asia/Jerusalem' },
  { code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo' },
  { code: 'JNB', name: 'O.R. Tambo International Airport', city: 'Johannesburg', country: 'South Africa', timezone: 'Africa/Johannesburg' },
  { code: 'NBO', name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country: 'Kenya', timezone: 'Africa/Nairobi' },
  { code: 'CMN', name: 'Mohammed V International Airport', city: 'Casablanca', country: 'Morocco', timezone: 'Africa/Casablanca' },
  // Asia Pacific
  { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' },
  { code: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' },
  { code: 'KIX', name: 'Kansai International Airport', city: 'Osaka', country: 'Japan', timezone: 'Asia/Tokyo' },
  { code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul' },
  { code: 'PEK', name: 'Beijing Capital International Airport', city: 'Beijing', country: 'China', timezone: 'Asia/Shanghai' },
  { code: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai' },
  { code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong' },
  { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore' },
  { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok' },
  { code: 'CGK', name: 'Soekarno-Hatta International Airport', city: 'Jakarta', country: 'Indonesia', timezone: 'Asia/Jakarta' },
  { code: 'MNL', name: 'Ninoy Aquino International Airport', city: 'Manila', country: 'Philippines', timezone: 'Asia/Manila' },
  { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'Delhi', country: 'India', timezone: 'Asia/Kolkata' },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India', timezone: 'Asia/Kolkata' },
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney' },
  { code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia', timezone: 'Australia/Melbourne' },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand', timezone: 'Pacific/Auckland' },
  // South America
  { code: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', country: 'Brazil', timezone: 'America/Sao_Paulo' },
  { code: 'EZE', name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'BOG', name: 'El Dorado International Airport', city: 'Bogotá', country: 'Colombia', timezone: 'America/Bogota' },
  { code: 'LIM', name: 'Jorge Chávez International Airport', city: 'Lima', country: 'Peru', timezone: 'America/Lima' },
  { code: 'SCL', name: 'Arturo Merino Benítez International Airport', city: 'Santiago', country: 'Chile', timezone: 'America/Santiago' },
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
      baggage: {
        carry: '1 x 7kg',
        carryIncluded: true,
        // Economy: checked bag costs extra; Business/First: included
        checked: i % 3 === 0 ? 'Not included' : '1 x 23kg',
        checkedIncluded: i % 3 !== 0,
        checkedFee: i % 3 === 0 ? 35 + (i % 2) * 10 : undefined,
      },
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
