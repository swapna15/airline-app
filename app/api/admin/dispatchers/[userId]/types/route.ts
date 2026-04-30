import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';

export const maxDuration = 30;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  if (!API_URL) return NextResponse.json({ error: 'NEXT_PUBLIC_API_URL not set' }, { status: 503 });
  const token = await getApiBearer(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await fetch(`${API_URL}/admin/dispatchers/${params.userId}/types`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: await req.text(),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
