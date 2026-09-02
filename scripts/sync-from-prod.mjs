#!/usr/bin/env node
/**
 * Mirrors the production database into your local one, for local dev
 * against real data. Two roles in one file, chosen by whether --dump is
 * passed — no pg_dump/pg_restore dependency; both sides just use the same
 * `pg` package already used everywhere else in api/.
 *
 * - `node scripts/sync-from-prod.mjs --dump` — meant to run *inside*
 *   Railway (see below), where DATABASE_URL is already production's own.
 *   Reads every synced table and prints one JSON object to stdout.
 * - `node scripts/sync-from-prod.mjs` (no flag) — the orchestrator, meant
 *   to run on your machine. Shells out to `railway ssh` to run the dump
 *   *inside* Railway's network (your machine can't reach
 *   postgres.railway.internal directly — see the plan's own notes on
 *   this), captures its stdout, then truncates and reloads your own
 *   DATABASE_URL (your local Postgres) with it.
 *
 * Prerequisites: the Railway CLI installed and logged in
 * (`railway login`), and your own local DATABASE_URL already migrated
 * (`npm run migrate`) before the first sync.
 *
 * Usage: node scripts/sync-from-prod.mjs [--service <name>]
 */

import { execFileSync } from 'node:child_process';

import { pool, withTransaction, closePool } from '../api/db.mjs';

/**
 * Every table worth mirroring, in FK-safe insertion order. Deliberately
 * excludes three tables that a data sync shouldn't touch:
 * - `sessions` — a session id is only useful paired with the browser
 *   cookie that has the matching value, which never leaves that browser;
 *   a synced row has no local counterpart to authenticate with.
 * - `refresh_runs` — a log of past on-demand refreshes, not state
 *   anything reads back.
 * - `schema_migrations` — each environment tracks its own migration
 *   history via `npm run migrate`; overwriting it from prod would be
 *   meaningless (same migration files, different local run history).
 */
const TABLES = [
  'groups',
  'players',
  'users',
  'group_state',
  'player_state',
  'player_quest_status',
  'snapshots',
  'player_snapshots',
  'quests',
  'quest_skill_requirements',
  'quest_prerequisites',
  'goals',
  'goal_labels',
];

/** Columns the `pg` driver hands back already-parsed as JS objects/arrays
 * (jsonb) — these need JSON.stringify again before going back in as an
 * insert parameter, unlike plain array-typed columns (bigint[]/int[]/
 * text[]), which the driver serializes correctly on its own either way. */
const JSONB_COLUMNS = {
  group_state: ['rivals'],
  player_state: ['skills', 'activities'],
  quests: ['misc_requirements', 'full_completion_requirements'],
};

async function dump() {
  const payload = {};
  for (const table of TABLES) {
    const { rows } = await pool.query(`select * from ${table}`);
    payload[table] = rows;
  }
  process.stdout.write(JSON.stringify(payload));
  // No closePool() here — main()'s own .finally(closePool) covers this path
  // too; calling it twice throws ("Called end on pool more than once").
}

async function loadTable(client, table, rows) {
  if (rows.length === 0) return 0;

  const columns = Object.keys(rows[0]);
  const jsonbCols = new Set(JSONB_COLUMNS[table] ?? []);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

  for (const row of rows) {
    const values = columns.map((col) => (jsonbCols.has(col) ? JSON.stringify(row[col]) : row[col]));
    await client.query(`insert into ${table} (${columns.join(', ')}) values (${placeholders})`, values);
  }
  return rows.length;
}

/**
 * Every synced table whose primary key is a serial/bigserial, so its
 * sequence needs re-syncing after a bulk load — `snapshots` is the only
 * one today (everything else keys off a natural id: a slug, a Discord id,
 * a client-generated uuid, or a composite key).
 */
const SERIAL_PK_TABLES = { snapshots: { column: 'id', sequence: 'snapshots_id_seq' } };

/**
 * `loadTable` inserts each row with its own explicit primary-key value
 * (preserving `snapshots.id` is what lets `player_snapshots.snapshot_id`
 * still point at the right row) — `RESTART IDENTITY` above resets the
 * sequence to its start, and an explicit-value insert never advances a
 * sequence the way relying on its own DEFAULT nextval() would. Left alone,
 * the sequence stays stuck at 1 while the table's real rows go far past
 * it, so the very next *ordinary* insert (no explicit id — every write
 * this app makes outside this script) collides with a row this sync just
 * loaded. Re-synced here, once, right after the bulk load.
 */
async function resyncSerialSequences(client) {
  for (const [table, { column, sequence }] of Object.entries(SERIAL_PK_TABLES)) {
    await client.query(`select setval($1, coalesce((select max(${column}) from ${table}), 1), exists(select 1 from ${table}))`, [
      sequence,
    ]);
  }
}

async function restore(payload) {
  await withTransaction(async (client) => {
    // One TRUNCATE with CASCADE handles the whole dependency graph
    // regardless of listed order — Postgres follows the FK graph itself,
    // so this doesn't need to be the reverse of TABLES.
    await client.query(`truncate ${TABLES.join(', ')} restart identity cascade`);

    for (const table of TABLES) {
      const count = await loadTable(client, table, payload[table] ?? []);
      console.log(`  ${table}: ${count} row(s)`);
    }

    await resyncSerialSequences(client);
  });
}

function dumpFromProd(service) {
  console.log(`Dumping from production (railway ssh --service ${service})…`);
  const json = execFileSync('railway', ['ssh', '--service', service, '--', 'node', 'scripts/sync-from-prod.mjs', '--dump'], {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    // Windows resolves `railway` to railway.cmd via PATHEXT, which
    // execFileSync only does when shell is involved — without this it
    // fails with ENOENT even though `where railway` finds it fine.
    shell: true,
  });
  return JSON.parse(json);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--dump')) {
    await dump();
    return;
  }

  const serviceIndex = args.indexOf('--service');
  const service = serviceIndex === -1 ? 'web' : args[serviceIndex + 1];

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — point it at your local Postgres before syncing (see .env.local.example).');
  }

  const payload = dumpFromProd(service);
  console.log('Loading into local Postgres…');
  await restore(payload);
  console.log('\nSync complete.');
}

main()
  .catch((error) => {
    console.error(`\nSync failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
