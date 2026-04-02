import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(
  _req: NextRequest,
  { params }: { params: { bookingId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = (session as { accessToken?: string }).accessToken;

  if (!API_URL) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

  const res = await fetch(`${API_URL}/bookings/${params.bookingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { bookingId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = (session as { accessToken?: string }).accessToken;

  if (!API_URL) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

  const res = await fetch(`${API_URL}/bookings/${params.bookingId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
