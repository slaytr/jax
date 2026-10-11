import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMatrix,
  buildTotalsRow,
  eliteMaxedSkillCounts,
  maxedSkillCounts,
  holdsMilestone,
  podiumCounts,
  starTotals,
} from '../assets/js/compute.js';
import { SKILLS } from '../assets/js/config.js';

const ATTACK = SKILLS.find((skill) => skill.name === 'Attack');
const MINING = SKILLS.find((skill) => skill.name === 'Mining');

const player = (slug, skills = {}, milestones = []) => ({
  slug,
  name: slug,
  colour: '#000',
  total: { level: 0, xp: 0, rank: null },
  skillById: Object.fromEntries(Object.entries(skills).map(([id, [level, xp]]) => [id, { level, xp, rank: null }])),
  milestones,
});

describe('milestone stars (first to 99 / first to 120)', () => {
  it('awards a star only to the recorded first, not to others who also reached the level', () => {
    const first = player('first', { [ATTACK.id]: [99, 13_034_431] }, [{ skillId: ATTACK.id, tier: 99 }]);
    const later = player('later', { [ATTACK.id]: [99, 13_500_000] });

    assert.equal(holdsMilestone(first, ATTACK.id, 99), true);
    assert.equal(holdsMilestone(later, ATTACK.id, 99), false);
    assert.equal(maxedSkillCounts([first, later]).first, 1);
    assert.equal(maxedSkillCounts([first, later]).later, 0);
  });

  it('keeps both the green and the blue star when one player is first to both 99 and 120 in a skill', () => {
    const both = player('both', {}, [
      { skillId: MINING.id, tier: 99 },
      { skillId: MINING.id, tier: 120 },
    ]);
    assert.equal(holdsMilestone(both, MINING.id, 99), true);
    assert.equal(holdsMilestone(both, MINING.id, 120), true);
    assert.equal(maxedSkillCounts([both]).both, 1);
    assert.equal(eliteMaxedSkillCounts([both]).both, 1);
  });

  it('splits the tiers between players: one first to 99, another first to 120', () => {
    const a = player('a', {}, [{ skillId: MINING.id, tier: 99 }]);
    const b = player('b', {}, [{ skillId: MINING.id, tier: 120 }]);
    assert.deepEqual([maxedSkillCounts([a, b]).a, maxedSkillCounts([a, b]).b], [1, 0]);
    assert.deepEqual([eliteMaxedSkillCounts([a, b]).a, eliteMaxedSkillCounts([a, b]).b], [0, 1]);
  });

  it('tolerates a player with no milestones field at all', () => {
    const bare = { slug: 'bare', skillById: {} };
    assert.equal(holdsMilestone(bare, ATTACK.id, 99), false);
    assert.equal(holdsMilestone(bare, ATTACK.id, 120), false);
    assert.equal(maxedSkillCounts([bare]).bare, 0);
  });
});

describe('cell place (silver / bronze stars)', () => {
  const placeOf = (matrix, slug) => matrix.find((row) => row.skill.id === ATTACK.id).cells.find((cell) => cell.player.slug === slug).place;
  const four = [
    player('a', { [ATTACK.id]: [80, 5_000_000] }),
    player('b', { [ATTACK.id]: [70, 3_000_000] }),
    player('c', { [ATTACK.id]: [60, 2_000_000] }),
    player('d', { [ATTACK.id]: [50, 1_000_000] }),
  ];

  it('places 1st, 2nd, 3rd by level, with 1st matching the leader', () => {
    const matrix = buildMatrix(four, 'level');
    assert.deepEqual(['a', 'b', 'c', 'd'].map((slug) => placeOf(matrix, slug)), [1, 2, 3, 4]);
    assert.equal(matrix.find((row) => row.skill.id === ATTACK.id).cells[0].isLeader, true);
  });

  it('counts from the weakest end when inverted, so the leader is still place 1', () => {
    const matrix = buildMatrix(four, 'level', true);
    assert.deepEqual(['d', 'c', 'b', 'a'].map((slug) => placeOf(matrix, slug)), [1, 2, 3, 4]);
  });

  it('gives untrained players no place', () => {
    const matrix = buildMatrix([player('only', { [ATTACK.id]: [70, 3_000_000] }), player('idle')], 'level');
    assert.equal(placeOf(matrix, 'idle'), null);
    assert.equal(placeOf(matrix, 'only'), 1);
  });

  it('places the Total row too', () => {
    const totals = buildTotalsRow([
      { ...player('x'), total: { level: 100, xp: 10, rank: null } },
      { ...player('y'), total: { level: 90, xp: 9, rank: null } },
    ]);
    assert.deepEqual(totals.cells.map((cell) => cell.place), [1, 2]);
  });
});

describe('starTotals', () => {
  it('combines gold/silver/bronze finishes with the green and blue milestones per player', () => {
    const players = [
      player('a', { [ATTACK.id]: [80, 5_000_000], [MINING.id]: [50, 100_000] }, [{ skillId: MINING.id, tier: 99 }]),
      player('b', { [ATTACK.id]: [70, 3_000_000], [MINING.id]: [60, 300_000] }, [{ skillId: ATTACK.id, tier: 120 }]),
    ];
    const totals = starTotals(players);
    assert.deepEqual(totals.a, { gold: 1, silver: 1, bronze: 0, green: 1, blue: 0 });
    assert.deepEqual(totals.b, { gold: 1, silver: 1, bronze: 0, green: 0, blue: 1 });
  });
});

describe('podiumCounts', () => {
  const players = [
    player('a', { [ATTACK.id]: [80, 5_000_000], [MINING.id]: [50, 100_000] }),
    player('b', { [ATTACK.id]: [70, 3_000_000], [MINING.id]: [60, 300_000] }),
    player('c', { [ATTACK.id]: [60, 2_000_000], [MINING.id]: [55, 200_000] }),
    player('d', { [ATTACK.id]: [50, 1_000_000], [MINING.id]: [10, 1_000] }),
  ];

  it('counts 1st, 2nd and 3rd per skill row, with nothing for 4th', () => {
    const counts = podiumCounts(buildMatrix(players, 'level'));
    assert.deepEqual(counts.a, { gold: 1, silver: 0, bronze: 1 });
    assert.deepEqual(counts.b, { gold: 1, silver: 1, bronze: 0 });
    assert.deepEqual(counts.c, { gold: 0, silver: 1, bronze: 1 });
    assert.deepEqual(counts.d, { gold: 0, silver: 0, bronze: 0 }, '4th place earns no medal');
  });

  it('breaks a level tie on xp', () => {
    const tied = [
      player('low', { [ATTACK.id]: [70, 3_000_000] }),
      player('high', { [ATTACK.id]: [70, 3_100_000] }),
    ];
    const counts = podiumCounts(buildMatrix(tied, 'level'));
    assert.equal(counts.high.gold, 1);
    assert.equal(counts.low.silver, 1);
  });

  it('gives no medals to a player who has not trained the skill (xp 0)', () => {
    const counts = podiumCounts(buildMatrix([player('only', { [ATTACK.id]: [70, 3_000_000] }), player('idle')], 'level'));
    assert.equal(counts.idle.silver, 0);
    assert.equal(counts.only.gold, 1);
  });

  it('includes the Total row when it is passed in', () => {
    const withTotal = [
      { ...player('x'), total: { level: 100, xp: 10, rank: null } },
      { ...player('y'), total: { level: 90, xp: 9, rank: null } },
    ];
    const counts = podiumCounts([buildTotalsRow(withTotal)]);
    assert.equal(counts.x.gold, 1);
    assert.equal(counts.y.silver, 1);
  });
});
