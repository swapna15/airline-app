#!/usr/bin/env node
/**
 * Post-build bundler: copies shared/ and node_modules into each handler's
 * dist subfolder so Terraform can zip them independently.
 *
 * Output structure:
 *   dist/
 *     authorizer/  handler.js  shared/  node_modules/
 *     users/       handler.js  shared/  node_modules/
 *     flights/     handler.js  shared/  node_modules/
 *     ...
 */

const fs   = require('fs');
const path = require('path');

const root     = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist');
const nm       = path.join(root, 'node_modules');

const handlers = ['authorizer', 'users', 'flights', 'bookings', 'checkin', 'gate', 'admin', 'migrate'];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

for (const handler of handlers) {
  const handlerDist = path.join(distRoot, handler);

  if (!fs.existsSync(handlerDist)) {
    console.error(`Missing dist/${handler} — did you run "npm run build"?`);
    process.exit(1);
  }

  // Copy shared helpers
  const sharedSrc  = path.join(distRoot, 'shared');
  const sharedDest = path.join(handlerDist, 'shared');
  if (fs.existsSync(sharedSrc)) {
    copyDir(sharedSrc, sharedDest);
    console.log(`  copied shared → dist/${handler}/shared`);
  }

  // Copy node_modules (production deps only — run "npm ci --omit=dev" first)
  const nmDest = path.join(handlerDist, 'node_modules');
  if (!fs.existsSync(nmDest)) {
    copyDir(nm, nmDest);
    console.log(`  copied node_modules → dist/${handler}/node_modules`);
  } else {
    console.log(`  node_modules already present in dist/${handler}`);
  }
}

// Copy SQL migration files into the migrate bundle
const migrationsDir = path.join(root, '..', 'db', 'migrations');
const migrateDist   = path.join(distRoot, 'migrate');
if (fs.existsSync(migrationsDir) && fs.existsSync(migrateDist)) {
  for (const f of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))) {
    fs.copyFileSync(path.join(migrationsDir, f), path.join(migrateDist, f));
  }
  console.log('  copied SQL files → dist/migrate/');
}

console.log('\nBundle complete. Terraform can now zip each dist/<handler>/ folder.');
