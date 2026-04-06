import { render, screen } from '@testing-library/react';
import { PriceSummary } from '@/components/PriceSummary';
import type { PriceBreakdown } from '@/types/booking';

const base: PriceBreakdown = {
  baseFare: 320,
  taxes: 48,
  fees: 15,
  seatFees: 0,
  baggageFees: 0,
  total: 383,
};

describe('PriceSummary', () => {
  it('renders Price Breakdown heading', () => {
    render(<PriceSummary breakdown={base} />);
    expect(screen.getByText('Price Breakdown')).toBeInTheDocument();
  });

  it('renders base fare', () => {
    render(<PriceSummary breakdown={base} />);
    expect(screen.getByText('Base fare')).toBeInTheDocument();
    expect(screen.getByText('$320')).toBeInTheDocument();
  });

  it('renders taxes', () => {
    render(<PriceSummary breakdown={base} />);
    expect(screen.getByText('Taxes')).toBeInTheDocument();
    expect(screen.getByText('$48')).toBeInTheDocument();
  });

  it('renders fees', () => {
    render(<PriceSummary breakdown={base} />);
    expect(screen.getByText('Fees')).toBeInTheDocument();
    expect(screen.getByText('$15')).toBeInTheDocument();
  });

  it('renders total', () => {
    render(<PriceSummary breakdown={base} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('$383')).toBeInTheDocument();
  });

  it('hides seat selection row when seatFees is 0', () => {
    render(<PriceSummary breakdown={base} />);
    expect(screen.queryByText('Seat selection')).not.toBeInTheDocument();
  });

  it('shows seat selection row when seatFees > 0', () => {
    render(<PriceSummary breakdown={{ ...base, seatFees: 50 }} />);
    expect(screen.getByText('Seat selection')).toBeInTheDocument();
    expect(screen.getByText('$50')).toBeInTheDocument();
  });

  it('formats large numbers with locale separators', () => {
    render(<PriceSummary breakdown={{ ...base, baseFare: 1200, total: 1263 }} />);
    expect(screen.getByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText('$1,263')).toBeInTheDocument();
  });
});
