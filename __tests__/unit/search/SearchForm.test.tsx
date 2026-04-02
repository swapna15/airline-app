import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SearchForm } from '@/app/search/SearchForm';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSetSearchParams = jest.fn();
jest.mock('@/utils/bookingStore', () => ({
  useBooking: () => ({ setSearchParams: mockSetSearchParams }),
}));

global.fetch = jest.fn();

beforeEach(() => {
  mockPush.mockReset();
  mockSetSearchParams.mockReset();
  (global.fetch as jest.Mock).mockReset();
});

// Helpers
const getFromSelect = () => screen.getByLabelText('From');
const getToSelect = () => screen.getByLabelText('To');
const getDeparture = () => screen.getByLabelText('Departure');
const getReturn = () => screen.getByLabelText(/Return/);
const getSearchBtn = () => screen.getByRole('button', { name: /Search Flights/ });

describe('SearchForm — trip type toggle', () => {
  it('defaults to One Way (active style)', () => {
    render(<SearchForm />);
    expect(screen.getByRole('button', { name: 'One Way' }).className).toContain('bg-white');
  });

  it('switches to Round Trip on click', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Round Trip' }));
    expect(screen.getByRole('button', { name: 'Round Trip' }).className).toContain('bg-white');
  });

  it('return date is disabled in One Way mode', () => {
    render(<SearchForm />);
    expect(getReturn()).toBeDisabled();
  });

  it('return date is enabled in Round Trip mode', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Round Trip' }));
    expect(getReturn()).not.toBeDisabled();
  });

  it('switching back to One Way disables return date again', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Round Trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'One Way' }));
    expect(getReturn()).toBeDisabled();
  });
});

describe('SearchForm — submit guard', () => {
  it('search button is disabled initially', () => {
    render(<SearchForm />);
    expect(getSearchBtn()).toBeDisabled();
  });

  it('enables after filling required one-way fields', () => {
    render(<SearchForm />);
    fireEvent.change(getFromSelect(), { target: { value: 'JFK' } });
    fireEvent.change(getToSelect(), { target: { value: 'LHR' } });
    fireEvent.change(getDeparture(), { target: { value: '2026-06-01' } });
    expect(getSearchBtn()).not.toBeDisabled();
  });

  it('stays disabled for round-trip without return date', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Round Trip' }));
    fireEvent.change(getFromSelect(), { target: { value: 'JFK' } });
    fireEvent.change(getToSelect(), { target: { value: 'LHR' } });
    fireEvent.change(getDeparture(), { target: { value: '2026-06-01' } });
    expect(getSearchBtn()).toBeDisabled();
  });

  it('enables for round-trip when all fields are filled', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Round Trip' }));
    fireEvent.change(getFromSelect(), { target: { value: 'JFK' } });
    fireEvent.change(getToSelect(), { target: { value: 'LHR' } });
    fireEvent.change(getDeparture(), { target: { value: '2026-06-01' } });
    fireEvent.change(getReturn(), { target: { value: '2026-06-15' } });
    expect(getSearchBtn()).not.toBeDisabled();
  });
});

