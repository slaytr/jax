#!/usr/bin/env node
/**
 * Applies every unapplied file in api/migrations/, in filename order, each
 * inside its own transaction. Tracks what's already run in a
 * schema_migrations table so this is safe to run on every deploy — nothing
 * happens if there's nothing new.
 *
 * Usage: node api/migrate.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function main() {
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

main()
  .catch((error) => {
    console.error(`\nMigration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
