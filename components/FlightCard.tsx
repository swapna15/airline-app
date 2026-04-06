'use client';

import type { Flight, CabinClass } from '@/types/flight';
import { AirlineLogo } from './AirlineLogo';
import { Briefcase, Luggage, AlertCircle } from 'lucide-react';

interface Props {
  flight: Flight;
  selectedClass: CabinClass;
  onSelect: (flight: Flight) => void;
}

export function FlightCard({ flight, selectedClass, onSelect }: Props) {
  const segment = flight.segments[0];
  const price = flight.prices[selectedClass];
  const availability = flight.availability[selectedClass];

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onSelect(flight)}
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
          <AirlineLogo code={segment.airline.code} name={segment.airline.name} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{segment.airline.name} · {segment.flightNumber}</p>
          <div className="flex items-center gap-3 mt-1">
            <div>
              <p className="text-lg font-bold">{new Date(segment.departure.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-xs text-gray-500">{segment.departure.airport.code}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">{flight.totalDuration}</p>
              <div className="flex items-center gap-1 my-1">
                <div className="h-px w-8 bg-gray-300" />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                <div className="h-px w-8 bg-gray-300" />
              </div>
              <p className="text-xs text-green-600">{flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop`}</p>
            </div>
            <div>
              <p className="text-lg font-bold">{new Date(segment.arrival.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-xs text-gray-500">{segment.arrival.airport.code}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-blue-600">${price.toLocaleString()}</p>
        <p className="text-xs text-gray-500 mb-1">{availability} seats left</p>

        {/* Baggage summary */}
        <div className="flex flex-col items-end gap-0.5 mb-2">
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Briefcase size={11} />
            {flight.baggage.carry}
          </span>
          {flight.baggage.checkedIncluded ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Luggage size={11} />
              {flight.baggage.checked}
            </span>
          ) : flight.baggage.checkedFee ? (
            <span className="flex items-center gap-1 text-xs text-orange-500">
              <AlertCircle size={11} />
              +${flight.baggage.checkedFee} checked bag
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Luggage size={11} />
              No checked bag
            </span>
          )}
        </div>

        <button className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
          Select
        </button>
      </div>
    </div>
  );
}
