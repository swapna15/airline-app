'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Plane, DollarSign, TrendingUp, Settings, ChevronDown, Loader2, Building2, Save, Check, ServerCog, ArrowRight } from 'lucide-react';
import type { UserRole } from '@/types/roles';
import { ROLE_LABELS } from '@/types/roles';
import { AirlineLogo } from '@/components/AirlineLogo';
import { getBookingHistory, type SavedBooking } from '@/utils/bookingStore';
import { useTenant } from '@/core/tenant/context';
import type { TenantConfig } from '@/types/tenant';

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin: string;
  status: 'Active' | 'Inactive';
}

const MOCK_USERS: StaffUser[] = [
  { id: '1', name: 'Admin User',     email: 'admin@airline.com',       role: 'admin',          lastLogin: '2026-04-02', status: 'Active' },
  { id: '2', name: 'coordinator',    email: 'coordinator@airline.com', role: 'coordinator',    lastLogin: '2026-04-02', status: 'Active' },
  { id: '3', name: 'gate',           email: 'gate@airline.com',        role: 'gate_manager',   lastLogin: '2026-04-01', status: 'Active' },
  { id: '4', name: 'checkin',        email: 'checkin@airline.com',     role: 'checkin_agent',  lastLogin: '2026-04-02', status: 'Active' },
  { id: '5', name: 'Flight Planner', email: 'planner@airline.com',     role: 'flight_planner', lastLogin: '2026-04-29', status: 'Active' },
  { id: '6', name: 'Jane Doe',       email: 'jane@example.com',        role: 'passenger',      lastLogin: '2026-03-30', status: 'Active' },
  { id: '7', name: 'John Smith',     email: 'john@example.com',        role: 'passenger',      lastLogin: '2026-03-28', status: 'Inactive' },
];

const ROLE_BADGE: Record<UserRole, string> = {
  passenger: 'bg-gray-100 text-gray-600',
  checkin_agent: 'bg-green-100 text-green-700',
  gate_manager: 'bg-orange-100 text-orange-700',
  coordinator: 'bg-purple-100 text-purple-700',
  flight_planner: 'bg-amber-100 text-amber-700',
  admin: 'bg-red-100 text-red-700',
};

const STATS = [
  { label: 'Flights Today', value: '24', icon: <Plane size={18} />, color: 'text-blue-600', bg: 'bg-blue-50' },
  { label: 'Total Passengers', value: '3,847', icon: <Users size={18} />, color: 'text-purple-600', bg: 'bg-purple-50' },
  { label: "Today's Revenue", value: '$284,320', icon: <DollarSign size={18} />, color: 'text-green-600', bg: 'bg-green-50' },
  { label: 'On-time Rate', value: '91%', icon: <TrendingUp size={18} />, color: 'text-orange-600', bg: 'bg-orange-50' },
];

const ALL_ROLES: UserRole[] = ['passenger', 'checkin_agent', 'gate_manager', 'coordinator', 'flight_planner', 'admin'];

interface DuffelOrder {
  id: string;
  pnr: string;
  status: string;
  createdAt: string;
  totalAmount: string;
  currency: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  departureTime: string;
  flightNumber: string;
  airlineCode: string;
  airlineName: string;
  passengerName: string;
  cabinClass: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState(MOCK_USERS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'bookings' | 'tenant' | 'config' | 'flight_planning'>('users');
  const [orders, setOrders] = useState<DuffelOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const { tenant, allTenants, setTenantId } = useTenant();
  const [editTenant, setEditTenant] = useState<TenantConfig | null>(null);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [tenantSaved, setTenantSaved] = useState(false);

  useEffect(() => {
    if (activeTab !== 'bookings') return;
    setOrdersLoading(true);
    fetch('/api/duffel/orders')
      .then((r) => r.json())
      .then((data) => {
        const duffelOrders: DuffelOrder[] = data.orders ?? [];
        if (duffelOrders.length > 0) {
          setOrders(duffelOrders);
        } else {
          // Fall back to local booking history
          const local = getBookingHistory();
          setOrders(local.map((b: SavedBooking) => ({
            id: b.bookingId,
            pnr: b.pnr,
            status: b.status,
            createdAt: b.bookedAt,
            totalAmount: String(b.total),
            currency: 'USD',
            origin: b.flight.origin.code,
            originCity: b.flight.origin.city,
            destination: b.flight.destination.code,
            destinationCity: b.flight.destination.city,
            departureTime: b.flight.departureTime,
            flightNumber: b.flight.flightNumber,
            airlineCode: b.flight.airline.code,
            airlineName: b.flight.airline.name,
            passengerName: b.passengers.map((p) => `${p.firstName} ${p.lastName}`).join(', '),
            cabinClass: b.cabinClass,
          })));
        }
      })
      .catch(() => {
        const local = getBookingHistory();
        setOrders(local.map((b: SavedBooking) => ({
          id: b.bookingId,
          pnr: b.pnr,
          status: b.status,
          createdAt: b.bookedAt,
          totalAmount: String(b.total),
          currency: 'USD',
          origin: b.flight.origin.code,
          originCity: b.flight.origin.city,
          destination: b.flight.destination.code,
          destinationCity: b.flight.destination.city,
          departureTime: b.flight.departureTime,
          flightNumber: b.flight.flightNumber,
          airlineCode: b.flight.airline.code,
          airlineName: b.flight.airline.name,
          passengerName: b.passengers.map((p) => `${p.firstName} ${p.lastName}`).join(', '),
          cabinClass: b.cabinClass,
        })));
      })
      .finally(() => setOrdersLoading(false));
  }, [activeTab]);

  const changeRole = (id: string, role: UserRole) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    setEditingId(null);
  };

