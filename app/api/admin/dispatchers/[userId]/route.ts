import { NextRequest, NextResponse } from 'next/server';
import { getApiBearer } from '@/lib/api-auth';

export const maxDuration = 30;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function forward(req: NextRequest, method: 'GET' | 'PUT', path: string) {
  if (!API_URL) return NextResponse.json({ error: 'NEXT_PUBLIC_API_URL not set' }, { status: 503 });
  const token = await getApiBearer(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (method === 'PUT') init.body = await req.text();
  const res = await fetch(`${API_URL}${path}`, init);
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  return forward(req, 'GET', `/admin/dispatchers/${params.userId}`);
}
export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  return forward(req, 'PUT', `/admin/dispatchers/${params.userId}`);
}
