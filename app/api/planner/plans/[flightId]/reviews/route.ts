import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { appendReview, listReviews, type PhaseId, type ReviewEvent } from '@/lib/planner-store';

export const maxDuration = 30;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const VALID_PHASES: ReadonlySet<string> = new Set([
  'brief', 'aircraft', 'route', 'fuel', 'weight_balance', 'crew', 'slot_atc', 'release',
]);
const VALID_ACTIONS: ReadonlySet<string> = new Set(['approve', 'reject', 'release']);

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
    const res = await fetch(`${API_URL}/planning/flight-plans/${params.flightId}/reviews`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }
  return NextResponse.json(listReviews(params.flightId));
}

export async function POST(
  req: NextRequest,
  { params }: { params: { flightId: string } },
) {
  const body = (await req.json()) as Partial<ReviewEvent>;

  if (!body.phase || !VALID_PHASES.has(body.phase)) {
    return NextResponse.json({ error: `invalid phase: ${body.phase}` }, { status: 400 });
  }
  if (!body.action || !VALID_ACTIONS.has(body.action)) {
    return NextResponse.json({ error: `invalid action: ${body.action}` }, { status: 400 });
  }
  if (body.action === 'reject' && !body.comment?.trim()) {
    return NextResponse.json({ error: 'rejection requires a comment' }, { status: 400 });
  }

  if (API_URL) {
    const token = await authToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const res = await fetch(`${API_URL}/planning/flight-plans/${params.flightId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }

  const ev = appendReview({
    flightId: params.flightId,
    phase: body.phase as PhaseId,
    action: body.action as ReviewEvent['action'],
    comment: body.comment,
    reviewerId: body.reviewerId ?? 'unknown',
  });
  return NextResponse.json(ev, { status: 201 });
}
