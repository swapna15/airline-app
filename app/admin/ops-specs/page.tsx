'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, Save, AlertTriangle, FileText } from 'lucide-react';
import { DEFAULT_OPS_SPECS, type OpsSpecs } from '@/lib/ops-specs';

export default function OpsSpecsPage() {
  const [data, setData] = useState<OpsSpecs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/ops-specs')
      .then((r) => r.json())
      .then((d: OpsSpecs) => setData(d))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const update = <K extends keyof OpsSpecs>(key: K, value: OpsSpecs[K]) => {
    if (!data) return;
    setData({ ...data, [key]: value });
  };

  const updateFuel = <K extends keyof OpsSpecs['fuelPolicy']>(k: K, v: OpsSpecs['fuelPolicy'][K]) => {
    if (!data) return;
    setData({ ...data, fuelPolicy: { ...data.fuelPolicy, [k]: v } });
  };

  const updateAlt = <K extends keyof OpsSpecs['alternateMinima']>(k: K, v: OpsSpecs['alternateMinima'][K]) => {
    if (!data) return;
    setData({ ...data, alternateMinima: { ...data.alternateMinima, [k]: v } });
  };

  const updateEtops = <K extends keyof OpsSpecs['etopsApproval']>(k: K, v: OpsSpecs['etopsApproval'][K]) => {
    if (!data) return;
    setData({ ...data, etopsApproval: { ...data.etopsApproval, [k]: v } });
  };

  const save = async () => {
    if (!data) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/ops-specs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || `HTTP ${res.status}`);
        return;
      }
      const fresh = await res.json() as OpsSpecs;
      setData(fresh);
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ChevronLeft size={12} /> Admin
        </Link>
      </div>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="text-amber-600" size={22} /> Operations Specifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Per-tenant operating policies. Fuel policy is consumed by the planner&apos;s fuel
            phase today; alternate minima, ETOPS approval, PBN, cost index, and authorized
            airports are stored and surfaced in subsequent slices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-xs text-green-700">saved {savedAt}</span>}
          <button onClick={save} disabled={saving || !data}
            className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm flex items-center gap-2 hover:bg-amber-700 disabled:bg-gray-200">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2 mb-4">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {loading || !data ? (
        <div className="text-sm text-gray-500 py-12 text-center">
          <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Fuel policy */}
          <Section title="Fuel policy" subtitle="Airline adders on top of regulatory minima — the planner's fuel phase reads these.">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Contingency (% of trip)" value={data.fuelPolicy.contingencyPct}
                onChange={(v) => updateFuel('contingencyPct', v)} step={0.5} />
              <NumField label="Alternate (min @ cruise)" value={data.fuelPolicy.alternateMinutes}
                onChange={(v) => updateFuel('alternateMinutes', v)} />
              <NumField label="Final reserve (min)" value={data.fuelPolicy.finalReserveMinutes}
                onChange={(v) => updateFuel('finalReserveMinutes', v)} />
              <NumField label="Taxi fuel (kg)" value={data.fuelPolicy.taxiKg}
                onChange={(v) => updateFuel('taxiKg', v)} />
              <NumField label="Captain's fuel (min, discretionary)" value={data.fuelPolicy.captainsFuelMinutes}
                onChange={(v) => updateFuel('captainsFuelMinutes', v)} />
              <Field label="Tankering enabled">
                <input
                  type="checkbox"
                  checked={data.fuelPolicy.tankeringEnabled}
                  onChange={(e) => updateFuel('tankeringEnabled', e.target.checked)}
                  className="accent-amber-600 mt-2"
                />
              </Field>
            </div>
          </Section>

          {/* Alternate minima (C055) */}
          <Section title="Alternate weather minima (C055)" subtitle="Ceilings + visibility thresholds for destination and alternates.">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Destination ceiling (ft)" value={data.alternateMinima.destinationCeilingFt}
                onChange={(v) => updateAlt('destinationCeilingFt', v)} />
              <NumField label="Destination visibility (sm)" value={data.alternateMinima.destinationVisSm}
                onChange={(v) => updateAlt('destinationVisSm', v)} step={0.5} />
              <NumField label="Alternate ceiling (ft)" value={data.alternateMinima.alternateCeilingFt}
                onChange={(v) => updateAlt('alternateCeilingFt', v)} />
              <NumField label="Alternate visibility (sm)" value={data.alternateMinima.alternateVisSm}
                onChange={(v) => updateAlt('alternateVisSm', v)} step={0.5} />
            </div>
          </Section>

          {/* ETOPS (B044) */}
          <Section title="ETOPS approval (B044)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max minutes from alternate">
                <select
                  value={data.etopsApproval.maxMinutes}
                  onChange={(e) => updateEtops('maxMinutes', parseInt(e.target.value, 10))}
                  className="input"
                >
                  {[0, 60, 120, 138, 180, 207, 240, 330, 370].map((m) => (
                    <option key={m} value={m}>{m === 0 ? 'no ETOPS' : `${m} min`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Authorized types (comma-separated ICAO)">
                <input
                  value={data.etopsApproval.authorizedTypes.join(', ')}
                  onChange={(e) => updateEtops('authorizedTypes',
                    e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))}
                  placeholder="B77W, B789, A333, A359"
                  className="input font-mono text-xs"
                />
              </Field>
            </div>
          </Section>

          {/* PBN */}
          <Section title="PBN authorizations (B036 / C063)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="RNAV levels">
                <input
                  value={(data.pbnAuthorizations.rnavLevels ?? []).join(', ')}
                  onChange={(e) => update('pbnAuthorizations', {
                    ...data.pbnAuthorizations,
                    rnavLevels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })}
                  className="input font-mono text-xs"
                />
              </Field>
              <Field label="RNP levels">
                <input
                  value={(data.pbnAuthorizations.rnpLevels ?? []).join(', ')}
                  onChange={(e) => update('pbnAuthorizations', {
                    ...data.pbnAuthorizations,
                    rnpLevels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })}
                  className="input font-mono text-xs"
                />
              </Field>
            </div>
          </Section>

          {/* Cost index */}
          <Section title="Cost index">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Default CI" value={data.costIndex.default}
                onChange={(v) => update('costIndex', { ...data.costIndex, default: v })} />
              <Field label="By type (JSON)">
                <textarea
                  value={JSON.stringify(data.costIndex.byType ?? {}, null, 2)}
                  onChange={(e) => {
                    try {
                      update('costIndex', { ...data.costIndex, byType: JSON.parse(e.target.value) });
                    } catch { /* keep typing — accept invalid JSON until parseable */ }
                  }}
                  className="input font-mono text-xs"
                  rows={3}
                />
              </Field>
            </div>
          </Section>

          {/* Authorized airports */}
          <Section title="Authorized airports (A030 / A032)" subtitle="ICAO codes the airline is authorized to operate to. Empty = no restriction.">
            <textarea
              value={data.authorizedAirports.join(', ')}
              onChange={(e) => update('authorizedAirports',
                e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))}
              placeholder="KJFK, EGLL, EDDF, …"
              className="input w-full font-mono text-xs"
              rows={3}
            />
          </Section>

          <Section title="Notes">
            <textarea
              value={data.notes ?? ''}
              onChange={(e) => update('notes', e.target.value)}
              className="input w-full text-sm"
              rows={2}
              placeholder="Free-text — visible to admins only."
            />
          </Section>
        </div>
      )}

      <style jsx>{`
        .input {
          padding: 0.375rem 0.625rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          background: white;
          width: 100%;
        }
      `}</style>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      {children}
    </section>
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

function NumField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value ?? ''}
        step={step ?? 1}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="input"
      />
    </Field>
  );
}

void DEFAULT_OPS_SPECS;
