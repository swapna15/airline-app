import { render, screen, fireEvent } from '@testing-library/react';
import { FlightCard } from '@/components/FlightCard';
import type { Flight } from '@/types/flight';

const mockFlight: Flight = {
  id: 'flight_0',
  segments: [
    {
      id: 'seg_0',
      airline: { code: 'BA', name: 'British Airways', logo: '🇬🇧' },
      flightNumber: 'BA1000',
      departure: {
        airport: { code: 'JFK', name: 'JFK', city: 'New York', country: 'USA' },
        time: '2026-06-01T08:00:00',
        terminal: 'T1',
        gate: 'A10',
      },
      arrival: {
        airport: { code: 'LHR', name: 'LHR', city: 'London', country: 'UK' },
        time: '2026-06-01T20:00:00',
        terminal: 'T2',
      },
      duration: '7h 0m',
      aircraft: 'Boeing 777',
    },
  ],
  totalDuration: '7h 0m',
  stops: 0,
  prices: { economy: 320, business: 800, first: 1280 },
  availability: { economy: 35, business: 14, first: 6 },
  baggage: { carry: '1 x 7kg', carryIncluded: true, checked: '1 x 23kg', checkedIncluded: true },
  amenities: ['Wi-Fi', 'Meals'],
};

describe('FlightCard', () => {
  it('renders airline name and flight number', () => {
    render(<FlightCard flight={mockFlight} selectedClass="economy" onSelect={jest.fn()} />);
    expect(screen.getByText(/British Airways/)).toBeInTheDocument();
    expect(screen.getByText(/BA1000/)).toBeInTheDocument();
  });

  it('renders origin and destination airport codes', () => {
    render(<FlightCard flight={mockFlight} selectedClass="economy" onSelect={jest.fn()} />);
    expect(screen.getByText('JFK')).toBeInTheDocument();
    expect(screen.getByText('LHR')).toBeInTheDocument();
  });

  it('renders economy price for economy class', () => {
    render(<FlightCard flight={mockFlight} selectedClass="economy" onSelect={jest.fn()} />);
    expect(screen.getByText('$320')).toBeInTheDocument();
  });

  it('renders business price for business class', () => {
    render(<FlightCard flight={mockFlight} selectedClass="business" onSelect={jest.fn()} />);
    expect(screen.getByText('$800')).toBeInTheDocument();
  });

  it('renders seat availability', () => {
    render(<FlightCard flight={mockFlight} selectedClass="economy" onSelect={jest.fn()} />);
    expect(screen.getByText(/35 seats left/)).toBeInTheDocument();
  });

  it('shows Nonstop for 0 stops', () => {
    render(<FlightCard flight={mockFlight} selectedClass="economy" onSelect={jest.fn()} />);
    expect(screen.getByText('Nonstop')).toBeInTheDocument();
  });

  it('shows stop count for multi-stop flights', () => {
    const f = { ...mockFlight, stops: 1 };
    render(<FlightCard flight={f} selectedClass="economy" onSelect={jest.fn()} />);
    expect(screen.getByText('1 stop')).toBeInTheDocument();
  });

  it('calls onSelect when card is clicked', () => {
    const onSelect = jest.fn();
    render(<FlightCard flight={mockFlight} selectedClass="economy" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Select'));
    expect(onSelect).toHaveBeenCalledWith(mockFlight);
  });

  it('calls onSelect when entire card div is clicked', () => {
    const onSelect = jest.fn();
    const { container } = render(<FlightCard flight={mockFlight} selectedClass="economy" onSelect={onSelect} />);
    fireEvent.click(container.firstChild as Element);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders total duration', () => {
    render(<FlightCard flight={mockFlight} selectedClass="economy" onSelect={jest.fn()} />);
    expect(screen.getByText('7h 0m')).toBeInTheDocument();
  });
});
