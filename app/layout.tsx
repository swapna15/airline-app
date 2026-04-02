import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/Navbar';
import { ClaudeAssistant } from '@/components/ClaudeAssistant';

export const metadata: Metadata = {
  title: 'AirlineOS',
  description: 'Agentic AI-powered airline booking platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <ClaudeAssistant />
        </Providers>
      </body>
    </html>
  );
}
