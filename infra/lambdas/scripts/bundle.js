#!/usr/bin/env node
/**
 * Post-build bundler: creates a _pkg/ directory per handler with the structure:
 *
 *   dist/<handler>_pkg/
 *     <handler>/handler.js   ← preserves '../shared/' relative import path
 *     shared/                ← at the same level, so '../shared/db' resolves correctly
 *     node_modules/
 *
 * At Lambda runtime (/var/task/):
 *   <handler>/handler.js  →  require('../shared/db')  →  /var/task/shared/db.js  ✓
 *
 * Terraform zips each <handler>_pkg/ folder.
 * Lambda handler setting: "<handler>/handler.handler"
 */

const fs   = require('fs');
const path = require('path');

const root     = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist');
const nm       = path.join(root, 'node_modules');

const handlers = ['authorizer', 'users', 'flights', 'bookings', 'checkin', 'gate', 'admin', 'migrate', 'planning', 'integrations'];

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
  const srcHandlerDir = path.join(distRoot, handler);

  if (!fs.existsSync(srcHandlerDir)) {
    console.error(`Missing dist/${handler} — did you run "npm run build"?`);
    process.exit(1);
  }

  const pkgDir        = path.join(distRoot, `${handler}_pkg`);
  const handlerSubDir = path.join(pkgDir, handler);

  // Copy compiled handler files into <handler>/ subdir
  copyDir(srcHandlerDir, handlerSubDir);
  console.log(`  copied dist/${handler} → dist/${handler}_pkg/${handler}/`);

  // Copy shared helpers to pkg root (so '../shared/' resolves correctly at runtime)
  const sharedSrc = path.join(distRoot, 'shared');
  if (fs.existsSync(sharedSrc)) {
    copyDir(sharedSrc, path.join(pkgDir, 'shared'));
    console.log(`  copied shared → dist/${handler}_pkg/shared/`);
  }

  // Copy node_modules to pkg root
  const nmDest = path.join(pkgDir, 'node_modules');
  if (!fs.existsSync(nmDest)) {
    copyDir(nm, nmDest);
    console.log(`  copied node_modules → dist/${handler}_pkg/node_modules/`);
  }

  // For migrate: copy SQL migration files into the handler subdir
  // so fs.readFileSync(join(__dirname, '001_schema.sql')) resolves correctly
  if (handler === 'migrate') {
    const migrationsDir = path.join(root, '..', 'db', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      for (const f of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))) {
        fs.copyFileSync(path.join(migrationsDir, f), path.join(handlerSubDir, f));
      }
      console.log(`  copied SQL files → dist/migrate_pkg/migrate/`);
    }
  }
}

console.log('\nBundle complete. Terraform can now zip each dist/<handler>_pkg/ folder.');