describe('SearchForm — form submission', () => {
  it('calls setSearchParams and navigates on submit', () => {
    render(<SearchForm />);
    fireEvent.change(getFromSelect(), { target: { value: 'JFK' } });
    fireEvent.change(getToSelect(), { target: { value: 'LHR' } });
    fireEvent.change(getDeparture(), { target: { value: '2026-06-01' } });
    fireEvent.click(getSearchBtn());
    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/search/results');
  });

  it('one-way submission strips returnDate from params', () => {
    render(<SearchForm />);
    fireEvent.change(getFromSelect(), { target: { value: 'JFK' } });
    fireEvent.change(getToSelect(), { target: { value: 'LHR' } });
    fireEvent.change(getDeparture(), { target: { value: '2026-06-01' } });
    fireEvent.click(getSearchBtn());
    const params = mockSetSearchParams.mock.calls[0][0];
    expect(params.returnDate).toBeUndefined();
  });

  it('round-trip submission includes returnDate', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Round Trip' }));
    fireEvent.change(getFromSelect(), { target: { value: 'JFK' } });
    fireEvent.change(getToSelect(), { target: { value: 'LHR' } });
    fireEvent.change(getDeparture(), { target: { value: '2026-06-01' } });
    fireEvent.change(getReturn(), { target: { value: '2026-06-15' } });
    fireEvent.click(getSearchBtn());
    expect(mockSetSearchParams.mock.calls[0][0].returnDate).toBe('2026-06-15');
  });

  it('submitted params contain correct tripType', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Round Trip' }));
    fireEvent.change(getFromSelect(), { target: { value: 'JFK' } });
    fireEvent.change(getToSelect(), { target: { value: 'LHR' } });
    fireEvent.change(getDeparture(), { target: { value: '2026-06-01' } });
    fireEvent.change(getReturn(), { target: { value: '2026-06-15' } });
    fireEvent.click(getSearchBtn());
    expect(mockSetSearchParams.mock.calls[0][0].tripType).toBe('roundTrip');
  });
});

describe('SearchForm — PassengerPicker', () => {
  it('shows "1 passenger" by default', () => {
    render(<SearchForm />);
    expect(screen.getByText('1 passenger')).toBeInTheDocument();
  });

  it('opens picker on trigger click', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByText('1 passenger'));
    expect(screen.getByText('Adults')).toBeInTheDocument();
    expect(screen.getByText('Children')).toBeInTheDocument();
    expect(screen.getByText('Infants')).toBeInTheDocument();
  });

  it('increments adult count', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByText('1 passenger'));
    fireEvent.click(screen.getAllByText('+')[0]); // adults +
    expect(screen.getByText('2 passengers')).toBeInTheDocument();
  });

  it('cannot decrement adults below 1', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByText('1 passenger'));
    fireEvent.click(screen.getAllByText('−')[0]); // adults −
    expect(screen.getByText('1 passenger')).toBeInTheDocument();
  });

  it('increments children count', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByText('1 passenger'));
    fireEvent.click(screen.getAllByText('+')[1]); // children +
    expect(screen.getByText('2 passengers')).toBeInTheDocument();
  });

  it('caps infants at adult count', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByText('1 passenger'));
    const plus = screen.getAllByText('+');
    fireEvent.click(plus[2]); // infants + → 1 infant (= 1 adult, OK)
    fireEvent.click(plus[2]); // infants + → would be 2 but adult=1, so stays at 1
    // total still 2 (1 adult + 1 infant)
    expect(screen.getByText('2 passengers')).toBeInTheDocument();
  });

  it('closes picker when Done is clicked', () => {
    render(<SearchForm />);
    fireEvent.click(screen.getByText('1 passenger'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Adults')).not.toBeInTheDocument();
  });
});

describe('SearchForm — NL search', () => {
  it('renders the AI Search button', () => {
    render(<SearchForm />);
    expect(screen.getByRole('button', { name: /AI Search/ })).toBeInTheDocument();
  });

  it('calls /api/agents on AI Search click', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: JSON.stringify({
          origin: { code: 'JFK', city: 'New York', name: 'JFK', country: 'USA' },
          destination: { code: 'LHR', city: 'London', name: 'LHR', country: 'UK' },
          departureDate: '2026-06-01',
          tripType: 'oneWay',
          passengers: { adults: 1, children: 0, infants: 0 },
          class: 'economy',
        }),
      }),
    });
    render(<SearchForm />);
    fireEvent.change(screen.getByPlaceholderText(/Try:/), { target: { value: 'flights JFK to LHR' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI Search/ }));
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/agents', expect.objectContaining({ method: 'POST' }));
  });

  it('shows error when AI search returns non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });
    render(<SearchForm />);
    fireEvent.change(screen.getByPlaceholderText(/Try:/), { target: { value: 'bad query' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI Search/ }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Server error: 500/)).toBeInTheDocument();
    });
  });

  it('shows error when fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    render(<SearchForm />);
    fireEvent.change(screen.getByPlaceholderText(/Try:/), { target: { value: 'query' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI Search/ }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });
});
