import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendSnapshot, isRedundant, mergePlayers, pruneSnapshots, toSnapshot } from '../scripts/snapshots.mjs';

const DAY = 86400;

const skills = (overall, attack = 0) => [
  { id: 0, level: 10, xp: overall, rank: 1 },
  { id: 1, level: 5, xp: attack, rank: 2 },
];

const okResult = (slug, overall, attack) => ({ ok: true, slug, name: slug, table: 'main', skills: skills(overall, attack), activities: [] });

describe('toSnapshot', () => {
  it('keeps only successful fetches and indexes xp by skill id', () => {
    const snapshot = toSnapshot([okResult('a', 100, 40), { ok: false, slug: 'b', error: 'boom' }], 1000);

    assert.equal(snapshot.t, 1000);
    assert.deepEqual(Object.keys(snapshot.p), ['a']);
    assert.equal(snapshot.p.a[0], 100);
    assert.equal(snapshot.p.a[1], 40);
    assert.equal(snapshot.p.a.length, 30, 'vector is padded to the full skill count');
  });

  it('stores a level vector alongside xp', () => {
    const snapshot = toSnapshot([okResult('a', 100, 40)], 1000);

    assert.equal(snapshot.l.a[0], 10, 'overall level');
    assert.equal(snapshot.l.a[1], 5, 'attack level');
    assert.equal(snapshot.l.a.length, 30);
  });

  it('records the group rank when one is supplied', () => {
    assert.equal(toSnapshot([okResult('a', 1)], 1000, { rank: 1048 }).r, 1048);
    assert.equal('r' in toSnapshot([okResult('a', 1)], 1000, null), false);
  });
});

describe('isRedundant', () => {
  it('is true when nothing moved', () => {
    const first = toSnapshot([okResult('a', 100)], 1000);
    const second = toSnapshot([okResult('a', 100)], 2000);
    assert.equal(isRedundant(second, first), true);
  });

  it('is false when any xp changed', () => {
    const first = toSnapshot([okResult('a', 100)], 1000);
    const second = toSnapshot([okResult('a', 101)], 2000);
    assert.equal(isRedundant(second, first), false);
  });

  it('is false against no previous snapshot', () => {
    assert.equal(isRedundant(toSnapshot([okResult('a', 1)], 1), undefined), false);
  });

  it('is false when the ladder rank moved but no xp did', () => {
    const first = toSnapshot([okResult('a', 100)], 1000, { rank: 1050 });
    const second = toSnapshot([okResult('a', 100)], 2000, { rank: 1048 });
    assert.equal(isRedundant(second, first), false);
  });

  it('is false when the new snapshot carries levels the old one lacks', () => {
    // Otherwise a schema upgrade would never be written until someone gained xp.
    const legacy = { t: 1000, p: { a: new Array(30).fill(0) } };
    const upgraded = toSnapshot([okResult('a', 0)], 2000);

    assert.equal(isRedundant(upgraded, legacy), false);
  });
});

describe('appendSnapshot', () => {
  it('records trackingSince from the first snapshot', () => {
    const { history, appended } = appendSnapshot(null, toSnapshot([okResult('a', 100)], 1_700_000_000));

    assert.equal(appended, true);
    assert.equal(history.snapshots.length, 1);
    assert.equal(history.trackingSince, new Date(1_700_000_000 * 1000).toISOString());
  });

  it('skips a duplicate reading but preserves history', () => {
    const first = appendSnapshot(null, toSnapshot([okResult('a', 100)], 1000)).history;
    const { history, appended } = appendSnapshot(first, toSnapshot([okResult('a', 100)], 2000));

    assert.equal(appended, false);
    assert.equal(history.snapshots.length, 1);
  });

  it('does not mutate the history it is given', () => {
    const first = appendSnapshot(null, toSnapshot([okResult('a', 100)], 1000)).history;
    const before = JSON.stringify(first);

    appendSnapshot(first, toSnapshot([okResult('a', 200)], 2000));
    assert.equal(JSON.stringify(first), before);
  });
});

describe('pruneSnapshots', () => {
  it('leaves recent snapshots at full resolution', () => {
    const now = 100 * DAY;
    const recent = [now - 3600, now - 1800, now].map((t) => ({ t, p: {} }));
    assert.equal(pruneSnapshots(recent, now).length, 3);
  });

  it('thins snapshots older than the window to one per day', () => {
    const now = 200 * DAY;
    const oldDay = 100 * DAY;
    const snapshots = [
      { t: oldDay + 1, p: { a: [1] } },
      { t: oldDay + 2, p: { a: [2] } },
      { t: oldDay + 3, p: { a: [3] } },
      { t: now, p: { a: [9] } },
    ];

    const pruned = pruneSnapshots(snapshots, now);

    assert.equal(pruned.length, 2, 'one survivor from the old day plus the recent one');
    assert.equal(pruned[0].p.a[0], 3, 'keeps the last reading of the day');
    assert.equal(pruned[1].t, now);
  });

  it('returns snapshots in ascending time order', () => {
    const now = 200 * DAY;
    const pruned = pruneSnapshots([{ t: now }, { t: 10 * DAY }, { t: 50 * DAY }], now);
    assert.deepEqual(
      pruned.map((s) => s.t),
      [10 * DAY, 50 * DAY, now],
    );
  });
});

describe('mergePlayers', () => {
  const roster = [{ slug: 'a', name: 'A', table: 'main' }];

  it('maps a successful fetch onto totals', () => {
    const [player] = mergePlayers(roster, [okResult('a', 500, 100)], []);

    assert.equal(player.stale, false);
    assert.equal(player.total.xp, 500);
    assert.equal(player.total.level, 10);
  });

  it('carries the previous reading forward and flags it stale', () => {
    const previous = [{ slug: 'a', name: 'A', total: { level: 10, xp: 500, rank: 1 }, skills: skills(500) }];
    const [player] = mergePlayers(roster, [{ ok: false, slug: 'a', error: 'timeout' }], previous);

    assert.equal(player.stale, true);
    assert.equal(player.error, 'timeout');
    assert.equal(player.total.xp, 500, 'a failed fetch must not blank the leaderboard');
  });

  it('produces a zeroed placeholder when there is nothing to carry forward', () => {
    const [player] = mergePlayers(roster, [{ ok: false, slug: 'a', error: '404' }], []);

    assert.equal(player.stale, true);
    assert.equal(player.total.xp, 0);
    assert.deepEqual(player.skills, []);
  });
});
