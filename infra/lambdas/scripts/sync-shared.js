#!/usr/bin/env node
/**
 * Pre-build mirror: copies the repo-root /shared/ tree into
 * infra/lambdas/shared/canonical/ so the Lambda's tsc can compile it under
 * its own rootDir without leaking the full monorepo path into outDir.
 *
 * Single source of truth lives at /shared/. Edit only there. This script
 * runs as part of `npm run build` so the mirror is always fresh.
 *
 * Lambda code imports the schema as:
 *   import { ... } from '../shared/canonical/schema/flight';
 *
 * The Next.js side imports it directly via tsconfig path alias:
 *   import { ... } from '@shared/schema/flight';
 */

const fs   = require('fs');
const path = require('path');

const root        = path.resolve(__dirname, '..');     // infra/lambdas
const repoRoot    = path.resolve(root, '..', '..');    // repo root
const sharedSrc   = path.join(repoRoot, 'shared');
const sharedDest  = path.join(root, 'shared', 'canonical');

if (!fs.existsSync(sharedSrc)) {
  console.log('No /shared/ at repo root — nothing to mirror.');
  process.exit(0);
}

// Wipe the previous mirror so renames/deletes propagate.
if (fs.existsSync(sharedDest)) {
  fs.rmSync(sharedDest, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(sharedSrc, sharedDest);
console.log(`Mirrored ${sharedSrc} → ${sharedDest}`);
