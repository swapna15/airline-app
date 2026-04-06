import type { CabinClass } from './flight';

export interface RefundTier {
  /** If hoursUntilDeparture > this, the refund percentage below applies */
  hoursThreshold: number;
  percentage: number;
}

export interface TenantConfig {
  id: string;
  name: string;
  brand: {
    name: string;
    logo: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor?: string;
    fontFamily?: string;
  };
  policies: {
    cancellation: {
      /** Sorted descending by hoursThreshold — first match wins */
      refundTiers: RefundTier[];
      noRefundMessage: string;
    };
    baggage: {
      carryOnIncluded: boolean;
      carryOnDescription: string;
      checkedIncluded: boolean;
      checkedDescription: string;
      checkedFee: number;
    };
    pricing: {
      /** Percentage added on top of base fare (0 = no markup) */
      markupPercent: number;
    };
    checkIn: {
      openHours: number;      // check-in opens X hours before departure
      closeMinutes: number;   // check-in closes X minutes before departure
    };
  };
  aiPreferences: {
    tone: 'formal' | 'friendly' | 'concise';
    agentPersonality: string;
    cancellationPolicyText: string;
    baggagePolicyText: string;
    supportedLanguages: string[];
  };
  features: {
    seatSelection: boolean;
    roundTrip: boolean;
    loyaltyProgram: boolean;
    selfServiceCancellation: boolean;
    multiCity: boolean;
  };
}

export interface UserPreferences {
  preferredCabin: CabinClass;
  preferredSeatType: 'window' | 'aisle' | 'any';
  frequentRoutes: Array<{ origin: string; destination: string }>;
  defaultAddCheckedBag: boolean;
  language: string;
}
