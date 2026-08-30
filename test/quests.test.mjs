import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { questPointsFrom } from '../scripts/quests.mjs';
import { mergePlayers } from '../scripts/snapshots.mjs';

const quest = (title, status, questPoints) => ({ title, status, questPoints, difficulty: 0, members: false });

describe('questPointsFrom', () => {
  it('sums points across completed quests only', () => {
    const result = questPointsFrom({
      quests: [
        quest('Cook\'s Assistant', 'COMPLETED', 1),
        quest('Dragon Slayer', 'COMPLETED', 2),
        quest('Lost City', 'STARTED', 3),
        quest('Monkey Madness', 'NOT_STARTED', 3),
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.questPoints, 3);
    assert.equal(result.questsComplete, 2);
    assert.equal(result.questsTotal, 4);
    assert.deepEqual(result.completedQuests, ["Cook's Assistant", 'Dragon Slayer']);
  });

  it('treats a missing questPoints value as zero rather than NaN', () => {
    const result = questPointsFrom({ quests: [quest('Odd One', 'COMPLETED', undefined)] });

    assert.equal(result.ok, true);
    assert.equal(result.questPoints, 0);
  });

  it('reports a private profile as a reason, not a crash', () => {
    const result = questPointsFrom({ error: 'PROFILE_PRIVATE', loggedIn: 'false' });

    assert.equal(result.ok, false);
    assert.match(result.error, /PROFILE_PRIVATE/);
  });

  it('rejects a payload with no quest list', () => {
    assert.equal(questPointsFrom({}).ok, false);
    assert.equal(questPointsFrom(null).ok, false);
  });
});

describe('mergePlayers with quest points', () => {
  const roster = [{ slug: 'a', name: 'A', table: 'main' }];
  const hiscoreOk = {
    ok: true,
    slug: 'a',
    name: 'A',
    table: 'main',
    skills: [
      { id: 0, level: 10, xp: 500, rank: 1 },
      { id: 1, level: 5, xp: 100, rank: 2 },
    ],
    activities: [],
  };

  it('attaches quest points when the lookup succeeded', () => {
    const [player] = mergePlayers(roster, [hiscoreOk], [], {
      a: { ok: true, questPoints: 159, questsComplete: 107, completedQuests: ['Dragon Slayer'] },
    });

    assert.equal(player.questPoints, 159);
    assert.equal(player.questsComplete, 107);
    assert.deepEqual(player.completedQuests, ['Dragon Slayer']);
    assert.equal(player.questsStale, false);
  });

  it('keeps the previous completed-quests list when the profile turns private', () => {
    const previous = [{ slug: 'a', name: 'A', questPoints: 159, questsComplete: 107, completedQuests: ['Dragon Slayer'] }];
    const [player] = mergePlayers(roster, [hiscoreOk], previous, {
      a: { ok: false, error: 'RuneMetrics: PROFILE_PRIVATE' },
    });

    assert.equal(player.questPoints, 159, 'a private profile must not zero the column');
    assert.deepEqual(player.completedQuests, ['Dragon Slayer']);
    assert.equal(player.questsStale, true);
  });

  it('reports null quest points and an empty completed-quests list when there is nothing to carry forward', () => {
    const [player] = mergePlayers(roster, [hiscoreOk], [], { a: { ok: false, error: 'boom' } });

    assert.equal(player.questPoints, null);
    assert.deepEqual(player.completedQuests, []);
    assert.equal(player.questsStale, true);
  });

  it('still records quest points when the hiscore fetch itself failed', () => {
    const previous = [{ slug: 'a', name: 'A', total: { level: 10, xp: 500, rank: 1 }, skills: [] }];
    const [player] = mergePlayers(roster, [{ ok: false, slug: 'a', error: 'timeout' }], previous, {
      a: { ok: true, questPoints: 42, questsComplete: 20 },
    });

    assert.equal(player.stale, true, 'hiscore data is stale');
    assert.equal(player.questPoints, 42, 'but fresh quest points still land');
    assert.equal(player.questsStale, false);
  });
});
