import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '@/components/Navbar';

const mockSignOut = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: (...args: any[]) => mockSignOut(...args),
}));

jest.mock('@/utils/bookingStore', () => ({
  useBooking: () => ({
    adapter: {
      brand: {
        name: 'SkyMock Airlines',
        logo: '✈️',
        primaryColor: '#1a56db',
        secondaryColor: '#e8f0fe',
      },
    },
  }),
}));

jest.mock('next/link', () => {
  const MockLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'Link';
  return MockLink;
});

import { useSession } from 'next-auth/react';

describe('Navbar — unauthenticated', () => {
  beforeEach(() => {
    (useSession as jest.Mock).mockReturnValue({ data: null });
  });

  it('renders the airline name and logo', () => {
    render(<Navbar />);
    expect(screen.getByText('SkyMock Airlines')).toBeInTheDocument();
    expect(screen.getByText('✈️')).toBeInTheDocument();
  });

  it('shows Sign In and Register links when logged out', () => {
    render(<Navbar />);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
  });

  it('does not show My Bookings when logged out', () => {
    render(<Navbar />);
    expect(screen.queryByText('My Bookings')).not.toBeInTheDocument();
  });

  it('does not show Sign out button when logged out', () => {
    render(<Navbar />);
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });
});

describe('Navbar — authenticated', () => {
  beforeEach(() => {
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { name: 'Jane Doe', email: 'jane@example.com' } },
    });
    mockSignOut.mockReset();
  });

  it('shows user name when logged in', () => {
    render(<Navbar />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('shows My Bookings link when logged in', () => {
    render(<Navbar />);
    expect(screen.getByText('My Bookings')).toBeInTheDocument();
  });

  it('shows Sign out button when logged in', () => {
    render(<Navbar />);
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('hides Sign In and Register when logged in', () => {
    render(<Navbar />);
    expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
    expect(screen.queryByText('Register')).not.toBeInTheDocument();
  });

  it('calls signOut with callbackUrl on Sign out click', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
  });

  it('falls back to email when name is not available', () => {
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { email: 'jane@example.com' } },
    });
    render(<Navbar />);
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });
});
