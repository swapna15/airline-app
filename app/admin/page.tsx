'use client';

import { useState } from 'react';
import { Users, Plane, DollarSign, TrendingUp, Settings, ChevronDown } from 'lucide-react';
import type { UserRole } from '@/types/roles';
import { ROLE_LABELS } from '@/types/roles';

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin: string;
  status: 'Active' | 'Inactive';
}

const MOCK_USERS: StaffUser[] = [
  { id: '1', name: 'Admin User', email: 'admin@airline.com', role: 'admin', lastLogin: '2026-04-02', status: 'Active' },
  { id: '2', name: 'coordinator', email: 'coordinator@airline.com', role: 'coordinator', lastLogin: '2026-04-02', status: 'Active' },
  { id: '3', name: 'gate', email: 'gate@airline.com', role: 'gate_manager', lastLogin: '2026-04-01', status: 'Active' },
  { id: '4', name: 'checkin', email: 'checkin@airline.com', role: 'checkin_agent', lastLogin: '2026-04-02', status: 'Active' },
  { id: '5', name: 'Jane Doe', email: 'jane@example.com', role: 'passenger', lastLogin: '2026-03-30', status: 'Active' },
  { id: '6', name: 'John Smith', email: 'john@example.com', role: 'passenger', lastLogin: '2026-03-28', status: 'Inactive' },
];

const ROLE_BADGE: Record<UserRole, string> = {
  passenger: 'bg-gray-100 text-gray-600',
  checkin_agent: 'bg-green-100 text-green-700',
  gate_manager: 'bg-orange-100 text-orange-700',
  coordinator: 'bg-purple-100 text-purple-700',
  admin: 'bg-red-100 text-red-700',
};

const STATS = [
  { label: 'Flights Today', value: '24', icon: <Plane size={18} />, color: 'text-blue-600', bg: 'bg-blue-50' },
  { label: 'Total Passengers', value: '3,847', icon: <Users size={18} />, color: 'text-purple-600', bg: 'bg-purple-50' },
  { label: "Today's Revenue", value: '$284,320', icon: <DollarSign size={18} />, color: 'text-green-600', bg: 'bg-green-50' },
  { label: 'On-time Rate', value: '91%', icon: <TrendingUp size={18} />, color: 'text-orange-600', bg: 'bg-orange-50' },
];

const ALL_ROLES: UserRole[] = ['passenger', 'checkin_agent', 'gate_manager', 'coordinator', 'admin'];

export default function AdminPage() {
  const [users, setUsers] = useState(MOCK_USERS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'config'>('users');

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Airline Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Manage users, roles, and airline configuration</p>
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
        {(['users', 'config'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'users' ? 'User Management' : 'Airline Config'}
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
    </div>
  );
}
