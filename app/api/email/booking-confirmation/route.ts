import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface BookingEmailPayload {
  to: string;
  pnr: string;
  bookingId: string;
  flight: {
    airline: { code: string; name: string };
    flightNumber: string;
    origin: { code: string; city: string };
    destination: { code: string; city: string };
    departureTime: string;
    arrivalTime?: string;
    totalDuration: string;
  };
  passengers: { firstName: string; lastName: string; seat?: string }[];
  priceBreakdown: {
    baseFare: number;
    taxes: number;
    fees: number;
    seatFees: number;
    baggageFees: number;
    total: number;
  };
  baggage?: {
    carry: string;
    carryIncluded: boolean;
    checked: string;
    checkedIncluded: boolean;
  };
  cabinClass: string;
  bookedAt: string;
  appUrl: string;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return iso;
  }
}

function buildHtml(p: BookingEmailPayload): string {
  const seatsAssigned = p.passengers.some((px) => px.seat);
  const passengerRows = p.passengers.map((px, i) =>
    `<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:10px 0;color:#111;font-weight:500">${px.firstName} ${px.lastName}</td>
      <td style="padding:10px 0;color:#555;text-align:center">${i < p.passengers.length ? (i < (p.passengers.length) ? 'Adult' : 'Child') : ''}</td>
      ${seatsAssigned ? `<td style="padding:10px 0;color:#1a56db;font-weight:600;text-align:center">${px.seat ?? '—'}</td>` : ''}
    </tr>`
  ).join('');

  const baggageHtml = p.baggage ? `
    <tr><td style="padding:0 40px 20px">
      <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#111">Baggage</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#555">✓ Carry-on</td>
          <td style="padding:5px 0;font-size:13px;color:#16a34a;text-align:right">${p.baggage.carry} — Included</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#555">${p.baggage.checkedIncluded ? '✓' : '–'} Checked bag</td>
          <td style="padding:5px 0;font-size:13px;color:${p.baggage.checkedIncluded ? '#16a34a' : '#9ca3af'};text-align:right">
            ${p.baggage.checkedIncluded ? `${p.baggage.checked} — Included` : 'Not included'}
          </td>
        </tr>
      </table>
    </td></tr>` : '';

  const priceRows = [
    ['Base Fare', p.priceBreakdown.baseFare],
    ['Taxes & Charges', p.priceBreakdown.taxes],
    ['Booking Fee', p.priceBreakdown.fees],
    ...(p.priceBreakdown.seatFees > 0 ? [['Seat Selection', p.priceBreakdown.seatFees] as [string, number]] : []),
    ...(p.priceBreakdown.baggageFees > 0 ? [['Checked Baggage', p.priceBreakdown.baggageFees] as [string, number]] : []),
  ].map(([label, amount]) =>
    `<tr>
      <td style="padding:6px 0;color:#555;font-size:13px">${label}</td>
      <td style="padding:6px 0;color:#111;font-size:13px;text-align:right">$${(amount as number).toLocaleString()}</td>
    </tr>`
  ).join('');

  const bookingUrl = `${p.appUrl}/bookings/${p.pnr}`;
  const cabinLabel = p.cabinClass.charAt(0).toUpperCase() + p.cabinClass.slice(1);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Booking Confirmation – ${p.pnr}</title></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a56db,#2563eb);padding:32px 40px;text-align:center">
            <p style="margin:0;font-size:28px">✈️</p>
            <h1 style="margin:8px 0 4px;color:#fff;font-size:22px;font-weight:700">Booking Confirmed!</h1>
            <p style="margin:0;color:#bfdbfe;font-size:14px">Your flight is reserved. Have a great trip!</p>
          </td>
        </tr>

        <!-- PNR badge -->
        <tr>
          <td style="padding:24px 40px 0;text-align:center">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Booking Reference</p>
            <p style="margin:0;font-size:32px;font-weight:800;letter-spacing:.18em;color:#1a56db">${p.pnr}</p>
          </td>
        </tr>

        <!-- Flight details -->
        <tr>
          <td style="padding:24px 40px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border-radius:12px;padding:20px">
              <tr>
                <td>
                  <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.07em">Flight</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#111">${p.flight.airline.name} · ${p.flight.flightNumber}</p>
                  <p style="margin:4px 0 0;color:#555;font-size:13px">${cabinLabel} class · ${p.flight.totalDuration}</p>
                </td>
              </tr>
              <tr><td style="padding-top:16px">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="text-align:left">
                      <p style="margin:0;font-size:22px;font-weight:800;color:#111">${p.flight.origin.code}</p>
                      <p style="margin:2px 0 0;color:#6b7280;font-size:12px">${p.flight.origin.city}</p>
                      <p style="margin:6px 0 0;color:#374151;font-size:12px">${formatDate(p.flight.departureTime)}</p>
                    </td>
                    <td style="text-align:center;color:#9ca3af;font-size:20px">→</td>
                    <td style="text-align:right">
                      <p style="margin:0;font-size:22px;font-weight:800;color:#111">${p.flight.destination.code}</p>
                      <p style="margin:2px 0 0;color:#6b7280;font-size:12px">${p.flight.destination.city}</p>
                      ${p.flight.arrivalTime ? `<p style="margin:6px 0 0;color:#374151;font-size:12px">${formatDate(p.flight.arrivalTime)}</p>` : ''}
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Baggage -->
        ${baggageHtml}

        <!-- Passengers -->
        <tr>
          <td style="padding:0 40px 24px">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111">Passengers</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="border-bottom:2px solid #e5e7eb">
                <th style="text-align:left;padding-bottom:8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.07em">Name</th>
                <th style="text-align:center;padding-bottom:8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.07em">Type</th>
                ${seatsAssigned ? '<th style="text-align:center;padding-bottom:8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.07em">Seat</th>' : ''}
              </tr>
              ${passengerRows}
            </table>
          </td>
        </tr>

        <!-- Price -->
        <tr>
          <td style="padding:0 40px 24px">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111">Price Breakdown</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${priceRows}
              <tr style="border-top:2px solid #e5e7eb">
                <td style="padding:12px 0 0;font-weight:700;font-size:15px;color:#111">Total Paid</td>
                <td style="padding:12px 0 0;font-weight:800;font-size:18px;color:#16a34a;text-align:right">$${p.priceBreakdown.total.toLocaleString()}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 32px;text-align:center">
            <a href="${bookingUrl}"
               style="display:inline-block;padding:14px 36px;background:#1a56db;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">
              View Booking Details
            </a>
            <p style="margin:16px 0 0;color:#9ca3af;font-size:12px">
              Or paste this URL: <a href="${bookingUrl}" style="color:#1a56db">${bookingUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:12px">
              Booked on ${new Date(p.bookedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })} ·
              Ref: ${p.bookingId}
            </p>
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

  const payload: BookingEmailPayload = await req.json();

  if (!payload.to || !payload.pnr) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const appUrl = payload.appUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const html = buildHtml({ ...payload, appUrl });

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'AirlineOS <onboarding@resend.dev>',
    to: payload.to,
    subject: `Booking Confirmed – ${payload.pnr} | ${payload.flight.origin.code} → ${payload.flight.destination.code}`,
    html,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}
