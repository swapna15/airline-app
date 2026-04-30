'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, Database, ServerCog, RefreshCw, ChevronLeft, AlertTriangle,
  CheckCircle2, XCircle, Save, Trash2, Beaker,
} from 'lucide-react';

type Kind = 'fuel_price' | 'mel' | 'crew';

interface HealthResult {
  ok: boolean;
  latencyMs?: number;
  recordCount?: number;
  checkedAt: string;
  error?: string;
}

interface Row {
  kind: Kind;
  source: 'store' | 'env';
  provider: string;
  config: Record<string, string | undefined>;
  enabled: boolean;
  lastHealth?: HealthResult;
  updatedAt?: string;
}

const KIND_META: Record<Kind, { title: string; subtitle: string; providerOptions: { value: string; label: string }[]; configFields: Field[]; }> = {
  fuel_price: {
    title: 'Fuel prices',
    subtitle: 'Per-station jet-A prices used by the tankering advisor',
    providerOptions: [
      { value: 'mock',    label: 'Mock (in-repo table)' },
      { value: 'csv',     label: 'CSV (S3 / file / HTTPS)' },
      { value: 'api_fms', label: 'REST API (FMS)' },
    ],
    configFields: [
      { key: 'uri',         label: 'CSV URI',                hint: 's3://bucket/key  •  file:///path  •  https://...', when: ['csv'] },
      { key: 'authorization', label: 'CSV Authorization (https only, optional)', hint: 'Bearer …  •  Basic …', when: ['csv'], type: 'secret' },
      { key: 'url',         label: 'API endpoint URL',       hint: 'https://fms.airline.internal/api/v1/jet-prices', when: ['api_fms'] },
      { key: 'authMethod',  label: 'Auth method',            hint: 'bearer • basic • header', when: ['api_fms'], options: ['bearer', 'basic', 'header'] },
      { key: 'tokenRef',    label: 'API token / reference',  hint: 'env://FMS_TOKEN  •  secretsmanager:arn:…  •  raw token', when: ['api_fms'], type: 'secret' },
      { key: 'tokenHeader', label: 'Token header (only when method=header)', hint: 'X-API-Key', when: ['api_fms'] },
    ],
  },
  mel: {
    title: 'MEL deferrals',
    subtitle: 'Per-tail deferred maintenance items used by the MEL impact assessor',
    providerOptions: [
      { value: 'mock',     label: 'Mock (in-repo deferrals)' },
      { value: 'csv',      label: 'CSV (S3 / file / HTTPS)' },
      { value: 'api_amos', label: 'REST API (AMOS)' },
      { value: 'api_trax', label: 'REST API (TRAX)' },
      { value: 'api_camo', label: 'REST API (CAMO middleware)' },
    ],
    configFields: [
      { key: 'uri',          label: 'CSV URI', hint: 's3://… • file://… • https://…', when: ['csv'] },
      { key: 'authorization', label: 'CSV Authorization', when: ['csv'], type: 'secret' },
      { key: 'url',          label: 'API endpoint URL', hint: '…/deferrals',     when: ['api_amos', 'api_trax', 'api_camo'] },
      { key: 'authMethod',   label: 'Auth method', options: ['bearer', 'basic', 'header'], when: ['api_amos', 'api_trax', 'api_camo'] },
      { key: 'tokenRef',     label: 'API token / reference', when: ['api_amos', 'api_trax', 'api_camo'], type: 'secret' },
      { key: 'tokenHeader',  label: 'Token header (only when method=header)', when: ['api_amos', 'api_trax', 'api_camo'] },
    ],
  },
  crew: {
    title: 'Crew roster + assignments',
    subtitle: 'Pilot/FO roster + today’s flight pairings used by the deconfliction tool',
    providerOptions: [
      { value: 'mock',         label: 'Mock (in-repo roster)' },
      { value: 'csv',          label: 'CSV (two URIs — roster + assignments)' },
      { value: 'api_sabre',    label: 'REST API (Sabre)' },
      { value: 'api_jeppesen', label: 'REST API (Jeppesen)' },
      { value: 'api_aims',     label: 'REST API (AIMS)' },
    ],
    configFields: [
      { key: 'rosterUri',      label: 'Roster CSV URI',      when: ['csv'] },
      { key: 'assignmentsUri', label: 'Assignments CSV URI', when: ['csv'] },
      { key: 'authorization',  label: 'CSV Authorization',   when: ['csv'], type: 'secret' },
      { key: 'rosterUrl',      label: 'Roster API URL',       when: ['api_sabre', 'api_jeppesen', 'api_aims'] },
      { key: 'assignmentsUrl', label: 'Assignments API URL',  when: ['api_sabre', 'api_jeppesen', 'api_aims'] },
      { key: 'authMethod',     label: 'Auth method', options: ['bearer', 'basic', 'header'], when: ['api_sabre', 'api_jeppesen', 'api_aims'] },
      { key: 'tokenRef',       label: 'API token / reference', when: ['api_sabre', 'api_jeppesen', 'api_aims'], type: 'secret' },
      { key: 'tokenHeader',    label: 'Token header (only when method=header)', when: ['api_sabre', 'api_jeppesen', 'api_aims'] },
    ],
  },
};

interface Field {
  key: string;
  label: string;
  hint?: string;
  when: string[];
  options?: string[];
  type?: 'secret';
}