  const toggleStatus = (id: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, status: u.status === 'Active' ? 'Inactive' : 'Active' } : u,
      ),
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Airline Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Manage users, roles, and airline configuration</p>
        </div>
        <a
          href="/admin/integrations"
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 flex items-center gap-2"
        >
          <Settings size={14} className="text-gray-500" /> Data integrations
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {STATS.map(({ label, value, icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center ${color} mb-3`}>
              {icon}
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-6">
        {(['users', 'bookings', 'tenant', 'config', 'flight_planning'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); if (tab === 'tenant') setEditTenant(tenant); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'users' ? 'User Management'
              : tab === 'bookings' ? 'Bookings'
              : tab === 'tenant' ? 'Tenant Config'
              : tab === 'config' ? 'Airline Config'
              : 'Flight Planning'}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Last Login</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === u.id ? (
                      <select
                        autoFocus
                        defaultValue={u.role}
                        onBlur={() => setEditingId(null)}
                        onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                        className="border border-blue-400 rounded-lg px-2 py-1 text-xs focus:outline-none"
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditingId(u.id)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role]} hover:opacity-80 transition-opacity`}
                      >
                        {ROLE_LABELS[u.role]} <ChevronDown size={10} />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{u.lastLogin}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleStatus(u.id)}
                      className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {ordersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-blue-600" size={28} />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No bookings found</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">PNR</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Passenger</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Route</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Flight</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Class</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Booked</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600 tracking-widest text-xs">{o.pnr}</td>
                    <td className="px-4 py-3 text-gray-900">{o.passengerName || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {o.originCity || o.origin} → {o.destinationCity || o.destination}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {o.airlineCode && <AirlineLogo code={o.airlineCode} name={o.airlineName} size={20} />}
                        <span className="text-gray-700">{o.flightNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{o.cabinClass}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {o.totalAmount && parseFloat(o.totalAmount) > 0
                        ? `${o.currency === 'USD' ? '$' : o.currency}${parseFloat(o.totalAmount).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        o.status === 'confirmed' ? 'bg-green-50 text-green-700' :
                        o.status === 'cancelled' ? 'bg-red-50 text-red-700' :
                        'bg-yellow-50 text-yellow-700'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'tenant' && editTenant && (
        <div className="space-y-6">
          {/* Tenant selector */}
          <div className="flex items-center gap-3">
            <Building2 size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Editing tenant:</span>
            <div className="flex gap-2">
              {allTenants.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTenantId(t.id); setEditTenant(t); setTenantSaved(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    t.id === editTenant.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{t.brand.logo}</span> {t.brand.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Brand */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm">Brand</h3>
              {[
                { label: 'Airline Name', field: 'name' as const, type: 'text' },
                { label: 'Logo / Emoji', field: 'logo' as const, type: 'text' },
                { label: 'Primary Color', field: 'primaryColor' as const, type: 'color' },
                { label: 'Secondary Color', field: 'secondaryColor' as const, type: 'color' },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <div className="flex items-center gap-2">
                    {type === 'color' && (
                      <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: (editTenant.brand as Record<string, string>)[field] }} />
                    )}
                    <input
                      type={type}
                      value={(editTenant.brand as Record<string, string>)[field] ?? ''}
                      onChange={(e) => setEditTenant((prev) => prev ? ({ ...prev, brand: { ...prev.brand, [field]: e.target.value } }) : prev)}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* AI Preferences */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm">AI Preferences</h3>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tone</label>
                <select
                  value={editTenant.aiPreferences.tone}
                  onChange={(e) => setEditTenant((prev) => prev ? ({ ...prev, aiPreferences: { ...prev.aiPreferences, tone: e.target.value as TenantConfig['aiPreferences']['tone'] } }) : prev)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                >
                  <option value="formal">Formal</option>
                  <option value="friendly">Friendly</option>
                  <option value="concise">Concise</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Agent Personality</label>
                <textarea
                  rows={4}
                  value={editTenant.aiPreferences.agentPersonality}
                  onChange={(e) => setEditTenant((prev) => prev ? ({ ...prev, aiPreferences: { ...prev.aiPreferences, agentPersonality: e.target.value } }) : prev)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cancellation Policy (for AI)</label>
                <textarea
                  rows={2}
                  value={editTenant.aiPreferences.cancellationPolicyText}
                  onChange={(e) => setEditTenant((prev) => prev ? ({ ...prev, aiPreferences: { ...prev.aiPreferences, cancellationPolicyText: e.target.value } }) : prev)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Baggage Policy (for AI)</label>
                <textarea
                  rows={2}
                  value={editTenant.aiPreferences.baggagePolicyText}
                  onChange={(e) => setEditTenant((prev) => prev ? ({ ...prev, aiPreferences: { ...prev.aiPreferences, baggagePolicyText: e.target.value } }) : prev)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
            </div>

            {/* Policies */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm">Policies</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Pricing Markup (%)</label>
                  <input
                    type="number" min={0} max={100}
                    value={editTenant.policies.pricing.markupPercent}
                    onChange={(e) => setEditTenant((prev) => prev ? ({ ...prev, policies: { ...prev.policies, pricing: { markupPercent: parseInt(e.target.value) || 0 } } }) : prev)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Checked Bag Fee ($)</label>
                  <input
                    type="number" min={0}
                    value={editTenant.policies.baggage.checkedFee}
                    onChange={(e) => setEditTenant((prev) => prev ? ({ ...prev, policies: { ...prev.policies, baggage: { ...prev.policies.baggage, checkedFee: parseInt(e.target.value) || 0 } } }) : prev)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">No-Refund Message</label>
                <input
                  type="text"
                  value={editTenant.policies.cancellation.noRefundMessage}
                  onChange={(e) => setEditTenant((prev) => prev ? ({ ...prev, policies: { ...prev.policies, cancellation: { ...prev.policies.cancellation, noRefundMessage: e.target.value } } }) : prev)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {/* Features */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm">Features</h3>
              {(Object.keys(editTenant.features) as Array<keyof TenantConfig['features']>).map((key) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <button
                    type="button"
                    onClick={() => setEditTenant((prev) => prev ? ({ ...prev, features: { ...prev.features, [key]: !prev.features[key] } }) : prev)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${editTenant.features[key] ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editTenant.features[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (!editTenant) return;
                setTenantSaving(true);
                await fetch(`/api/tenant/${editTenant.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(editTenant),
                }).catch(() => {});
                setTenantSaving(false);
                setTenantSaved(true);
                setTimeout(() => setTenantSaved(false), 3000);
              }}
              disabled={tenantSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {tenantSaving ? <Loader2 size={14} className="animate-spin" /> : tenantSaved ? <Check size={14} /> : <Save size={14} />}
              {tenantSaving ? 'Saving…' : tenantSaved ? 'Saved!' : 'Save Changes'}
            </button>
            <p className="text-xs text-gray-400">Changes apply immediately (in-memory; persist until server restart).</p>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-gray-500" />
            <h3 className="font-semibold text-gray-900">Airline Branding</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Airline Name', value: 'SkyMock Airlines', type: 'text' },
              { label: 'Logo / Emoji', value: '✈️', type: 'text' },
              { label: 'Primary Color', value: '#1a56db', type: 'color' },
              { label: 'Secondary Color', value: '#e8f0fe', type: 'color' },
              { label: 'Font Family', value: 'Inter, sans-serif', type: 'text' },
            ].map(({ label, value, type }) => (
              <div key={label}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  {type === 'color' && (
                    <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: value }} />
                  )}
                  <input
                    defaultValue={value}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            ))}
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
            Save Configuration
          </button>
        </div>
      )}

      {activeTab === 'flight_planning' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Plane size={16} className="text-gray-500" />
            <h3 className="font-semibold text-gray-900">Flight Planning</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Configure data sources and runtime settings for the dispatcher workflow.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link
              href="/planner"
              className="group flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Plane size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-gray-900">Open planner dashboard</p>
                  <ArrowRight size={14} className="text-gray-400 group-hover:text-indigo-600 transition-colors" />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Per-flight 8-phase dispatch workflow with auto-prepare, divert, cascade, MEL, and EOD tools.
                </p>
              </div>
            </Link>
            <Link
              href="/admin/integrations"
              className="group flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <ServerCog size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-gray-900">Data integrations</p>
                  <ArrowRight size={14} className="text-gray-400 group-hover:text-amber-600 transition-colors" />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Fuel prices, MEL deferrals, crew roster — switch between mock, CSV, and live REST APIs.
                </p>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
