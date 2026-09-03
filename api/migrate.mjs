#!/usr/bin/env node
/**
 * Applies every unapplied file in api/migrations/, in filename order, each
 * inside its own transaction. Tracks what's already run in a
 * schema_migrations table so this is safe to run on every deploy — nothing
 * happens if there's nothing new.
 *
 * runMigrations() is also called from server.mjs's own boot sequence, before
 * it starts listening — a deploy's new code and its own new migration(s)
 * land together that way, with no window where the new code is already
 * serving requests against a schema that hasn't caught up yet (an earlier
 * version of this relied on a separate CI step reaching the right Railway
 * instance after the fact, which is exactly what left column
 * ps.latest_activity missing in production for a while). Doesn't close the
 * pool itself — server.mjs keeps using the same one afterward; only the CLI
 * entry point below (`node api/migrate.mjs`, for a manual run) does that.
 *
 * Usage: node api/migrate.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { pool, withTransaction, closePool } from './db.mjs';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `);
}

async function appliedFilenames() {
  const { rows } = await pool.query('select filename from schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function applyMigration(filename) {
  const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');
  await withTransaction(async (client) => {
    await client.query(sql);
    await client.query('insert into schema_migrations (filename) values ($1)', [filename]);
  });
}

export async function runMigrations() {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  const pending = files.filter((name) => !applied.has(name));

  if (pending.length === 0) {
    console.log('No pending migrations.');
    return;
  }

  for (const filename of pending) {
    process.stdout.write(`Applying ${filename}... `);
    await applyMigration(filename);
    console.log('ok');
  }

  console.log(`Applied ${pending.length} migration(s).`);
}

async function main() {
  try {
    await runMigrations();
  } catch (error) {
    console.error(`\nMigration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

// Only auto-run when invoked directly (`node api/migrate.mjs`) — same
// dependency-injection guard server.mjs uses, so importing runMigrations
// (server.mjs's own boot sequence) never triggers this a second time or
// closes the shared pool out from under it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
