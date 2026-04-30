'use client';

import { MapContainer, TileLayer, Polygon, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ClassifiedSigmet } from '@/lib/sigmet-classifier';

interface SigmetMapProps {
  sigmets: ClassifiedSigmet[];
  /** Externally-controlled selection — when set, the matching polygon is
   *  drawn with thicker stroke + higher opacity. */
  selectedIndex: number | null;
  onSelect: (i: number | null) => void;
}

export default function SigmetMap({ sigmets, selectedIndex, onSelect }: SigmetMapProps) {
  return (
    <MapContainer
      // Center over the Atlantic so SIGMETs from US ↔ Europe are both visible.
      center={[35, -30]}
      zoom={2}
      minZoom={2}
      maxZoom={6}
      worldCopyJump={true}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {sigmets.map((s, i) => {
        const positions: [number, number][] = (s.coords ?? []).map((p) => [p.lat, p.lon]);
        const isSelected = i === selectedIndex;
        return (
          <Polygon
            key={`${s.firId ?? 'unk'}-${i}`}
            positions={positions}
            pathOptions={{
              color: s.color,
              weight: isSelected ? 3 : 1.5,
              fillOpacity: isSelected ? 0.5 : 0.25,
            }}
            eventHandlers={{
              click: () => onSelect(i),
            }}
          >
            <Tooltip sticky>
              <div className="text-xs">
                <div className="font-semibold">{s.hazard ?? 'Unknown hazard'}</div>
                <div>{s.firId ?? '—'} · FL{s.minFL ?? '?'}–{s.maxFL ?? '?'}</div>
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
