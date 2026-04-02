import { render, screen, fireEvent } from '@testing-library/react';
import { SeatMap } from '@/components/SeatMap';
import type { Seat } from '@/types/flight';

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: '1A',
    row: 1,
    letter: 'A',
    type: 'window',
    class: 'economy',
    isAvailable: true,
    isSelected: false,
    isOccupied: false,
    price: 0,
    features: [],
    ...overrides,
  };
}

const twoRowMap: Seat[][] = [
  [makeSeat({ id: '1A', row: 1, letter: 'A' }), makeSeat({ id: '1B', row: 1, letter: 'B', type: 'middle' })],
  [makeSeat({ id: '2A', row: 2, letter: 'A' }), makeSeat({ id: '2B', row: 2, letter: 'B', type: 'middle' })],
];

describe('SeatMap', () => {
  it('renders seat buttons', () => {
    render(<SeatMap seats={twoRowMap} selectedSeats={[]} onSeatToggle={jest.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('renders row numbers', () => {
    render(<SeatMap seats={twoRowMap} selectedSeats={[]} onSeatToggle={jest.fn()} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls onSeatToggle when an available seat is clicked', () => {
    const onToggle = jest.fn();
    render(<SeatMap seats={twoRowMap} selectedSeats={[]} onSeatToggle={onToggle} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onToggle).toHaveBeenCalledWith(twoRowMap[0][0]);
  });

  it('does not call onSeatToggle for occupied seat', () => {
    const onToggle = jest.fn();
    const map = [[makeSeat({ id: '1A', isOccupied: true })]];
    render(<SeatMap seats={map} selectedSeats={[]} onSeatToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not call onSeatToggle for unavailable seat', () => {
    const onToggle = jest.fn();
    const map = [[makeSeat({ id: '1A', isAvailable: false })]];
    render(<SeatMap seats={map} selectedSeats={[]} onSeatToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('selected seat button is disabled', () => {
    const seat = makeSeat({ id: '1A', isOccupied: true });
    const map = [[seat]];
    render(<SeatMap seats={map} selectedSeats={[seat]} onSeatToggle={jest.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders legend items', () => {
    render(<SeatMap seats={twoRowMap} selectedSeats={[]} onSeatToggle={jest.fn()} />);
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText('Occupied')).toBeInTheDocument();
  });

  it('seat button title shows seat id and type', () => {
    const map = [[makeSeat({ id: '1A', type: 'window', price: 25 })]];
    render(<SeatMap seats={map} selectedSeats={[]} onSeatToggle={jest.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('title')).toContain('1A');
    expect(btn.getAttribute('title')).toContain('window');
    expect(btn.getAttribute('title')).toContain('+$25');
  });
});
