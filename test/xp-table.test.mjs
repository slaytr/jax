import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STANDARD_XP_TABLE, INVENTION_XP_TABLE, xpProgress, levelForXp } from '../assets/js/xp-table.js';

const skill = (name, max = 99) => ({ name, max });

describe('STANDARD_XP_TABLE', () => {
  it('matches well-known RuneScape xp checkpoints', () => {
    assert.equal(STANDARD_XP_TABLE[1], 0);
    assert.equal(STANDARD_XP_TABLE[10], 1154);
    assert.equal(STANDARD_XP_TABLE[50], 101333);
    assert.equal(STANDARD_XP_TABLE[99], 13034431);
  });

  it('extends past 99 to cover the 120-cap elite skills', () => {
    assert.equal(STANDARD_XP_TABLE[110], 38737661);
    assert.equal(STANDARD_XP_TABLE[120], 104273167);
  });

  it('is strictly increasing', () => {
    for (let level = 2; level <= 120; level += 1) {
      assert.ok(STANDARD_XP_TABLE[level] > STANDARD_XP_TABLE[level - 1], `level ${level}`);
    }
  });
});

describe('INVENTION_XP_TABLE', () => {
  it('starts at 0 and has 120 real levels', () => {
    assert.equal(INVENTION_XP_TABLE[1], 0);
    assert.equal(INVENTION_XP_TABLE.length, 121);
  });

  it("puts level 84 at the wiki's own halfway-to-99 point, unlike the standard table's level 92", () => {
    const halfOf99 = INVENTION_XP_TABLE[99] / 2;
    assert.ok(Math.abs(INVENTION_XP_TABLE[84] - halfOf99) / halfOf99 < 0.01, 'level 84 should be within 1% of half of level 99');
  });

  it('is strictly increasing', () => {
    for (let level = 2; level <= 120; level += 1) {
      assert.ok(INVENTION_XP_TABLE[level] > INVENTION_XP_TABLE[level - 1], `level ${level}`);
    }
  });
});

describe('xpProgress', () => {
  it('is 0 exactly at a level boundary', () => {
    assert.equal(xpProgress(skill('Attack'), 10, STANDARD_XP_TABLE[10]), 0);
  });

  it('is 0.5 halfway through a level', () => {
    const at = STANDARD_XP_TABLE[10];
    const next = STANDARD_XP_TABLE[11];
    assert.equal(xpProgress(skill('Attack'), 10, at + (next - at) / 2), 0.5);
  });

  it('is 1 just before the next level', () => {
    const share = xpProgress(skill('Attack'), 10, STANDARD_XP_TABLE[11] - 1);
    assert.ok(share > 0.99 && share < 1);
  });

  it('uses the Invention table for Invention specifically, not the standard one', () => {
    const xp = INVENTION_XP_TABLE[10]; // exactly level 10 on Invention's own curve
    assert.equal(xpProgress(skill('Invention'), 10, xp), 0, 'lands exactly on the boundary against its own table');
    // The same xp read against the standard table is already well past its
    // level-11 threshold — a different table gives a different answer.
    assert.equal(xpProgress(skill('Attack'), 10, xp), 1);
  });

  it('reads as full at the top of the table (level 120, whatever it does past that)', () => {
    assert.equal(xpProgress(skill('Dungeoneering', 120), 120, STANDARD_XP_TABLE[120]), 1);
    assert.equal(xpProgress(skill('Invention', 150), 120, INVENTION_XP_TABLE[120]), 1);
  });

  it('never exceeds 1 or drops below 0 even with an inconsistent reading', () => {
    assert.equal(xpProgress(skill('Attack'), 10, 0), 0);
    assert.equal(xpProgress(skill('Attack'), 10, Number.MAX_SAFE_INTEGER), 1);
  });
});

describe('levelForXp', () => {
  it('is the exact inverse of xpForLevel, at every level boundary', () => {
    for (let level = 1; level <= 99; level += 1) {
      assert.equal(levelForXp(skill('Attack'), STANDARD_XP_TABLE[level]), level, `level ${level}`);
    }
  });

  it('reads as the lower level anywhere strictly between two boundaries', () => {
    const at = STANDARD_XP_TABLE[10];
    const next = STANDARD_XP_TABLE[11];
    assert.equal(levelForXp(skill('Attack'), at + (next - at) / 2), 10);
    assert.equal(levelForXp(skill('Attack'), next - 1), 10);
  });

  it('is 1 for zero xp — there is no level 0', () => {
    assert.equal(levelForXp(skill('Attack'), 0), 1);
  });

  it('caps at the table\'s own top level for xp far past it', () => {
    assert.equal(levelForXp(skill('Attack', 99), Number.MAX_SAFE_INTEGER), 120);
  });

  it('uses the Invention table for Invention specifically, not the standard one', () => {
    assert.equal(levelForXp(skill('Invention'), INVENTION_XP_TABLE[10]), 10);
    // The same xp read against the standard table lands on a different level.
    assert.notEqual(levelForXp(skill('Attack'), INVENTION_XP_TABLE[10]), 10);
  });
});
