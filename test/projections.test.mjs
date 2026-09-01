import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  projectGroupRank,
  projectPlayerState,
  projectLatest,
  projectHistory,
  projectQuest,
  projectQuests,
  projectGoal,
  projectGoalLabel,
} from '../api/projections.mjs';

describe('projectGroupRank', () => {
  it('returns null when there is no group_state row yet', () => {
    assert.equal(projectGroupRank(null, 'Jax'), null);
  });

  it('takes name from the group, not the row — group_state has no name column', () => {
    const row = {
      rank: 892,
      total_level: 6830,
      total_xp: '66735037', // pg returns bigint as a string
      size: 5,
      founder: false,
      external_id: 447161,
      competitive: true,
      total_groups: 2025,
      rivals: [{ name: 'hai team', rank: 889 }],
      source_url: 'https://rs.runescape.com/hiscores/…',
      stale: false,
      error: null,
      checked_at: '2026-09-01T17:02:04.966Z',
    };
    assert.deepEqual(projectGroupRank(row, 'Jax'), {
      rank: 892,
      name: 'Jax',
      totalLevel: 6830,
      totalXp: 66735037, // coerced back to a number
      size: 5,
      founder: false,
      id: 447161,
      competitive: true,
      totalGroups: 2025,
      rivals: [{ name: 'hai team', rank: 889 }],
      sourceUrl: 'https://rs.runescape.com/hiscores/…',
      stale: false,
      error: null,
      checkedAt: '2026-09-01T17:02:04.966Z',
    });
  });

  it('accepts a real Date for checked_at and ISO-stringifies it', () => {
    const row = { rank: 1, total_xp: '0', checked_at: new Date('2026-01-01T00:00:00.000Z') };
    assert.equal(projectGroupRank(row, 'Jax').checkedAt, '2026-01-01T00:00:00.000Z');
  });
});

describe('projectPlayerState', () => {
  it('shapes a joined players+player_state+quest-status row into a latest.json player entry', () => {
    const row = {
      slug: 'jelly-tax',
      name: 'Jelly Tax',
      hiscore_table: 'main',
      stale: false,
      error: null,
      total_level: 1911,
      total_xp: '27148605',
      total_rank: 392817,
      quest_points: 195,
      quests_complete: 132,
      quests_stale: false,
      skills: [{ id: 0, level: 1911, xp: 27148605, rank: 392817 }],
      activities: [{ name: 'RuneScore', score: 3500, rank: 301240 }],
      completedQuests: ['Cook’s Assistant'],
      startedQuests: ['Recipe for Disaster'],
    };
    assert.deepEqual(projectPlayerState(row), {
      slug: 'jelly-tax',
      name: 'Jelly Tax',
      table: 'main',
      stale: false,
      error: null,
      total: { level: 1911, xp: 27148605, rank: 392817 },
      questPoints: 195,
      questsComplete: 132,
      completedQuests: ['Cook’s Assistant'],
      startedQuests: ['Recipe for Disaster'],
      questsStale: false,
      skills: [{ id: 0, level: 1911, xp: 27148605, rank: 392817 }],
      activities: [{ name: 'RuneScore', score: 3500, rank: 301240 }],
    });
  });

  it('an unranked total (total_rank null) stays null, not coerced to 0', () => {
    const row = { slug: 'x', name: 'X', hiscore_table: 'main', total_level: 1, total_xp: '0', total_rank: null };
    assert.equal(projectPlayerState(row).total.rank, null);
  });

  it('defaults completedQuests/startedQuests/skills/activities to empty arrays', () => {
    const row = { slug: 'x', name: 'X', hiscore_table: 'main', total_level: 1, total_xp: '0' };
    const projected = projectPlayerState(row);
    assert.deepEqual(projected.completedQuests, []);
    assert.deepEqual(projected.startedQuests, []);
    assert.deepEqual(projected.skills, []);
    assert.deepEqual(projected.activities, []);
  });
});

describe('projectLatest', () => {
  it('combines group/roster/state rows into the data/latest.json shape, players in the given order', () => {
    const result = projectLatest({
      fetchedAt: '2026-09-01T17:01:59.277Z',
      trackingSince: '2026-08-23T00:50:21.000Z',
      group: { name: 'Jax', tagline: 'Competitive Group Ironman', hiscores_url: 'https://rs.runescape.com/hiscores/…' },
      groupRankRow: null,
      players: [
        { slug: 'a', name: 'A', hiscore_table: 'main', total_level: 1, total_xp: '1' },
        { slug: 'b', name: 'B', hiscore_table: 'main', total_level: 2, total_xp: '2' },
      ],
    });

    assert.equal(result.version, 1);
    assert.equal(result.fetchedAt, '2026-09-01T17:01:59.277Z');
    assert.equal(result.trackingSince, '2026-08-23T00:50:21.000Z');
    assert.deepEqual(result.group, { name: 'Jax', tagline: 'Competitive Group Ironman', hiscoresUrl: 'https://rs.runescape.com/hiscores/…' });
    assert.equal(result.groupRank, null);
    assert.deepEqual(result.players.map((p) => p.slug), ['a', 'b']);
  });
});

