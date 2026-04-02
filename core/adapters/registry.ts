import type { AirlineAdapter } from '@/types/airline';

class Registry {
  private adapters = new Map<string, AirlineAdapter>();
  private activeId: string | null = null;

  register(adapter: AirlineAdapter) {
    this.adapters.set(adapter.id, adapter);
    if (!this.activeId) this.activeId = adapter.id;
  }

  get(id: string): AirlineAdapter | undefined {
    return this.adapters.get(id);
  }

  getActive(): AirlineAdapter | null {
    if (!this.activeId) return null;
    return this.adapters.get(this.activeId) ?? null;
  }

  setActive(id: string) {
    if (!this.adapters.has(id)) throw new Error(`Adapter "${id}" not registered`);
    this.activeId = id;
  }

  list(): AirlineAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const AdapterRegistry = new Registry();
