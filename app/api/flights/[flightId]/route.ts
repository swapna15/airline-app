import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(
  _req: NextRequest,
  { params }: { params: { flightId: string } },
) {
  if (!API_URL) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

  const res = await fetch(`${API_URL}/flights/${params.flightId}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
