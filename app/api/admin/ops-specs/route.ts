import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';
import { DEFAULT_OPS_SPECS } from '@/lib/ops-specs';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(req: NextRequest) {
  if (!API_URL) {
    return NextResponse.json({ ...DEFAULT_OPS_SPECS, _localMode: true });
  }
  const token = await getApiBearer(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await fetch(`${API_URL}/admin/ops-specs`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PUT(req: NextRequest) {
  if (!API_URL) return NextResponse.json({ error: 'NEXT_PUBLIC_API_URL not set' }, { status: 503 });
  const token = await getApiBearer(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await fetch(`${API_URL}/admin/ops-specs`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: await req.text(),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
