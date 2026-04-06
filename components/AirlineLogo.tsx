'use client';

import { useState } from 'react';

export function AirlineLogo({ code, name, size = 40 }: { code: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="text-xs font-bold text-gray-500 text-center">{code}</span>;
  }
  return (
    <img
      src={`https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${code}.svg`}
      alt={name}
      width={size}
      height={size}
      className="object-contain"
      onError={() => setFailed(true)}
    />
  );
}
