import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body?.name || !body?.email || !body?.password) {
    return NextResponse.json({ error: 'name, email, and password are required' }, { status: 400 });
  }

  // Forward to Lambda backend when deployed
  if (API_URL) {
    const res = await fetch(`${API_URL}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  // Local dev: simulate successful registration (no DB)
  return NextResponse.json(
    {
      id: 'local-' + Date.now(),
      name: body.name,
      email: body.email,
      role: 'passenger',
    },
    { status: 201 },
  );
}
