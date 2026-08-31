import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeActivityCalendar } from '../assets/js/compute.js';

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);

describe('computeActivityCalendar', () => {
  it('front-aligns the window to a Sunday and stops at "today", short-changing only the current week', () => {
    // "Now" is Monday 2026-08-24 (UTC day 1), so a 3-week grid needs
    // (3 - 1) * 7 + 1 + 1 = 16 days: 2026-08-09 (a Sunday) through 08-24.
    const snapshots = [
      { t: t('2026-08-01T00:00:00Z'), p: { a: [0] } },
      { t: t('2026-08-24T06:00:00Z'), p: { a: [1000] } }, // "now"
    ];

    const days = computeActivityCalendar(snapshots, 'a', 3);
    assert.equal(days.length, 16);
    assert.equal(new Date(days[0].dayStart * 1000).getUTCDay(), 0, 'the first entry lands on a Sunday');
    assert.equal(days[days.length - 1].dayStart, t('2026-08-24T00:00:00Z'), 'the last entry is today');

    // Indexing as a 7-row grid, `days[column * 7 + row]`, the final column
    // (column 2) only has rows 0 (Sun) and 1 (Mon) — the rest of that week
    // hasn't happened yet, so those indices simply fall past the array end.
    assert.equal(days.length, 2 * 7 + 2);
  });

  it('reports null, not zero, for a day before this player was tracked — same as computeDailyBreakdown', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-24T00:00:00Z'), p: { a: [130] } }, // "now" — Monday
    ];

    const days = computeActivityCalendar(snapshots, 'a', 2);
    assert.equal(days[0].gained, null, 'this window reaches back before the group was tracked at all');
    assert.ok(days.some((day) => day.gained === 30), 'the real gain still shows up once history starts');
  });

  it('returns an empty array when there is no history at all', () => {
    assert.deepEqual(computeActivityCalendar([], 'a', 53), []);
  });
});
