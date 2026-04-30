'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, Plus, Trash2, Brain } from 'lucide-react';

type Scope = 'fuel' | 'route' | 'crew' | 'aircraft' | 'brief' | 'release' | 'general';

interface Fact {
  id: string;
  tenantId: string;
  scope: Scope;
  title: string;
  body: string;
  source: 'manual' | 'extracted' | 'imported';
  tags?: string[];
  createdAt: string;
}

const SCOPES: Scope[] = ['general', 'brief', 'route', 'fuel', 'aircraft', 'crew', 'release'];

const SCOPE_HINT: Record<Scope, string> = {
  general:  'Applies to every phase',
  brief:    'Pre-flight weather + NOTAM briefing',
  route:    'Filed route + PBN',
  fuel:     'Fuel decomposition + tankering',
  aircraft: 'Tail/MEL/ETOPS narrative',
  crew:     'Crew assignment + fatigue',
  release:  'Release / go-no-go synthesis',
};

export default function AiMemoryAdminPage() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterScope, setFilterScope] = useState<Scope | 'all'>('all');

  const [draft, setDraft] = useState({
    scope: 'general' as Scope,
    title: '',
    body: '',
    tags: '',
  });

  const load = () => {
    setLoading(true);
    fetch('/api/admin/ai/memory')
      .then((r) => r.json())
      .then((d: { facts: Fact[] }) => setFacts(d.facts ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: draft.scope,
          title: draft.title.trim(),
          body: draft.body.trim(),
          source: 'manual',
          tags: draft.tags ? draft.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        }),
      });
      if (res.ok) {
        setDraft({ scope: 'general', title: '', body: '', tags: '' });
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/ai/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  };

  const visible = filterScope === 'all' ? facts : facts.filter((f) => f.scope === filterScope);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ChevronLeft size={12} /> Admin
        </Link>
      </div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="text-indigo-600" size={22} /> AI Memory
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Per-tenant facts the planning agents retrieve via RAG. Each fact is embedded and
          surfaces during the relevant phase when semantically related to the current flight.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 p-4 mb-6 bg-gray-50/50">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <Plus size={14} /> New fact
        </h2>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-3">
            <label className="block text-xs text-gray-500 mb-1">Scope</label>
            <select
              value={draft.scope}
              onChange={(e) => setDraft({ ...draft, scope: e.target.value as Scope })}
              className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm bg-white"
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">{SCOPE_HINT[draft.scope]}</p>
          </div>
          <div className="col-span-9">
            <label className="block text-xs text-gray-500 mb-1">Title</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Tankering threshold raised after Q3 2025 fuel volatility"
              className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm"
            />
          </div>
          <div className="col-span-12">
            <label className="block text-xs text-gray-500 mb-1">Body</label>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={3}
              placeholder="Free-form fact the agent should know — when this airline does X, why it does X, what to flag."
              className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm"
            />
          </div>
          <div className="col-span-9">
            <label className="block text-xs text-gray-500 mb-1">Tags (comma-separated)</label>
            <input
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              placeholder="oceanic, b77w, winter"
              className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm"
            />
          </div>
          <div className="col-span-3 flex items-end">
            <button
              onClick={save}
              disabled={saving || !draft.title.trim() || !draft.body.trim()}
              className="w-full px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-200 transition-colors flex items-center justify-center gap-1"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {saving ? 'Saving' : 'Add fact'}
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className="text-xs text-gray-500 uppercase tracking-wide">Filter</span>
        <button
          onClick={() => setFilterScope('all')}
          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
            filterScope === 'all' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:bg-gray-50'
          }`}
        >
          all ({facts.length})
        </button>
        {SCOPES.map((s) => {
          const count = facts.filter((f) => f.scope === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilterScope(s)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                filterScope === s ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-sm text-gray-500 gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading facts…
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 p-8 text-center border border-dashed border-gray-200 rounded-xl">
          No facts yet. Add the first one above — it will be embedded and retrieved during planning.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((f) => (
            <li key={f.id} className="border border-gray-200 rounded-xl p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {f.scope}
                    </span>
                    <span className="font-semibold text-sm">{f.title}</span>
                    {f.tags?.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-700 whitespace-pre-line">{f.body}</p>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    {f.source} · {new Date(f.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => remove(f.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete fact"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
