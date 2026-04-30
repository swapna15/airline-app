import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(req: NextRequest) {
  if (!API_URL) {
    // Local dev — schema lives only in deployed Postgres. Return an empty
    // structure so the UI renders rather than crashing.
    return NextResponse.json({ dispatchers: [], localMode: true });
  }
  const token = await getApiBearer(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await fetch(`${API_URL}/admin/dispatchers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
