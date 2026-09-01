#!/usr/bin/env node
/**
 * One-off verification, not part of the permanent test suite: compares
 * GET /api/latest and GET /api/history?days=33 against the committed
 * data/latest.json and the flattened, t-sorted data/history/** shards —
 * exactly what assets/js/data.js's loadGroupData() would have produced.
 * This is the phase-2 gate from the plan: if this doesn't come back clean,
 * the projection layer is wrong, not the client.
 *
 * Usage: API_BASE=http://localhost:4174 node scripts/verify-roundtrip.mjs
 */

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const API_BASE = process.env.API_BASE ?? 'http://localhost:4174';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function fetchApi(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(`${path} responded ${response.status}: ${body.error ?? 'unknown error'}`);
  }
  return body.data;
}

async function expectedHistory() {
  const historyDir = join(DATA_DIR, 'history');
  const monthDirs = await readdir(historyDir, { withFileTypes: true });
  const snapshots = [];
  for (const monthDir of monthDirs) {
    if (!monthDir.isDirectory()) continue;
    const dayFiles = await readdir(join(historyDir, monthDir.name));
    for (const dayFile of dayFiles) {
      if (!dayFile.endsWith('.json')) continue;
      const shard = await readJson(join(historyDir, monthDir.name, dayFile));
      snapshots.push(...(shard.snapshots ?? []));
    }
  }
  return snapshots.sort((a, b) => a.t - b.t);
}

/** Recursively sort every object's keys so JSON.stringify comparisons don't
 * false-positive on key order, which neither side's shape guarantees. */
function withSortedKeys(value) {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, withSortedKeys(value[key])]));
  }
  return value;
}

async function main() {
  const expectedLatest = await readJson(join(DATA_DIR, 'latest.json'));
  const actualLatest = await fetchApi('/api/latest');
  assert.deepEqual(withSortedKeys(actualLatest), withSortedKeys(expectedLatest), '/api/latest does not match data/latest.json');
  console.log(`ok  /api/latest matches data/latest.json (${actualLatest.players.length} players)`);

  const expected = await expectedHistory();
  const actual = (await fetchApi('/api/history?days=400')).snapshots;
  assert.equal(actual.length, expected.length, `/api/history snapshot count: expected ${expected.length}, got ${actual.length}`);
  assert.deepEqual(withSortedKeys(actual), withSortedKeys(expected), '/api/history does not match the flattened shards');
  console.log(`ok  /api/history matches data/history/** (${actual.length} snapshots)`);
}

main().catch((error) => {
  console.error(`\nFAIL  ${error.message}`);
  process.exitCode = 1;
});
