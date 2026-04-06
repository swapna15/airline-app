'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { TenantConfig, UserPreferences } from '@/types/tenant';
import { TenantRegistry } from './registry';

// ─── Storage keys ─────────────────────────────────────────────────────────────
export const ACTIVE_TENANT_KEY = 'airlineos_active_tenant';
const PREFS_KEY_PREFIX = 'airlineos_user_prefs';

const defaultPrefs: UserPreferences = {
  preferredCabin: 'economy',
  preferredSeatType: 'any',
  frequentRoutes: [],
  defaultAddCheckedBag: false,
  language: 'en',
};

// ─── Context shape ─────────────────────────────────────────────────────────────
interface TenantContextValue {
  tenant: TenantConfig;
  setTenantId: (id: string) => void;
  allTenants: TenantConfig[];
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: TenantRegistry.getDefault(),
  setTenantId: () => {},
  allTenants: TenantRegistry.getAll(),
  preferences: defaultPrefs,
  updatePreferences: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig>(TenantRegistry.getDefault());
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPrefs);

  useEffect(() => {
    // Resolution order: NEXT_PUBLIC_TENANT_ID env → localStorage → 'aeromock'
    const envId  = process.env.NEXT_PUBLIC_TENANT_ID;
    const stored = localStorage.getItem(ACTIVE_TENANT_KEY);
    const id     = envId ?? stored ?? 'aeromock';
    const resolved = TenantRegistry.get(id) ?? TenantRegistry.getDefault();
    setTenant(resolved);

    // Load per-tenant user preferences
    try {
      const raw = localStorage.getItem(`${PREFS_KEY_PREFIX}_${resolved.id}`);
      if (raw) setPreferences((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {}
  }, []);

  const setTenantId = (id: string) => {
    const resolved = TenantRegistry.get(id) ?? TenantRegistry.getDefault();
    localStorage.setItem(ACTIVE_TENANT_KEY, resolved.id);
    setTenant(resolved);
    // Load preferences for newly selected tenant
    try {
      const raw = localStorage.getItem(`${PREFS_KEY_PREFIX}_${resolved.id}`);
      setPreferences(raw ? { ...defaultPrefs, ...JSON.parse(raw) } : defaultPrefs);
    } catch {
      setPreferences(defaultPrefs);
    }
  };

  const updatePreferences = (prefs: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...prefs };
      try {
        localStorage.setItem(`${PREFS_KEY_PREFIX}_${tenant.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return (
    <TenantContext.Provider
      value={{ tenant, setTenantId, allTenants: TenantRegistry.getAll(), preferences, updatePreferences }}
    >
      {children}
    </TenantContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
export function useTenant() {
  return useContext(TenantContext);
}
