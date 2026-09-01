import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMatrix } from '../assets/js/compute.js';
import { SKILLS } from '../assets/js/config.js';
import { xpForLevel, xpProgress } from '../assets/js/xp-table.js';

const ATTACK = SKILLS.find((skill) => skill.name === 'Attack');

const player = (slug, level, xp, overrides = {}) => ({
  slug,
  name: slug,
  colour: '#000',
  skillById: { [ATTACK.id]: { level, xp, rank: null } },
  ...overrides,
});

const attackCellFor = (matrix, slug) => matrix.find((row) => row.skill.id === ATTACK.id).cells.find((cell) => cell.player.slug === slug);

describe('buildMatrix — level metric share', () => {
  it('is the xp-table\'s own progress-to-next-level share, not the level\'s share of the skill cap', () => {
    const at75 = xpForLevel(ATTACK, 75);
    const at76 = xpForLevel(ATTACK, 76);
    const halfway = at75 + (at76 - at75) / 2;

    const matrix = buildMatrix([player('a', 75, halfway)], 'level');
    const cell = attackCellFor(matrix, 'a');

    assert.equal(cell.share, 0.5, '(xp - level-75 threshold) / (level-76 threshold - level-75 threshold) = 0.5');
    assert.equal(cell.share, xpProgress(ATTACK, 75, halfway), 'matches xp-table.js\'s own xpProgress exactly');
    assert.notEqual(cell.share, Math.min(1, 75 / ATTACK.max), 'no longer the old level/skill.max share');
  });

  it('reads 0 right at a level\'s own xp threshold and climbs toward 1 approaching the next', () => {
    const at75 = xpForLevel(ATTACK, 75);
    const matrix = buildMatrix([player('a', 75, at75)], 'level');
    assert.equal(attackCellFor(matrix, 'a').share, 0);
  });

  it('reads full (1) at the xp table\'s own top level, same as xpProgress itself', () => {
    const dungeoneering = SKILLS.find((skill) => skill.name === 'Dungeoneering'); // a real 120-cap skill
    const xp = xpForLevel(dungeoneering, 120);
    const matrix = buildMatrix(
      [{ slug: 'a', name: 'a', colour: '#000', skillById: { [dungeoneering.id]: { level: 120, xp, rank: null } } }],
      'level',
    );
    const cell = matrix.find((row) => row.skill.id === dungeoneering.id).cells[0];
    assert.equal(cell.share, 1);
  });

  it('leaves the row leader untouched — still decided by raw level (and xp as a tiebreak), not by this share', () => {
    const lowLevelHighProgress = player('a', 60, xpForLevel(ATTACK, 61) - 1); // 60, almost 61
    const highLevelLowProgress = player('b', 90, xpForLevel(ATTACK, 90)); // 90, just dinged
    const matrix = buildMatrix([lowLevelHighProgress, highLevelLowProgress], 'level');

    assert.equal(attackCellFor(matrix, 'b').isLeader, true, 'level 90 leads over level 60 regardless of either one\'s own bar fill');
  });
});
