'use client';

import type { PriceBreakdown } from '@/types/booking';

interface Props {
  breakdown: PriceBreakdown;
}

export function PriceSummary({ breakdown }: Props) {
  return (
    <div className="bg-gray-50 rounded-xl p-5 space-y-2 text-sm">
      <h3 className="font-semibold text-gray-900 mb-3">Price Breakdown</h3>
      <div className="flex justify-between text-gray-600">
        <span>Base fare</span>
        <span>${breakdown.baseFare.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-gray-600">
        <span>Taxes</span>
        <span>${breakdown.taxes.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-gray-600">
        <span>Fees</span>
        <span>${breakdown.fees.toLocaleString()}</span>
      </div>
      {breakdown.seatFees > 0 && (
        <div className="flex justify-between text-gray-600">
          <span>Seat selection</span>
          <span>${breakdown.seatFees.toLocaleString()}</span>
        </div>
      )}
      {breakdown.baggageFees > 0 && (
        <div className="flex justify-between text-gray-600">
          <span>Checked baggage</span>
          <span>${breakdown.baggageFees.toLocaleString()}</span>
        </div>
      )}
      <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900 text-base">
        <span>Total</span>
        <span className="text-blue-600">${breakdown.total.toLocaleString()}</span>
      </div>
    </div>
  );
}
