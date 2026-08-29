import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeDailyLeaderCounts } from '../assets/js/compute.js';

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const players = [
  { slug: 'a', name: 'A' },
  { slug: 'b', name: 'B' },
];

describe('computeDailyLeaderCounts', () => {
  it('counts one day per player for whichever of them gained the most that day', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [0], b: [0] } },
      { t: t('2026-08-21T00:00:00Z'), p: { a: [50], b: [10] } }, // A leads the 20th
      { t: t('2026-08-22T00:00:00Z'), p: { a: [60], b: [90] } }, // B leads the 21st
      { t: t('2026-08-22T12:00:00Z'), p: { a: [60], b: [90] } }, // "now" — no gain either way on the 22nd
    ];

    const { rows } = computeDailyLeaderCounts(snapshots, players, 'xp', 3);
    const a = rows.find((row) => row.player.slug === 'a');
    const b = rows.find((row) => row.player.slug === 'b');

    assert.equal(a.days, 1, 'A led the 20th');
    assert.equal(b.days, 1, 'B led the 21st');
    assert.equal(rows[0].total > 0, true, 'ties in days fall back to the week total, which needs to be populated');
  });

  it('crowns nobody for a day that ends in an exact tie', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [0], b: [0] } },
      { t: t('2026-08-21T00:00:00Z'), p: { a: [50], b: [50] } }, // tied gain
    ];

    const { rows } = computeDailyLeaderCounts(snapshots, players, 'xp', 1);
    assert.equal(rows.every((row) => row.days === 0), true, 'a tie is not a win for either side');
  });

  it('breaks a tie in day-count by the week\'s raw total', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [0], b: [0] } },
      { t: t('2026-08-21T00:00:00Z'), p: { a: [100], b: [10] } }, // the 20th: A leads big
      { t: t('2026-08-22T00:00:00Z'), p: { a: [110], b: [30] } }, // the 21st: B leads small
    ];

    const { rows } = computeDailyLeaderCounts(snapshots, players, 'xp', 3);
    assert.equal(rows[0].days, 1);
    assert.equal(rows[1].days, 1);
    // Both led exactly one day, so the tie falls back to who gained more overall
    // (A's 100+10=110 vs B's 10+20=30).
    assert.equal(rows[0].player.slug, 'a', "A's bigger total outranks B's once day-counts tie");
  });

  it('reports validDays as how far the group\'s own history actually reaches', () => {
    const snapshots = [
      { t: t('2026-08-21T00:00:00Z'), p: { a: [0], b: [0] } },
      { t: t('2026-08-22T00:00:00Z'), p: { a: [50], b: [10] } },
    ];

    // Asking for 5 days reaches back 3 days before any history exists.
    const { validDays } = computeDailyLeaderCounts(snapshots, players, 'xp', 5);
    assert.equal(validDays, 2, 'only the 21st and 22nd have any data at all');
  });

  it('does not crown a leader on a day nobody gained anything', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [50], b: [10] } },
      { t: t('2026-08-21T00:00:00Z'), p: { a: [50], b: [10] } }, // no movement at all
    ];

    const { rows, validDays } = computeDailyLeaderCounts(snapshots, players, 'xp', 1);
    assert.equal(validDays, 1, 'the day has data, it just has no gains');
    assert.equal(rows.every((row) => row.days === 0), true);
  });
});
