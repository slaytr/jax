import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { appendDailySnapshot, dayKeyOf, pathForDay } from '../scripts/history-store.mjs';
import { isRedundant } from '../scripts/snapshots.mjs';

const snapshot = (t, xp) => ({ t, p: { a: [xp] } });

describe('dayKeyOf', () => {
  it('formats an epoch second as a UTC day key', () => {
    assert.equal(dayKeyOf(1787446221), '2026-08-23');
  });
});

describe('pathForDay', () => {
  it('groups the day file under a month folder', () => {
    assert.equal(pathForDay('data', '2026-08-23'), join('data', 'history', '2026-08', '23.json'));
  });
});

describe('appendDailySnapshot', () => {
  let dataDir;

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'jax-history-'));
  });

  after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('creates the month folder and day file on the first write', async () => {
    const { appended, dayKey, count } = await appendDailySnapshot(dataDir, snapshot(1787446221, 100), isRedundant);

    assert.equal(appended, true);
    assert.equal(dayKey, '2026-08-23');
    assert.equal(count, 1);

    const file = JSON.parse(await readFile(pathForDay(dataDir, dayKey), 'utf8'));
    assert.equal(file.day, '2026-08-23');
    assert.equal(file.snapshots.length, 1);
  });

  it('appends a second reading the same day to the same file', async () => {
    const { count } = await appendDailySnapshot(dataDir, snapshot(1787446221 + 3600, 200), isRedundant);
    assert.equal(count, 2);
  });

  it('skips a redundant reading without touching the file', async () => {
    const before = await readFile(pathForDay(dataDir, '2026-08-23'), 'utf8');
    const { appended, count } = await appendDailySnapshot(dataDir, snapshot(1787446221 + 7200, 200), isRedundant);

    assert.equal(appended, false);
    assert.equal(count, 2, 'still the same two readings');
    assert.equal(await readFile(pathForDay(dataDir, '2026-08-23'), 'utf8'), before);
  });

  it('starts a new file for the next day, comparing against the last day for redundancy', async () => {
    const nextDay = snapshot(1787446221 + 86400, 200); // same xp as the last reading
    const { appended, dayKey } = await appendDailySnapshot(dataDir, nextDay, isRedundant);

    assert.equal(appended, false, 'redundant across the day boundary');
    assert.equal(dayKey, '2026-08-24');
  });

  it('does write across the boundary once something actually changed', async () => {
    const nextDay = snapshot(1787446221 + 86400 + 60, 250);
    const { appended, count } = await appendDailySnapshot(dataDir, nextDay, isRedundant);

    assert.equal(appended, true);
    assert.equal(count, 1, 'first entry of the new day file');
  });
});
