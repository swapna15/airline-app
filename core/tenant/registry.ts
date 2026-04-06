import type { TenantConfig } from '@/types/tenant';

const SEED_TENANTS: TenantConfig[] = [
  // ── SkyWays: premium full-service carrier ────────────────────────────────────
  {
    id: 'skyways',
    name: 'SkyWays Airlines',
    brand: {
      name: 'SkyWays Airlines',
      logo: '✈',
      primaryColor: '#1a3a8f',
      secondaryColor: '#e8eeff',
      accentColor: '#c8a400',
      fontFamily: 'Georgia, "Times New Roman", serif',
    },
    policies: {
      cancellation: {
        refundTiers: [
          { hoursThreshold: 168, percentage: 90 }, // > 7 days
          { hoursThreshold: 48,  percentage: 50 },  // 2–7 days
          // < 48 h → no refund
        ],
        noRefundMessage: 'SkyWays does not offer refunds for cancellations within 48 hours of departure.',
      },
      baggage: {
        carryOnIncluded: true,
        carryOnDescription: '1 × 10 kg hand baggage',
        checkedIncluded: true,
        checkedDescription: '2 × 32 kg checked bags',
        checkedFee: 0,
      },
      pricing: { markupPercent: 15 },
      checkIn: { openHours: 48, closeMinutes: 45 },
    },
    aiPreferences: {
      tone: 'formal',
      agentPersonality:
        'You represent SkyWays Airlines — a premium, full-service carrier renowned for exceptional service, on-time performance, and passenger comfort. Always communicate with sophistication and professionalism. Emphasise the quality and reliability of our service.',
      cancellationPolicyText:
        'Cancellations more than 7 days before departure receive a 90% refund. Cancellations 2–7 days prior receive a 50% refund. No refund is available within 48 hours of departure.',
      baggagePolicyText:
        'All SkyWays fares include 1 carry-on bag (10 kg) and 2 checked bags (32 kg each) at no additional charge.',
      supportedLanguages: ['en', 'fr', 'de', 'es', 'ja'],
    },
    features: {
      seatSelection: true,
      roundTrip: true,
      loyaltyProgram: true,
      selfServiceCancellation: true,
      multiCity: false,
    },
  },

  // ── Horizon Air: budget-friendly carrier ────────────────────────────────────
  {
    id: 'horizonair',
    name: 'Horizon Air',
    brand: {
      name: 'Horizon Air',
      logo: '🌅',
      primaryColor: '#0d9488',
      secondaryColor: '#f0fdf4',
      accentColor: '#f97316',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    policies: {
      cancellation: {
        refundTiers: [
          { hoursThreshold: 168, percentage: 80 }, // > 7 days
          { hoursThreshold: 48,  percentage: 50 },  // 2–7 days
          { hoursThreshold: 0,   percentage: 25 },  // up to departure
        ],
        noRefundMessage: 'All Horizon Air fares qualify for at least a 25% refund up until departure.',
      },
      baggage: {
        carryOnIncluded: true,
        carryOnDescription: '1 × 7 kg cabin bag',
        checkedIncluded: false,
        checkedDescription: 'Not included — add for $30',
        checkedFee: 30,
      },
      pricing: { markupPercent: 0 },
      checkIn: { openHours: 24, closeMinutes: 30 },
    },
    aiPreferences: {
      tone: 'friendly',
      agentPersonality:
        'You represent Horizon Air — a modern, budget-friendly carrier that believes travel should be accessible to everyone. Be warm, approachable, and to the point. Highlight great value and flexible policies. Keep answers brief.',
      cancellationPolicyText:
        'Flexible cancellation for all fares: 80% refund >7 days, 50% refund 2–7 days, 25% refund right up to departure.',
      baggagePolicyText:
        'Your 7 kg cabin bag flies free. Need to check a bag? Add one for just $30 per passenger during booking — cheaper than the airport rate.',
      supportedLanguages: ['en', 'es', 'pt'],
    },
    features: {
      seatSelection: true,
      roundTrip: true,
      loyaltyProgram: false,
      selfServiceCancellation: true,
      multiCity: false,
    },
  },

  // ── AeroMock: neutral demo tenant (default) ──────────────────────────────────
  {
    id: 'aeromock',
    name: 'AeroMock',
    brand: {
      name: 'AeroMock',
      logo: '✈️',
      primaryColor: '#1a56db',
      secondaryColor: '#e8f0fe',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    policies: {
      cancellation: {
        refundTiers: [
          { hoursThreshold: 168, percentage: 90 },
          { hoursThreshold: 48,  percentage: 75 },
          { hoursThreshold: 24,  percentage: 50 },
          { hoursThreshold: 0,   percentage: 25 },
        ],
        noRefundMessage: 'Flights that have already departed are not eligible for a refund.',
      },
      baggage: {
        carryOnIncluded: true,
        carryOnDescription: '1 × 7 kg carry-on',
        checkedIncluded: false,
        checkedDescription: 'Not included — add for $35',
        checkedFee: 35,
      },
      pricing: { markupPercent: 0 },
      checkIn: { openHours: 24, closeMinutes: 60 },
    },
    aiPreferences: {
      tone: 'concise',
      agentPersonality:
        'You represent AeroMock — a demonstration airline platform. Be helpful, direct, and informative. Cover all standard airline topics concisely.',
      cancellationPolicyText:
        'Standard tiers: 90% refund >7 days, 75% >2 days, 50% >24 h, 25% up to departure.',
      baggagePolicyText:
        'Carry-on (7 kg) always included. Add a checked bag for $35 per passenger.',
      supportedLanguages: ['en'],
    },
    features: {
      seatSelection: true,
      roundTrip: true,
      loyaltyProgram: false,
      selfServiceCancellation: true,
      multiCity: false,
    },
  },
];

class TenantRegistryClass {
  private tenants = new Map<string, TenantConfig>(
    SEED_TENANTS.map((t) => [t.id, t]),
  );
  private overrides = new Map<string, Partial<TenantConfig>>();

  getAll(): TenantConfig[] {
    return Array.from(this.tenants.keys()).map((id) => this.resolve(id)!);
  }

  get(id: string): TenantConfig | undefined {
    return this.resolve(id);
  }

  getDefault(): TenantConfig {
    return this.resolve('aeromock')!;
  }

  /** Merge a partial override into a tenant (in-memory; resets on server restart) */
  applyOverride(id: string, override: Partial<TenantConfig>): void {
    const existing = this.overrides.get(id) ?? {};
    this.overrides.set(id, { ...existing, ...override });
  }

  private resolve(id: string): TenantConfig | undefined {
    const base = this.tenants.get(id);
    if (!base) return undefined;
    const ov = this.overrides.get(id);
    if (!ov) return base;
    return {
      ...base,
      ...ov,
      brand: { ...base.brand, ...(ov.brand ?? {}) },
      policies: {
        ...base.policies,
        ...(ov.policies ?? {}),
        cancellation: { ...base.policies.cancellation, ...(ov.policies?.cancellation ?? {}) },
        baggage: { ...base.policies.baggage, ...(ov.policies?.baggage ?? {}) },
      },
      aiPreferences: { ...base.aiPreferences, ...(ov.aiPreferences ?? {}) },
      features: { ...base.features, ...(ov.features ?? {}) },
    };
  }
}

export const TenantRegistry = new TenantRegistryClass();
