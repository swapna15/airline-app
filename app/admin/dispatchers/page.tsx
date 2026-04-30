'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertTriangle, CheckCircle2, RefreshCw, IdCard } from 'lucide-react';

interface DispatcherSummary {
  userId: string;
  email: string;
  name: string;
  role: string;
  certificate: {
    certNumber: string;
    issuingAuthority: string;
    status: string;
    expiresAt: string | null;
  } | null;
  expiredCurrencyCount: number;
}

interface DispatcherDetail {
  user: { id: string; email: string; name: string; role: string };
  certificate: {
    id: string;
    cert_number: string;
    issuing_authority: string;
    issued_at: string;
    expires_at: string | null;
    status: 'active' | 'suspended' | 'revoked';
    notes: string | null;
  } | null;
  areas:       { area_code: string; qualified_at: string }[];
  typeRatings: { type_code: string; qualified_at: string }[];
  currency:    { group_code: string; last_familiarization_at: string; expires_at: string; notes: string | null }[];
}

export default function DispatchersPage() {
  const [list, setList] = useState<DispatcherSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [localMode, setLocalMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DispatcherDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = () => {
    setLoading(true);
    fetch('/api/admin/dispatchers')
      .then((r) => r.json())
      .then((d: { dispatchers?: DispatcherSummary[]; localMode?: boolean }) => {
        setList(Array.isArray(d.dispatchers) ? d.dispatchers : []);
        setLocalMode(!!d.localMode);
      })
      .finally(() => setLoading(false));
  };
  useEffect(loadList, []);

  const loadDetail = (userId: string) => {
    setSelectedId(userId);
    setDetailLoading(true);
    fetch(`/api/admin/dispatchers/${userId}`)
      .then((r) => r.json())
      .then((d: DispatcherDetail) => setDetail(d))
      .finally(() => setDetailLoading(false));
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ChevronLeft size={12} /> Admin
        </Link>
      </div>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <IdCard className="text-indigo-600" size={22} /> Dispatcher certifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            FAA Aircraft Dispatcher Certificate / FOO license records, area + type qualifications,
            and §121.463(c) recurrent-familiarization currency. Releases are blocked when any
            currency record has expired.
          </p>
        </div>
        <button onClick={loadList} disabled={loading}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm flex items-center gap-2 hover:bg-gray-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reload
        </button>
      </header>

      {localMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} />
          <span>Local mode — set <code>NEXT_PUBLIC_API_URL</code> to manage dispatchers in the deployed Postgres.</span>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* List */}
        <aside className="col-span-5">
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">User</th>
                  <th className="text-left px-3 py-2 font-medium">Cert</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                    <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
                  </td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                    No flight planners on this tenant.
                  </td></tr>
                ) : list.map((d) => {
                  const isSel = selectedId === d.userId;
                  return (
                    <tr
                      key={d.userId}
                      onClick={() => loadDetail(d.userId)}
                      className={`cursor-pointer border-t border-gray-100 ${
                        isSel ? 'bg-indigo-50/40' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-sm">{d.name}</p>
                        <p className="text-xs text-gray-500">{d.email} · {d.role}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {d.certificate ? (
                          <>
                            <p className="font-mono">{d.certificate.certNumber}</p>
                            <p className="text-gray-500">{d.certificate.issuingAuthority}</p>
                          </>
                        ) : (
                          <span className="text-amber-600">none</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!d.certificate ? (
                          <span className="text-amber-600">no cert</span>
                        ) : d.certificate.status !== 'active' ? (
                          <span className="text-red-600">{d.certificate.status}</span>
                        ) : d.expiredCurrencyCount > 0 ? (
                          <span className="text-red-600">
                            {d.expiredCurrencyCount} expired
                          </span>
                        ) : (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle2 size={11} /> current
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </aside>

        {/* Detail */}
        <section className="col-span-7">
          {!selectedId ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-500">
              Select a dispatcher on the left to view or edit certification.
            </div>
          ) : detailLoading || !detail ? (
            <div className="rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
            </div>
          ) : (
            <DetailCard detail={detail} onSaved={() => { loadList(); loadDetail(selectedId); }} />
          )}
        </section>
      </div>
    </div>
  );
}

function DetailCard({ detail, onSaved }: { detail: DispatcherDetail; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local edit state
  const [certNumber, setCertNumber] = useState(detail.certificate?.cert_number ?? '');
  const [issuingAuthority, setIssuingAuthority] = useState(detail.certificate?.issuing_authority ?? 'FAA');
  const [issuedAt, setIssuedAt] = useState(detail.certificate?.issued_at ?? '');
  const [expiresAt, setExpiresAt] = useState(detail.certificate?.expires_at ?? '');
  const [status, setStatus] = useState(detail.certificate?.status ?? 'active');
  const [areas, setAreas] = useState(detail.areas.map((a) => a.area_code).join(', '));
  const [types, setTypes] = useState(detail.typeRatings.map((t) => t.type_code).join(', '));
  const [groupCode, setGroupCode] = useState('WIDEBODY');
  const [familiarizationAt, setFamiliarizationAt] = useState('');

  const userId = detail.user.id;

  const post = async (kind: string, path: string, body: unknown) => {
    setBusy(kind); setError(null);
    try {
      const res = await fetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || `HTTP ${res.status}`);
        return;
      }
      onSaved();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
      <div>
        <p className="text-sm font-semibold">{detail.user.name}</p>
        <p className="text-xs text-gray-500">{detail.user.email} · {detail.user.role}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Certificate */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Certificate</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Cert number">
            <input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} className="input" />
          </Field>
          <Field label="Issuing authority">
            <select value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)} className="input">
              <option value="FAA">FAA (US Part 65)</option>
              <option value="EASA-OP-TRAINED">EASA (operator-trained)</option>
              <option value="TC">Transport Canada</option>
              <option value="DGCA">DGCA (India)</option>
              <option value="ICAO-FOO">ICAO FOO</option>
            </select>
          </Field>
          <Field label="Issued at">
            <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} className="input" />
          </Field>
          <Field label="Expires at (blank = no expiry)">
            <input type="date" value={expiresAt ?? ''} onChange={(e) => setExpiresAt(e.target.value)} className="input" />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'suspended' | 'revoked')} className="input">
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="revoked">revoked</option>
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <button
            onClick={() => post('cert', `/api/admin/dispatchers/${userId}`, {
              certNumber, issuingAuthority, issuedAt, expiresAt: expiresAt || null, status,
            })}
            disabled={busy !== null || !certNumber || !issuedAt}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:bg-gray-200 hover:bg-indigo-700"
          >
            {busy === 'cert' ? 'Saving…' : 'Save certificate'}
          </button>
        </div>
      </section>

      {/* Areas / Types */}
      <section className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Areas of operation</h3>
          <input
            value={areas}
            onChange={(e) => setAreas(e.target.value)}
            placeholder="CONUS, NAT, NOPAC, ETOPS-180, RNP-AR"
            className="input w-full text-xs font-mono"
          />
          <button
            onClick={() => post('areas', `/api/admin/dispatchers/${userId}/areas`, {
              areas: areas.split(',').map((s) => s.trim()).filter(Boolean),
            })}
            disabled={busy !== null}
            className="mt-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs hover:bg-gray-50"
          >
            {busy === 'areas' ? 'Saving…' : 'Save areas'}
          </button>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Type ratings</h3>
          <input
            value={types}
            onChange={(e) => setTypes(e.target.value)}
            placeholder="B777, A330, A380, B787"
            className="input w-full text-xs font-mono"
          />
          <button
            onClick={() => post('types', `/api/admin/dispatchers/${userId}/types`, {
              types: types.split(',').map((s) => s.trim()).filter(Boolean),
            })}
            disabled={busy !== null}
            className="mt-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs hover:bg-gray-50"
          >
            {busy === 'types' ? 'Saving…' : 'Save types'}
          </button>
        </div>
      </section>

      {/* Currency */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          §121.463(c) recurrent currency
        </h3>
        <ul className="text-xs space-y-1.5 mb-3">
          {detail.currency.length === 0 ? (
            <li className="text-gray-500">No currency records.</li>
          ) : detail.currency.map((c) => {
            const expired = new Date(c.expires_at).getTime() < Date.now();
            return (
              <li key={c.group_code} className={`flex items-center gap-2 ${expired ? 'text-red-700' : ''}`}>
                {expired ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} className="text-green-600" />}
                <span className="font-mono">{c.group_code}</span>
                <span className="text-gray-500">last {c.last_familiarization_at}</span>
                <span className={expired ? 'text-red-600' : 'text-gray-500'}>· expires {c.expires_at}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Group code">
            <input value={groupCode} onChange={(e) => setGroupCode(e.target.value.toUpperCase())} className="input" />
          </Field>
          <Field label="Last familiarization">
            <input type="date" value={familiarizationAt} onChange={(e) => setFamiliarizationAt(e.target.value)} className="input" />
          </Field>
          <button
            onClick={() => post('currency', `/api/admin/dispatchers/${userId}/currency`, {
              groupCode, lastFamiliarizationAt: familiarizationAt,
            })}
            disabled={busy !== null || !groupCode || !familiarizationAt}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:bg-gray-200 hover:bg-indigo-700"
          >
            {busy === 'currency' ? 'Saving…' : 'Upsert currency'}
          </button>
        </div>
      </section>

      <style jsx>{`
        .input {
          padding: 0.375rem 0.625rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          background: white;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}
