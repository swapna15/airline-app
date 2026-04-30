import { NextResponse } from 'next/server';
import { fetchSigmets } from '@/lib/aviationweather';
import { classifyAll, type ClassifiedSigmet } from '@/lib/sigmet-classifier';

export const maxDuration = 30;

export interface SigmetBoardResponse {
  generatedAt: string;
  source: 'aviationweather' | 'stale' | 'error';
  sigmets: ClassifiedSigmet[];
  error?: string;
}

// Module-level cache so a transient AviationWeather outage doesn't blank out
// the map — the stale set is still useful and clearly flagged.
let lastGood: { at: string; items: ClassifiedSigmet[] } | null = null;

export async function GET() {
  try {
    const raw = await fetchSigmets();
    const sigmets = classifyAll(raw).filter((s) => Array.isArray(s.coords) && s.coords.length >= 3);
    lastGood = { at: new Date().toISOString(), items: sigmets };
    const body: SigmetBoardResponse = {
      generatedAt: lastGood.at,
      source: 'aviationweather',
      sigmets,
    };
    return NextResponse.json(body);
  } catch (err) {
    if (lastGood) {
      const body: SigmetBoardResponse = {
        generatedAt: lastGood.at,
        source: 'stale',
        sigmets: lastGood.items,
        error: err instanceof Error ? err.message : String(err),
      };
      return NextResponse.json(body);
    }
    const body: SigmetBoardResponse = {
      generatedAt: new Date().toISOString(),
      source: 'error',
      sigmets: [],
      error: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json(body, { status: 200 });
  }
}
