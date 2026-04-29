#!/usr/bin/env node
/**
 * Tiny in-memory Sabre/Jeppesen-style crew API for end-to-end testing of the
 * `api_sabre`/`api_jeppesen`/`api_aims` providers. Mounts on port 4002.
 *
 *   GET /roster         → 200 { data: [...] }
 *   GET /assignments    → 200 { data: [...] }
 *   any other           → 401 if Bearer token != $CREW_TOKEN
 */

import http from 'node:http';

const PORT  = parseInt(process.env.PORT ?? '4002', 10);
const TOKEN = process.env.CREW_TOKEN ?? 'test-token-crew-1234';

const ROSTER = [
  { id: 'C001', name: 'Allen, K.',   role: 'CAP', base: 'JFK', typeRatings: ['777'],  priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 14*60, status: 'active', licenseNumber: 'ATP-US-1234567' },
  { id: 'C002', name: 'Bennett, R.', role: 'CAP', base: 'LHR', typeRatings: ['777'],  priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12*60, status: 'active' },
  { id: 'F001', name: 'Foster, J.',  role: 'FO',  base: 'JFK', typeRatings: ['777'],  priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 14*60, status: 'active' },
  { id: 'F002', name: 'Garcia, T.',  role: 'FO',  base: 'LHR', typeRatings: ['777'],  priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12*60, status: 'active' },
  { id: 'C003', name: 'Carter, J.',  role: 'CAP', base: 'JFK', typeRatings: ['A330'], priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 12*60, status: 'active' },
  { id: 'F003', name: 'Hewitt, S.',  role: 'FO',  base: 'JFK', typeRatings: ['A330'], priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 11*60, status: 'active' },
  { id: 'C004', name: 'Donovan, M.', role: 'CAP', base: 'FRA', typeRatings: ['A380'], priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 11*60, status: 'active' },
  { id: 'C005', name: 'Engel, P.',   role: 'CAP', base: 'DXB', typeRatings: ['A380'], priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 13*60, status: 'active' },
  { id: 'F005', name: 'Jung, K.',    role: 'FO',  base: 'FRA', typeRatings: ['A380'], priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty: 13*60, status: 'active' },
  { id: 'C006', name: 'Klein, A.',   role: 'CAP', base: 'JFK', typeRatings: ['777'],  priorFdpMin: 0, priorFlightTimeMin: 0, restMinSinceLastDuty:  8*60, status: 'reserve' },
];

const ASSIGNMENTS = [
  { crewId: 'C001', flight: 'BA1000' },
  { crewId: 'F001', flight: 'BA1000' },
  { crewId: 'C006', flight: 'BA1000' },
  { crewId: 'C002', flight: 'BA1001' },
  { crewId: 'F002', flight: 'BA1001' },
  { crewId: 'C003', flight: 'AA2110' },
  { crewId: 'C003', flight: 'AA2111' },
  { crewId: 'F003', flight: 'AA2110' },
  { crewId: 'F003', flight: 'AA2111' },
  { crewId: 'C004', flight: 'LH4409' },
  { crewId: 'F005', flight: 'LH4409' },
  { crewId: 'C003', flight: 'LH4410' },
  { crewId: 'C005', flight: 'EK5499' },
];

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/roster') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: ROSTER }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/assignments') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: ASSIGNMENTS }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`mock-crew-api listening on :${PORT} (token=${TOKEN})`);
});
