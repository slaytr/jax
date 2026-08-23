import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isRedundant, mergePlayers, toSnapshot } from '../scripts/snapshots.mjs';

const skills = (overall, attack = 0) => [
  { id: 0, level: 10, xp: overall, rank: 1 },
  { id: 1, level: 5, xp: attack, rank: 2 },
];

const okResult = (slug, overall, attack) => ({ ok: true, slug, name: slug, table: 'main', skills: skills(overall, attack), activities: [] });
const okQuest = (points) => ({ ok: true, questPoints: points, questsComplete: 1 });

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

  it('stores quest points when supplied, keyed by slug', () => {
    const snapshot = toSnapshot([okResult('a', 100)], 1000, null, { a: okQuest(50) });
    assert.equal(snapshot.q.a, 50);
  });

  it('omits a player whose quest fetch failed', () => {
    const snapshot = toSnapshot([okResult('a', 100)], 1000, null, { a: { ok: false, error: 'boom' } });
    assert.equal('a' in (snapshot.q ?? {}), false);
  });

  it('omits the q field entirely when no quest data is supplied', () => {
    assert.equal('q' in toSnapshot([okResult('a', 100)], 1000), false);
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

  it('is false when the new snapshot carries quest points the old one lacks', () => {
    const legacy = { t: 1000, p: { a: new Array(30).fill(0) } };
    const upgraded = toSnapshot([okResult('a', 0)], 2000, null, { a: okQuest(10) });

    assert.equal(isRedundant(upgraded, legacy), false);
  });

  it('is false when quest points changed but xp did not', () => {
    const first = toSnapshot([okResult('a', 100)], 1000, null, { a: okQuest(10) });
    const second = toSnapshot([okResult('a', 100)], 2000, null, { a: okQuest(15) });
    assert.equal(isRedundant(second, first), false);
  });

  it('is true when quest points are unchanged too', () => {
    const first = toSnapshot([okResult('a', 100)], 1000, null, { a: okQuest(10) });
    const second = toSnapshot([okResult('a', 100)], 2000, null, { a: okQuest(10) });
    assert.equal(isRedundant(second, first), true);
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
