import { AdapterRegistry } from '@/core/adapters/registry';
import type { AirlineAdapter } from '@/types/airline';

function makeAdapter(id: string): AirlineAdapter {
  return {
    id,
    brand: { name: id, logo: '', primaryColor: '#000', secondaryColor: '#fff' },
    searchFlights: jest.fn(),
    getSeatMap: jest.fn(),
    createBooking: jest.fn(),
    getBooking: jest.fn(),
    cancelBooking: jest.fn(),
  };
}

// Reset the singleton state between tests
beforeEach(() => {
  (AdapterRegistry as any).adapters = new Map();
  (AdapterRegistry as any).activeId = null;
});

describe('AdapterRegistry (singleton)', () => {
  it('getActive returns null when empty', () => {
    expect(AdapterRegistry.getActive()).toBeNull();
  });

  it('first registered adapter becomes active', () => {
    const a = makeAdapter('alpha');
    AdapterRegistry.register(a);
    expect(AdapterRegistry.getActive()).toBe(a);
  });

  it('second registration does not change active', () => {
    AdapterRegistry.register(makeAdapter('alpha'));
    AdapterRegistry.register(makeAdapter('beta'));
    expect(AdapterRegistry.getActive()?.id).toBe('alpha');
  });

  it('get returns the correct adapter by id', () => {
    const a = makeAdapter('alpha');
    AdapterRegistry.register(a);
    expect(AdapterRegistry.get('alpha')).toBe(a);
  });

  it('get returns undefined for unknown id', () => {
    expect(AdapterRegistry.get('nope')).toBeUndefined();
  });

  it('setActive switches the active adapter', () => {
    AdapterRegistry.register(makeAdapter('alpha'));
    AdapterRegistry.register(makeAdapter('beta'));
    AdapterRegistry.setActive('beta');
    expect(AdapterRegistry.getActive()?.id).toBe('beta');
  });

  it('setActive throws for unknown id', () => {
    expect(() => AdapterRegistry.setActive('ghost')).toThrow('not registered');
  });

  it('list returns all registered adapters', () => {
    AdapterRegistry.register(makeAdapter('a'));
    AdapterRegistry.register(makeAdapter('b'));
    AdapterRegistry.register(makeAdapter('c'));
    expect(AdapterRegistry.list()).toHaveLength(3);
  });

  it('registering duplicate id overwrites previous', () => {
    AdapterRegistry.register(makeAdapter('a'));
    const a2 = makeAdapter('a');
    AdapterRegistry.register(a2);
    expect(AdapterRegistry.get('a')).toBe(a2);
    expect(AdapterRegistry.list()).toHaveLength(1);
  });
});
