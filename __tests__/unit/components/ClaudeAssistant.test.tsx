import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ClaudeAssistant } from '@/components/ClaudeAssistant';

jest.mock('@/utils/bookingStore', () => ({
  useBooking: () => ({
    adapter: {
      brand: { name: 'SkyMock Airlines', logo: '✈️', primaryColor: '#1a56db', secondaryColor: '#fff' },
    },
  }),
}));

global.fetch = jest.fn();

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
});

describe('ClaudeAssistant — closed state', () => {
  it('renders the floating open button', () => {
    render(<ClaudeAssistant />);
    // The floating button (MessageCircle icon button)
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not show chat panel initially', () => {
    render(<ClaudeAssistant />);
    expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument();
  });
});

describe('ClaudeAssistant — open state', () => {
  it('opens chat panel on button click', () => {
    render(<ClaudeAssistant />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
  });

  it('shows welcome message when opened', () => {
    render(<ClaudeAssistant />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/Hi! I'm your AI travel assistant for SkyMock Airlines/)).toBeInTheDocument();
  });

  it('closes panel when X button is clicked', () => {
    render(<ClaudeAssistant />);
    fireEvent.click(screen.getAllByRole('button')[0]); // open
    // buttons when open: [0]=floating open, [1]=X close, [2]=send
    fireEvent.click(screen.getAllByRole('button')[1]);
    expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument();
  });

  it('renders the message input and send button', () => {
    render(<ClaudeAssistant />);
    fireEvent.click(screen.getAllByRole('button')[0]); // open
    expect(screen.getByPlaceholderText('Ask anything...')).toBeInTheDocument();
  });

  it('send button is disabled when input is empty', () => {
    render(<ClaudeAssistant />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    const buttons = screen.getAllByRole('button');
    const sendBtn = buttons[buttons.length - 1]; // last button is send
    expect(sendBtn).toBeDisabled();
  });

  it('send button enables when input has text', () => {
    render(<ClaudeAssistant />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.change(screen.getByPlaceholderText('Ask anything...'), {
      target: { value: 'baggage policy?' },
    });
    const buttons = screen.getAllByRole('button');
    const sendBtn = buttons[buttons.length - 1];
    expect(sendBtn).not.toBeDisabled();
  });

  it('sends message and displays assistant reply', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'You can bring 1 carry-on bag.' }),
    });

    render(<ClaudeAssistant />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.change(screen.getByPlaceholderText('Ask anything...'), {
      target: { value: 'baggage policy?' },
    });

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button')[screen.getAllByRole('button').length - 1]);
    });

    await waitFor(() => {
      expect(screen.getByText('You can bring 1 carry-on bag.')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<ClaudeAssistant />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.change(screen.getByPlaceholderText('Ask anything...'), {
      target: { value: 'hello' },
    });

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button')[screen.getAllByRole('button').length - 1]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Sorry, I encountered an error/)).toBeInTheDocument();
    });
  });

  it('sends on Enter keydown', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'reply' }),
    });

    render(<ClaudeAssistant />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    const input = screen.getByPlaceholderText('Ask anything...');
    fireEvent.change(input, { target: { value: 'hello' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
