#!/usr/bin/env node
/**
 * Tiny in-memory AMOS-style MEL API for end-to-end testing of the
 * `api_amos`/`api_trax`/`api_camo` providers. Mounts on port 4001 (or $PORT).
 *
 *   GET /deferrals              → 200 { data: [...] }
 *   any other                   → 401 if Bearer token != $MIS_TOKEN
 */

import http from 'node:http';

const PORT  = parseInt(process.env.PORT ?? '4001', 10);
const TOKEN = process.env.MIS_TOKEN ?? 'test-token-mis-1234';

const TODAY = '2026-04-29';
const daysAgo = (n) => new Date(new Date(TODAY).getTime() - n * 86400 * 1000).toISOString().slice(0, 10);

const DEFERRALS = [
  { tail: 'G-XLEK', melId: 'MEL-30-01', deferredAt: daysAgo(3),
    description: 'Engine #1 anti-ice valve unresponsive — opened during walk-around',
    dueAt: daysAgo(-7), partsOnOrder: false, placardInstalled: true, releasedBy: 'ENG-2245' },
  { tail: 'G-XLEK', melId: 'MEL-33-01', deferredAt: daysAgo(8),
    description: 'Left landing light bulb burnt out — replacement on order',
    dueAt: daysAgo(-22), partsOnOrder: true, placardInstalled: true, releasedBy: 'ENG-2118' },
  { tail: 'N801AA', melId: 'MEL-23-01', deferredAt: daysAgo(2),
    description: 'HF radio #1 failed BIT during pre-flight',
    dueAt: daysAgo(-8), partsOnOrder: false, placardInstalled: true, releasedBy: 'ENG-1031' },
  { tail: 'N801AA', melId: 'MEL-22-01', deferredAt: daysAgo(5),
    description: 'CAT III autoland self-test failure',
    dueAt: daysAgo(-5), partsOnOrder: false, placardInstalled: false, releasedBy: 'ENG-1031' },
  { tail: 'D-AIMA', melId: 'MEL-24-01', deferredAt: daysAgo(1),
    description: 'APU INOP — overhaul scheduled at next C-check',
    dueAt: daysAgo(-9), partsOnOrder: false, placardInstalled: true, releasedBy: 'ENG-3340' },
];

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/deferrals') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: DEFERRALS }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`mock-mis-api listening on :${PORT} (token=${TOKEN})`);
});
