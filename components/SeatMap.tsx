'use client';

import clsx from 'clsx';
import type { Seat } from '@/types/flight';

interface Props {
  seats: Seat[][];
  selectedSeats: Seat[];
  onSeatToggle: (seat: Seat) => void;
}

export function SeatMap({ seats, selectedSeats, onSeatToggle }: Props) {
  const selectedIds = new Set(selectedSeats.map((s) => s.id));

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs text-gray-600">
          <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-gray-100 border border-gray-300" /> Available</div>
          <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-blue-500" /> Selected</div>
          <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-gray-300" /> Occupied</div>
        </div>
        <div className="space-y-1">
          {seats.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-1">
              <span className="w-6 text-right text-xs text-gray-400 mr-1">{row[0]?.row}</span>
              {row.map((seat, seatIdx) => {
                const isSelected = selectedIds.has(seat.id);
                const isAisleGap = seat.letter === 'D' || (row.length === 4 && seatIdx === 2);
                return (
                  <div key={seat.id} className="flex items-center">
                    {isAisleGap && <div className="w-4" />}
                    <button
                      onClick={() => !seat.isOccupied && seat.isAvailable && onSeatToggle(seat)}
                      disabled={seat.isOccupied || !seat.isAvailable}
                      title={`${seat.id} — ${seat.type}${seat.price ? ` (+$${seat.price})` : ''}`}
                      className={clsx(
                        'w-7 h-7 rounded text-xs font-medium transition-colors',
                        seat.isOccupied && 'bg-gray-300 cursor-not-allowed',
                        !seat.isOccupied && !seat.isAvailable && 'bg-gray-200 cursor-not-allowed',
                        !seat.isOccupied && seat.isAvailable && !isSelected && 'bg-gray-100 border border-gray-300 hover:bg-blue-100 cursor-pointer',
                        isSelected && 'bg-blue-500 text-white cursor-pointer',
                      )}
                    >
                      {seat.letter}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
