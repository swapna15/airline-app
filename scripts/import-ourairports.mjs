#!/usr/bin/env node
/**
 * Import OurAirports CSV → lib/airports.json.
 * Run with `node scripts/import-ourairports.mjs`.
 *
 * OurAirports is public domain. Source:
 *   https://ourairports.com/data/
 *   https://davidmegginson.github.io/ourairports-data/
 *
 * Filters applied:
 *  - type = large_airport OR medium_airport
 *  - has at least one open paved runway ≥ 6,000 ft
 *
 * Heuristics for fields not in OurAirports (see CLAUDE.md):
 *  - fireCat:        large=9, medium=7        (real ICAO RFF varies; Jeppesen has it)
 *  - customs:        large_airport AND scheduled_service=yes
 *  - fuel:           present iff scheduled service or large; jet-a (US) / jet-a1 (rest)
 *  - etopsAlternate: large_airport AND scheduled_service AND has a lit, paved
 *                    runway ≥ 7,500 ft. Approximates the dispatcher's ETOPS-adequate
 *                    set; for prod use Jeppesen JeppView or NavBlue with real
 *                    24h ops/customs/RFF data.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const RUNWAYS_URL  = 'https://davidmegginson.github.io/ourairports-data/runways.csv';

function parseRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const header = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const v = parseRow(lines[i]);
    const r = {};
    for (let j = 0; j < header.length; j++) r[header[j]] = v[j];
    rows.push(r);
  }
  return rows;
}

// OurAirports uses 3-letter codes (ASP, CON) and occasionally longer forms (ASPH, CONC).
const PAVED = /ASP|CON|BIT|MAC|PEM|TARMAC/;

async function main() {
  console.log('Fetching airports.csv…');
  const aText = await fetch(AIRPORTS_URL).then((r) => {
    if (!r.ok) throw new Error(`airports.csv ${r.status}`);
    return r.text();
  });
  console.log('Fetching runways.csv…');
  const rText = await fetch(RUNWAYS_URL).then((r) => {
    if (!r.ok) throw new Error(`runways.csv ${r.status}`);
    return r.text();
  });

  const airports = parseCSV(aText);
  const runways  = parseCSV(rText);

  // Longest paved open runway per airport ident
  const longestPaved = new Map();
  // Idents with at least one open, lit, paved runway ≥ 7,500 ft → ETOPS-alternate
  // candidate. ETOPS dispatch also needs RFF/customs/24h ops; those are layered on
  // below from the airport-level large+scheduled heuristic.
  const etopsRunway = new Set();
  for (const r of runways) {
    if (r.closed === '1') continue;
    const len = parseInt(r.length_ft, 10);
    if (!Number.isFinite(len) || len < 1000) continue;
    if (!PAVED.test((r.surface || '').toUpperCase())) continue;
    const cur = longestPaved.get(r.airport_ident) ?? 0;
    if (len > cur) longestPaved.set(r.airport_ident, len);
    if (len >= 7500 && r.lighted === '1') etopsRunway.add(r.airport_ident);
  }

  const out = [];
  for (const a of airports) {
    if (a.type !== 'large_airport' && a.type !== 'medium_airport') continue;
    const runwayLengthFt = longestPaved.get(a.ident) ?? 0;
    if (runwayLengthFt < 6000) continue;

    const lat = parseFloat(a.latitude_deg);
    const lon = parseFloat(a.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const isLarge = a.type === 'large_airport';
    const scheduled = a.scheduled_service === 'yes';
    const isUS = a.iso_country === 'US';

    out.push({
      iata: a.iata_code || '',
      icao: a.ident,
      name: a.name,
      country: a.iso_country || '',
      lat, lon,
      runwayLengthFt,
      fireCat: isLarge ? 9 : 7,
      customs: isLarge && scheduled,
      fuel: (isLarge || scheduled) ? (isUS ? 'jet-a' : 'jet-a1') : 'none',
      etopsAlternate: isLarge && scheduled && etopsRunway.has(a.ident),
    });
  }

  // Sort by ICAO for deterministic output / cleaner diffs
  out.sort((a, b) => a.icao.localeCompare(b.icao));

  const __dir = dirname(fileURLToPath(import.meta.url));
  const outPath = join(__dir, '..', 'lib', 'airports.json');
  writeFileSync(outPath, JSON.stringify(out));

  console.log(`Wrote ${out.length} airports to ${outPath}`);
  const withIata = out.filter((a) => a.iata).length;
  console.log(`  ${withIata} have IATA codes; ${out.length - withIata} ICAO-only`);
  console.log(`  customs=true: ${out.filter((a) => a.customs).length}`);
  console.log(`  etopsAlternate=true: ${out.filter((a) => a.etopsAlternate).length}`);
  console.log(`  longest runway: ${Math.max(...out.map((a) => a.runwayLengthFt)).toLocaleString()} ft`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
