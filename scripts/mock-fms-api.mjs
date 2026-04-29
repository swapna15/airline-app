#!/usr/bin/env node
/**
 * Tiny in-memory FMS-style fuel-price API for end-to-end testing of the
 * `api_fms` provider. Mounts on port 4000 (or $PORT).
 *
 *   GET /prices                 → 200 { data: [...] }
 *   GET /prices/{ICAO}          → 200 single record (not used by current
 *                                 provider but useful for future per-station
 *                                 lookups)
 *   any                          → 401 if Bearer token != $FMS_TOKEN
 *
 * The response shape is the FMS schema so the provider can pass-through:
 *   icao, totalPerUSG, currency, components{base,differential,intoPlane,tax},
 *   supplier, contractRef, asOf, validUntil
 */

import http from 'node:http';

const PORT  = parseInt(process.env.PORT ?? '4000', 10);
const TOKEN = process.env.FMS_TOKEN ?? 'test-token-1234';

const PRICES = [
  { icao: 'KJFK', totalPerUSG: 3.01, currency: 'USD', components: { base: 2.45, differential: 0.18, intoPlane: 0.07, tax: 0.31 }, supplier: 'World Fuel Services', contractRef: 'WFS-2026-Q2', asOf: new Date().toISOString() },
  { icao: 'EGLL', totalPerUSG: 3.89, currency: 'USD', components: { base: 3.12, differential: 0.22, intoPlane: 0.10, tax: 0.45 }, supplier: 'Air BP',              contractRef: 'BP-LHR-2026',  asOf: new Date().toISOString(), totalLocal: 3.10 },
  { icao: 'LFPG', totalPerUSG: 3.92, currency: 'USD', components: { base: 3.10, differential: 0.25, intoPlane: 0.11, tax: 0.46 }, supplier: 'TotalEnergies Aviation', contractRef: 'TE-CDG-2026', asOf: new Date().toISOString() },
  { icao: 'EDDF', totalPerUSG: 3.83, currency: 'USD', components: { base: 3.08, differential: 0.21, intoPlane: 0.10, tax: 0.44 }, supplier: 'Q8 Aviation',          contractRef: 'Q8-FRA-2026',  asOf: new Date().toISOString() },
  { icao: 'OMDB', totalPerUSG: 2.95, currency: 'USD', components: { base: 2.60, differential: 0.10, intoPlane: 0.05, tax: 0.20 }, supplier: 'ENOC',                 contractRef: 'ENOC-DXB-2026',asOf: new Date().toISOString() },
];

const server = http.createServer((req, res) => {
  const auth = req.headers.authorization ?? '';
  const expected = `Bearer ${TOKEN}`;
  if (auth !== expected) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/prices') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: PRICES }));
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/prices/')) {
    const icao = url.pathname.slice('/prices/'.length).toUpperCase();
    const row = PRICES.find((p) => p.icao === icao);
    if (!row) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(row));
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`mock-fms-api listening on :${PORT} (token=${TOKEN})`);
});
