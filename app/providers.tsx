'use client';

import { SessionProvider } from 'next-auth/react';
import { BookingProvider } from '@/utils/bookingStore';
import { TenantProvider } from '@/core/tenant/context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TenantProvider>
        <BookingProvider>{children}</BookingProvider>
      </TenantProvider>
    </SessionProvider>
  );
}
