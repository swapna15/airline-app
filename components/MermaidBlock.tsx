'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let mermaidInitialised = false;

/**
 * Renders a Mermaid diagram from raw source. Each block gets a unique id and
 * mermaid.render returns the SVG inline. We initialise the library once and
 * re-render on source change for hot-reload.
 */
export function MermaidBlock({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<string>(`mmd-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!mermaidInitialised) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        flowchart: { curve: 'basis', useMaxWidth: true },
        sequence:  { useMaxWidth: true },
      });
      mermaidInitialised = true;
    }
    let cancelled = false;
    mermaid.render(idRef.current, source.trim())
      .then(({ svg }) => { if (!cancelled) { setSvg(svg); setError(null); } })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [source]);

  if (error) {
    return (
      <pre className="my-4 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 overflow-x-auto">
        Mermaid render error: {error}
        {'\n\n'}
        {source}
      </pre>
    );
  }
  return (
    <div
      ref={ref}
      className="my-6 p-4 bg-white border border-gray-200 rounded-xl overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
