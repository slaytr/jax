import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { refreshGoals } from '../assets/js/views/player-goals.js';

const skillGoal = (overrides) => ({
  id: 'g1',
  kind: 'skill',
  skillId: 1, // Attack, per config.js's SKILLS
  targetType: 'level',
  targetValue: 50,
  group: null,
  labels: [],
  startLevel: 10,
  startXp: 1000,
  startedAt: '2026-08-01T00:00:00.000Z',
  completedAt: null,
  completedLevel: null,
  completedXp: null,
  ...overrides,
});

const questGoal = (overrides) => ({
  id: 'g2',
  kind: 'quest',
  questName: "Dragon Slayer",
  group: "Dragon Slayer",
  labels: [],
  startedAt: '2026-08-01T00:00:00.000Z',
  completedAt: null,
  ...overrides,
});

const player = (skillById = {}, extra = {}) => ({ skillById, completedQuests: [], startedQuests: [], ...extra });

describe('refreshGoals', () => {
  it('drops a skill goal whose skillId matches no current SKILLS entry, and reports the change', () => {
    // The bug: a "quest points" pseudo-skill requirement (quest-goal.js,
    // before it was excluded) built a draft with skillId: null, which
    // crashed every render of the Goals tab (iconFor(undefined)).
    const goals = [skillGoal({ skillId: null })];
    const { goals: next, changed } = refreshGoals(goals, player());

    assert.deepEqual(next, []);
    assert.equal(changed, true);
  });

  it('keeps a valid skill goal untouched when nothing changed', () => {
    const goal = skillGoal({ skillId: 1 });
    const { goals: next, changed } = refreshGoals([goal], player({ 1: { level: 20, xp: 5000 } }));

    assert.equal(next.length, 1);
    assert.equal(next[0], goal, 'same object — nothing about it changed');
    assert.equal(changed, false);
  });

  it('never drops a quest goal for lacking a skillId — isRenderable only applies to skill goals', () => {
    const goal = questGoal();
    const { goals: next, changed } = refreshGoals([goal], player());

    assert.deepEqual(next, [goal]);
    assert.equal(changed, false);
  });

  it('still marks a skill goal complete once the player reaches its target', () => {
    const goal = skillGoal({ skillId: 1, targetType: 'level', targetValue: 50 });
    const { goals: next, changed } = refreshGoals([goal], player({ 1: { level: 50, xp: 999999 } }));

    assert.equal(changed, true);
    assert.equal(next[0].completedAt !== null, true);
    assert.equal(next[0].completedLevel, 50);
  });

  it('marks a quest goal complete once the quest appears in the player\'s completed list', () => {
    const goal = questGoal();
    const { goals: next, changed } = refreshGoals([goal], player({}, { completedQuests: ['Dragon Slayer'] }));

    assert.equal(changed, true);
    assert.equal(next[0].completedAt !== null, true);
  });
});
