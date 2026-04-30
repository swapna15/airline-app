import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import { ChevronLeft, BookOpen } from 'lucide-react';
import { DocViewer } from './DocViewer';

export const metadata = {
  title: 'GAAS Reference — AirlineOS',
  description: 'The complete reference for AirlineOS GAAS — architecture, features, configuration, testing.',
};

/**
 * Renders /GAAS-AIRLINEOS.md from the repo root inside the app shell. The
 * markdown is read at request time (no build-time cache) so updates land
 * without a rebuild.
 */
export default function GaasDocPage() {
  const path = join(process.cwd(), 'GAAS-AIRLINEOS.md');
  const source = readFileSync(path, 'utf-8');

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ChevronLeft size={12} /> Home
        </Link>
      </div>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="text-indigo-600" size={22} /> GAAS Reference
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            The single source of truth for AirlineOS — architecture, features, multi-tenancy,
            installation, configuration, testing, and roadmap.
          </p>
        </div>
        <a
          href="https://github.com/swapna15/airline-app/blob/main/GAAS-AIRLINEOS.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          View on GitHub
        </a>
      </header>

      <DocViewer source={source} />
    </div>
  );
}
