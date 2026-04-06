import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface CancellationEmailPayload {
  to: string;
  pnr: string;
  bookingId: string;
  flight: {
    airline: { code: string; name: string };
    flightNumber: string;
    origin: { code: string; city: string };
    destination: { code: string; city: string };
    departureTime: string;
  };
  passengers: { firstName: string; lastName: string }[];
  refundAmount: number;
  refundPercentage: number;
  refundReason: string;
  total: number;
  cancelledAt: string;
  appUrl: string;
}

function buildHtml(p: CancellationEmailPayload): string {
  const passengerList = p.passengers
    .map((px) => `<li style="padding:4px 0;color:#374151">${px.firstName} ${px.lastName}</li>`)
    .join('');

  const bookingUrl = `${p.appUrl}/bookings/${p.pnr}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Booking Cancelled – ${p.pnr}</title></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:32px 40px;text-align:center">
            <p style="margin:0;font-size:28px">❌</p>
            <h1 style="margin:8px 0 4px;color:#fff;font-size:22px;font-weight:700">Booking Cancelled</h1>
            <p style="margin:0;color:#fecaca;font-size:14px">Your booking has been successfully cancelled.</p>
          </td>
        </tr>

        <!-- PNR -->
        <tr>
          <td style="padding:24px 40px 0;text-align:center">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Cancelled Booking Reference</p>
            <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:.18em;color:#dc2626">${p.pnr}</p>
            <p style="margin:8px 0 0;color:#9ca3af;font-size:12px">Cancelled on ${new Date(p.cancelledAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </td>
        </tr>

        <!-- Refund box -->
        <tr>
          <td style="padding:24px 40px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:${p.refundAmount > 0 ? '#f0fdf4' : '#fff7ed'};border-radius:12px;padding:20px;border:1px solid ${p.refundAmount > 0 ? '#bbf7d0' : '#fed7aa'}">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:13px;color:${p.refundAmount > 0 ? '#166534' : '#9a3412'};font-weight:600">
                    ${p.refundAmount > 0 ? '💰 Refund Issued' : '⚠️ No Refund Applicable'}
                  </p>
                  ${p.refundAmount > 0 ? `
                  <p style="margin:0;font-size:28px;font-weight:800;color:#16a34a">$${p.refundAmount.toLocaleString()}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#166534">${p.refundPercentage}% of $${p.total.toLocaleString()} paid · ${p.refundReason}</p>
                  <p style="margin:8px 0 0;font-size:12px;color:#166534">Allow 5–10 business days for the refund to appear on your original payment method.</p>
                  ` : `
                  <p style="margin:4px 0 0;font-size:12px;color:#9a3412">${p.refundReason}</p>
                  `}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Flight summary -->
        <tr>
          <td style="padding:0 40px 24px">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111">Cancelled Flight</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px">
              <tr>
                <td>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#111">${p.flight.airline.name} · ${p.flight.flightNumber}</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#6b7280">${p.flight.origin.city} (${p.flight.origin.code}) → ${p.flight.destination.city} (${p.flight.destination.code})</p>
                  ${p.flight.departureTime ? `<p style="margin:4px 0 0;font-size:12px;color:#9ca3af">Was scheduled: ${new Date(p.flight.departureTime).toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Passengers -->
        <tr>
          <td style="padding:0 40px 24px">
            <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#111">Passengers</p>
            <ul style="margin:0;padding:0 0 0 16px">${passengerList}</ul>
          </td>
        </tr>

        <!-- Rebook CTA -->
        <tr>
          <td style="padding:0 40px 32px;text-align:center">
            <p style="margin:0 0 16px;font-size:13px;color:#6b7280">Need to travel on a different date?</p>
            <a href="${p.appUrl}"
               style="display:inline-block;padding:14px 36px;background:#1a56db;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">
              Search New Flights
            </a>
            <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
              View your cancelled booking: <a href="${bookingUrl}" style="color:#dc2626">${bookingUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:12px">Booking ref: ${p.bookingId}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email not configured' }, { status: 503 });
  }

  const payload: CancellationEmailPayload = await req.json();

  if (!payload.to || !payload.pnr) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const appUrl = payload.appUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const html = buildHtml({ ...payload, appUrl });

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'AirlineOS <onboarding@resend.dev>',
    to: payload.to,
    subject: `Booking Cancelled – ${payload.pnr} | ${payload.flight.origin.code} → ${payload.flight.destination.code}`,
    html,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}
