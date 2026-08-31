import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { notMetSkillRequirements, buildQuestGoalDrafts } from '../assets/js/quest-goal.js';

const quest = (name, skillRequirements) => ({ name, skillRequirements });

describe('notMetSkillRequirements', () => {
  it('keeps only requirements above the given level', () => {
    const q = quest('Q', [
      { skill: 'Agility', level: 25 },
      { skill: 'Farming', level: 65 },
    ]);
    const levels = new Map([
      ['Agility', 30], // met
      ['Farming', 10], // not met
    ]);
    assert.deepEqual(notMetSkillRequirements(q, levels), [{ skill: 'Farming', level: 65 }]);
  });

  it('treats a skill missing from the map as level 0', () => {
    const q = quest('Q', [{ skill: 'Magic', level: 75 }]);
    assert.deepEqual(notMetSkillRequirements(q, new Map()), [{ skill: 'Magic', level: 75 }]);
  });

  it('is empty when every requirement is already met', () => {
    const q = quest('Q', [{ skill: 'Agility', level: 25 }]);
    assert.deepEqual(notMetSkillRequirements(q, new Map([['Agility', 25]])), []);
  });

  it('is empty for a quest with no skill requirements at all', () => {
    assert.deepEqual(notMetSkillRequirements(quest('Q', []), new Map()), []);
  });
});

describe('buildQuestGoalDrafts', () => {
  // A fresh counter per test — buildQuestGoalDrafts is called at most once
  // per test, but sharing one counter across tests would make each test's
  // expected ids depend on run order.
  const options = () => {
    let n = 0;
    return { idFactory: () => `id-${n++}`, nowIso: () => '2026-08-31T00:00:00.000Z' };
  };

  it('always includes the quest itself as a kind:quest draft', () => {
    const q = quest('Cook\'s Assistant', []);
    const drafts = buildQuestGoalDrafts(q, new Map(), new Map(), options());
    assert.equal(drafts.length, 1);
    assert.deepEqual(drafts[0], {
      id: 'id-0',
      kind: 'quest',
      questName: "Cook's Assistant",
      group: "Cook's Assistant",
      labels: [],
      startedAt: '2026-08-31T00:00:00.000Z',
      completedAt: null,
    });
  });

  it('adds one skill goal per not-met requirement, sharing the quest as their group', () => {
    const q = quest('While Guthix Sleeps', [
      { skill: 'Agility', level: 25 },
      { skill: 'Magic', level: 75 },
    ]);
    const skillLevels = new Map([
      ['Agility', 30], // met — no draft
      ['Magic', 10], // not met — gets a draft
    ]);
    const skillValues = new Map([
      ['Agility', { id: 17, level: 30, xp: 12345 }],
      ['Magic', { id: 7, level: 10, xp: 500 }],
    ]);

    const drafts = buildQuestGoalDrafts(q, skillLevels, skillValues, options());
    assert.equal(drafts.length, 2, 'quest goal + exactly one skill goal (Magic)');

    const skillGoal = drafts[1];
    assert.deepEqual(skillGoal, {
      id: 'id-1',
      kind: 'skill',
      skillId: 7,
      targetType: 'level',
      targetValue: 75,
      group: 'While Guthix Sleeps',
      labels: [],
      startLevel: 10,
      startXp: 500,
      startedAt: '2026-08-31T00:00:00.000Z',
      completedAt: null,
      completedLevel: null,
      completedXp: null,
    });
  });

  it('creates no skill goals when every requirement is already met', () => {
    const q = quest('Dragon Slayer', [{ skill: 'Crafting', level: 8 }]);
    const drafts = buildQuestGoalDrafts(q, new Map([['Crafting', 8]]), new Map([['Crafting', { id: 13, level: 8, xp: 2411 }]]), options());
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].kind, 'quest');
  });

  it('gives every draft from one call the same startedAt', () => {
    const q = quest('Q', [{ skill: 'A', level: 1 }]);
    const drafts = buildQuestGoalDrafts(q, new Map(), new Map([['A', { id: 1, level: 0, xp: 0 }]]), options());
    assert.equal(drafts[0].startedAt, drafts[1].startedAt);
  });
});