export default function IntegrationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Kind | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/integrations');
      const data = await res.json().catch(() => ({} as { integrations?: Row[]; error?: string }));
      if (!res.ok) {
        setLoadError(data?.error || `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      setRows(Array.isArray(data?.integrations) ? data.integrations : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ChevronLeft size={12} /> Admin
        </Link>
      </div>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ServerCog className="text-amber-600" size={22} /> Data integrations
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Choose the data source for each planning input. Defaults to in-repo mock data;
            switch to a CSV drop or a live REST endpoint without redeploying.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm flex items-center gap-2 hover:bg-gray-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reload
        </button>
      </header>

      {loadError && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Failed to load integrations: {loadError}</p>
            <p className="text-xs mt-1 text-red-600">
              If you have <code>NEXT_PUBLIC_API_URL</code> set, this likely means your session has no
              upstream JWT. Unset it to use the local in-memory store, or sign in via the deployed
              backend.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {rows.map((r) => (
          <IntegrationRow
            key={r.kind} row={r}
            editing={editing === r.kind}
            onEdit={() => setEditing(editing === r.kind ? null : r.kind)}
            onChanged={() => { setEditing(null); load(); }}
          />
        ))}
      </div>
    </div>
  );
}

function IntegrationRow({ row, editing, onEdit, onChanged }: {
  row: Row; editing: boolean; onEdit: () => void; onChanged: () => void;
}) {
  const meta = KIND_META[row.kind];
  return (
    <div className="border border-gray-200 rounded-xl bg-white">
      <div className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Database size={14} className="text-gray-400" />
            {meta.title}
            {row.source === 'env' && (
              <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">env-default</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{meta.subtitle}</div>
          <div className="text-xs text-gray-700 mt-2">
            provider: <span className="font-medium">{row.provider}</span>
          </div>
        </div>
        <HealthPill h={row.lastHealth} />
        <button onClick={onEdit} className="px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>
      {editing && <EditForm row={row} onChanged={onChanged} />}
    </div>
  );
}

function HealthPill({ h }: { h?: HealthResult }) {
  if (!h) return <span className="text-[11px] text-gray-400">untested</span>;
  if (!h.ok) {
    return (
      <span title={h.error} className="text-[11px] text-red-700 flex items-center gap-1">
        <XCircle size={12} /> failed
      </span>
    );
  }
  return (
    <span className="text-[11px] text-green-700 flex items-center gap-1">
      <CheckCircle2 size={12} /> ok · {h.latencyMs}ms · {h.recordCount} rows
    </span>
  );
}

function EditForm({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const meta = KIND_META[row.kind];
  const [provider, setProvider] = useState(row.provider);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(row.config)) c[k] = v ?? '';
    return c;
  });
  const [busy, setBusy] = useState<'test' | 'save' | 'delete' | null>(null);
  const [testResult, setTestResult] = useState<HealthResult | null>(null);

  const fields = meta.configFields.filter((f) => f.when.includes(provider));

  const update = (k: string, v: string) => setConfig((s) => ({ ...s, [k]: v }));

  const test = async () => {
    setBusy('test'); setTestResult(null);
    try {
      const res = await fetch(`/api/admin/integrations/${row.kind}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, config }),
      });
      setTestResult(await res.json());
    } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy('save');
    try {
      await fetch(`/api/admin/integrations/${row.kind}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, config, enabled: true }),
      });
      onChanged();
    } finally { setBusy(null); }
  };

  const remove = async () => {
    if (!confirm(`Reset ${row.kind} to env defaults?`)) return;
    setBusy('delete');
    try {
      await fetch(`/api/admin/integrations/${row.kind}`, { method: 'DELETE' });
      onChanged();
    } finally { setBusy(null); }
  };

  return (
    <div className="border-t border-gray-200 p-4 bg-gray-50/40">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <label className="block text-xs font-medium text-gray-500 mb-1">Provider</label>
          <select
            value={provider} onChange={(e) => setProvider(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            {meta.providerOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {fields.map((f) => (
          <div key={f.key} className="col-span-12">
            <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
            {f.options ? (
              <select
                value={config[f.key] ?? f.options[0]}
                onChange={(e) => update(f.key, e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type === 'secret' ? 'password' : 'text'}
                value={config[f.key] ?? ''}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.hint}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white font-mono"
              />
            )}
            {f.hint && <p className="text-[11px] text-gray-400 mt-1">{f.hint}</p>}
          </div>
        ))}
      </div>

      {testResult && (
        <div className={`mt-3 p-3 rounded-lg text-xs ${testResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <div className="flex items-center gap-1.5 font-medium">
            {testResult.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {testResult.ok ? `OK · ${testResult.latencyMs}ms · ${testResult.recordCount} rows` : 'Test failed'}
          </div>
          {testResult.error && <div className="mt-1 font-mono whitespace-pre-wrap">{testResult.error}</div>}
        </div>
      )}

      <div className="mt-4 flex gap-2 justify-end">
        {row.source === 'store' && (
          <button onClick={remove} disabled={!!busy}
            className="px-3 py-2 rounded-lg border border-red-200 text-sm text-red-700 hover:bg-red-50 flex items-center gap-1">
            <Trash2 size={12} /> Reset to default
          </button>
        )}
        <button onClick={test} disabled={!!busy}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 flex items-center gap-1">
          {busy === 'test' ? <Loader2 size={12} className="animate-spin" /> : <Beaker size={12} />} Test connection
        </button>
        <button onClick={save} disabled={!!busy}
          className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:bg-gray-200 flex items-center gap-1">
          {busy === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
        </button>
      </div>
    </div>
  );
}
