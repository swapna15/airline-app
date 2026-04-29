import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getOrCreatePlan, savePlan, type FlightPlan } from '@/lib/planner-store';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function authToken() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session as { accessToken?: string }).accessToken;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { flightId: string } },
) {
  if (API_URL) {
    const token = await authToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const res = await fetch(`${API_URL}/planning/flight-plans/${params.flightId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }
  return NextResponse.json(getOrCreatePlan(params.flightId));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { flightId: string } },
) {
  const body = await req.json() as Partial<FlightPlan>;

  if (API_URL) {
    const token = await authToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const res = await fetch(`${API_URL}/planning/flight-plans/${params.flightId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }

  const current = getOrCreatePlan(params.flightId);
  if (current.status === 'released') {
    return NextResponse.json({ error: 'plan is released and immutable' }, { status: 409 });
  }
  const next: FlightPlan = {
    ...current,
    ...body,
    flightId: current.flightId,
    createdAt: current.createdAt,
    phases: { ...current.phases, ...(body.phases ?? {}) },
  };
  return NextResponse.json(savePlan(next));
}
