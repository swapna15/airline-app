/**
 * Minimal RFC-4180 CSV parser. Handles quoted fields (incl. escaped quotes)
 * and CRLF line endings. Same shape as `scripts/import-ourairports.mjs`,
 * ported to TypeScript.
 *
 * Returns rows as objects keyed by the header row. Header column names are
 * trimmed; cell values are not (preserve exact bytes for downstream parsing).
 */

export type CsvRow = Record<string, string>;

function parseRow(line: string): string[] {
  const out: string[] = [];
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

export function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = parseRow(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const v = parseRow(lines[i]);
    const r: CsvRow = {};
    for (let j = 0; j < header.length; j++) r[header[j]] = v[j] ?? '';
    rows.push(r);
  }
  return rows;
}
