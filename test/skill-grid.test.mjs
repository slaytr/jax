import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SKILL_GRID, TRACKED_SKILLS } from '../assets/js/config.js';

describe('SKILL_GRID', () => {
  it('is 3 columns by 10 rows', () => {
    assert.equal(SKILL_GRID.length, 10);
    for (const row of SKILL_GRID) assert.equal(row.length, 3);
  });

  it('covers every tracked skill exactly once, plus one blank cell', () => {
    const cells = SKILL_GRID.flat();
    const skillCells = cells.filter((cell) => cell !== null);
    const blankCells = cells.filter((cell) => cell === null);

    assert.equal(skillCells.length, TRACKED_SKILLS.length);
    assert.equal(blankCells.length, 1, 'exactly one spare cell for Total level');

    const ids = skillCells.map((skill) => skill.id).sort((a, b) => a - b);
    const expected = TRACKED_SKILLS.map((skill) => skill.id).sort((a, b) => a - b);
    assert.deepEqual(ids, expected);
  });

  it('puts Attack, Constitution and Mining across the top row, matching RS3\'s own skills tab', () => {
    assert.deepEqual(
      SKILL_GRID[0].map((skill) => skill.name),
      ['Attack', 'Constitution', 'Mining'],
    );
  });

  it('leaves the blank cell in the last slot, not scattered mid-grid', () => {
    const cells = SKILL_GRID.flat();
    assert.equal(cells[cells.length - 1], null);
    assert.ok(cells.slice(0, -1).every((cell) => cell !== null));
  });
});