describe('projectHistory', () => {
  const row = (overrides) => ({
    taken_at: '2026-09-01T00:03:55.000Z',
    group_rank: 904,
    player_slug: 'jelly-tax',
    xp: new Array(30).fill('0'),
    levels: new Array(30).fill(1),
    quest_points: 195,
    ...overrides,
  });

  it('groups flat (snapshot, player) rows back into one {t,p,l,r,q} entry per snapshot', () => {
    const rows = [row({ player_slug: 'jelly-tax' }), row({ player_slug: 'melooms', xp: new Array(30).fill('5') })];
    const [snapshot] = projectHistory(rows);
    assert.equal(snapshot.t, 1788221035);
    assert.equal(snapshot.r, 904);
    assert.deepEqual(Object.keys(snapshot.p).sort(), ['jelly-tax', 'melooms']);
    assert.deepEqual(Object.keys(snapshot.l).sort(), ['jelly-tax', 'melooms']);
    assert.equal(snapshot.q['jelly-tax'], 195);
  });

  it('coerces bigint-as-string xp array elements back to numbers', () => {
    const [snapshot] = projectHistory([row({ xp: ['16449177', '278292', ...new Array(28).fill('0')] })]);
    assert.equal(snapshot.p['jelly-tax'][0], 16449177);
    assert.equal(typeof snapshot.p['jelly-tax'][0], 'number');
  });

  it('omits `l` entirely for a pre-schema-upgrade snapshot (null levels), rather than a zero vector', () => {
    const [snapshot] = projectHistory([row({ levels: null })]);
    assert.equal('l' in snapshot, false);
  });

  it('omits `r` when there is no group rank for that snapshot', () => {
    const [snapshot] = projectHistory([row({ group_rank: null })]);
    assert.equal('r' in snapshot, false);
  });

  it('omits `q` when no player has a quest-points reading in that snapshot', () => {
    const [snapshot] = projectHistory([row({ quest_points: null })]);
    assert.equal('q' in snapshot, false);
  });

  it('sorts snapshots ascending by t regardless of input row order', () => {
    const rows = [row({ taken_at: '2026-09-01T00:03:55.000Z' }), row({ taken_at: '2026-08-30T00:00:00.000Z' })];
    const result = projectHistory(rows);
    assert.ok(result[0].t < result[1].t);
  });
});

describe('projectQuest', () => {
  it('splits quest_prerequisites back into questRequirements vs recommendedQuests by relation', () => {
    const row = { name: 'Dragon Slayer', slug: 'dragon-slayer', misc_requirements: [], full_completion_requirements: [] };
    const result = projectQuest(row, {
      skillRequirements: [{ skill: 'Crafting', level: 8, position: 0 }],
      prerequisites: [
        { requires: 'Bar Crawl', relation: 'required', position: 0 },
        { requires: 'Elemental Workshop I', relation: 'recommended', position: 0 },
      ],
    });
    assert.deepEqual(result.questRequirements, [{ quest: 'Bar Crawl', relation: 'required' }]);
    assert.deepEqual(result.recommendedQuests, [{ quest: 'Elemental Workshop I' }]);
    assert.deepEqual(result.skillRequirements, [{ skill: 'Crafting', level: 8 }]);
  });

  it('defaults array fields to empty arrays when there are none', () => {
    const row = { name: 'Q', slug: 'q', misc_requirements: [], full_completion_requirements: [] };
    const result = projectQuest(row);
    assert.deepEqual(result.skillRequirements, []);
    assert.deepEqual(result.questRequirements, []);
    assert.deepEqual(result.recommendedQuests, []);
  });
});

describe('projectQuests', () => {
  it('wraps a quest list with a count', () => {
    assert.deepEqual(projectQuests([{ name: 'A' }, { name: 'B' }]), { count: 2, quests: [{ name: 'A' }, { name: 'B' }] });
  });
});

describe('projectGoal', () => {
  it('a skill goal carries skill fields and no questName key at all', () => {
    const row = {
      id: 'uuid-1',
      kind: 'skill',
      goal_group: null,
      labels: ['combat'],
      started_at: '2026-08-01T00:00:00.000Z',
      completed_at: null,
      skill_id: 1,
      target_type: 'level',
      target_value: '75',
      start_level: 70,
      start_xp: '814445',
      completed_level: null,
      completed_xp: null,
    };
    const result = projectGoal(row);
    assert.equal('questName' in result, false);
    assert.equal(result.targetValue, 75);
    assert.equal(typeof result.targetValue, 'number');
    assert.equal(result.startXp, 814445);
  });

  it('a quest goal carries questName and no skill fields at all', () => {
    const row = {
      id: 'uuid-2',
      kind: 'quest',
      quest_name: "Nomad's Requiem",
      goal_group: "Nomad's Requiem",
      labels: [],
      started_at: '2026-08-01T00:00:00.000Z',
      completed_at: '2026-08-02T00:00:00.000Z',
    };
    const result = projectGoal(row);
    assert.equal(result.questName, "Nomad's Requiem");
    assert.equal('skillId' in result, false);
    assert.equal('targetType' in result, false);
    assert.equal(result.completedAt, '2026-08-02T00:00:00.000Z');
  });

  it('a real Date for started_at/completed_at is ISO-stringified', () => {
    const row = {
      id: 'uuid-3',
      kind: 'quest',
      quest_name: 'Q',
      goal_group: 'Q',
      labels: [],
      started_at: new Date('2026-08-01T00:00:00.000Z'),
      completed_at: null,
    };
    assert.equal(projectGoal(row).startedAt, '2026-08-01T00:00:00.000Z');
    assert.equal(projectGoal(row).completedAt, null);
  });
});

describe('projectGoalLabel', () => {
  it('shapes a goal_labels row into {name, colour}', () => {
    assert.deepEqual(projectGoalLabel({ player_slug: 'jelly-tax', name: 'combat', colour: '#cc3346' }), {
      name: 'combat',
      colour: '#cc3346',
    });
  });
});
