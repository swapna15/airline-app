import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(
  req: NextRequest,
  { params }: { params: { flightId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = (session as any).accessToken as string | undefined;
  const cabinClass = req.nextUrl.searchParams.get('cabin_class');

  if (!API_URL) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

  const qs = cabinClass ? `?cabin_class=${cabinClass}` : '';
  const res = await fetch(`${API_URL}/flights/${params.flightId}/seats${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
