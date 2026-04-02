'use client';

import { SessionProvider } from 'next-auth/react';
import { BookingProvider } from '@/utils/bookingStore';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BookingProvider>{children}</BookingProvider>
    </SessionProvider>
  );
}
