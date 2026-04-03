import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = (session as { accessToken?: string }).accessToken;
  const userId = req.nextUrl.searchParams.get('user_id') ?? (session.user as { id?: string }).id;

  if (!API_URL) {
    return NextResponse.json({ bookings: [] });
  }

  const res = await fetch(`${API_URL}/bookings?user_id=${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = (session as { accessToken?: string }).accessToken;
  const body = await req.json();

  if (!API_URL) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  }

  const res = await fetch(`${API_URL}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
