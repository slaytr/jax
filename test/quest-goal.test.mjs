import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { notMetSkillRequirements, treeSkillRequirements, buildQuestGoalDrafts } from '../assets/js/quest-goal.js';

const quest = (name, skillRequirements, questRequirements = []) => ({
  name,
  skillRequirements,
  questRequirements: questRequirements.map((questName) => ({ quest: questName, relation: 'required' })),
});

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

  it('excludes the "quest points" pseudo-skill requirement entirely, met or not', () => {
    // Dragon Slayer, in the real data — quest-data lists "quest points" as
    // a skillRequirements entry even though it isn't a real skill (no
    // SKILLS entry, no icon), so it can never be turned into a goal.
    const q = quest('Dragon Slayer', [{ skill: 'quest points', level: 33 }]);
    assert.deepEqual(notMetSkillRequirements(q, new Map()), [], 'not met, but still excluded');
    assert.deepEqual(notMetSkillRequirements(q, new Map([['quest points', 100]])), []);
  });

  it('excludes "quest points" alongside real requirements, keeping only the real ones', () => {
    const q = quest('Q', [
      { skill: 'quest points', level: 33 },
      { skill: 'Agility', level: 25 },
    ]);
    assert.deepEqual(notMetSkillRequirements(q, new Map()), [{ skill: 'Agility', level: 25 }]);
  });
});

describe('treeSkillRequirements', () => {
  it("pulls in a prerequisite's own skill requirement even when the target quest lists none itself", () => {
    // Plague's End (Fletching 88 comes from Within the Light, not Plague's
    // End's own skillRequirements) is the motivating real-data case.
    const withinTheLight = quest('Within the Light', [{ skill: 'Fletching', level: 88 }]);
    const plaguesEnd = quest('Plague\'s End', [], ["Within the Light"]);
    const quests = [plaguesEnd, withinTheLight];

    assert.deepEqual(treeSkillRequirements(plaguesEnd, quests, new Map()), [{ skill: 'Fletching', level: 88 }]);
  });

  it('keeps only the highest level for a skill required at different levels across the tree', () => {
    const grandparent = quest('Grandparent', [{ skill: 'Herblore', level: 40 }]);
    const parent = quest('Parent', [{ skill: 'Herblore', level: 70 }], ['Grandparent']);
    const child = quest('Child', [{ skill: 'Herblore', level: 55 }], ['Parent']);
    const quests = [grandparent, parent, child];

    assert.deepEqual(treeSkillRequirements(child, quests, new Map()), [{ skill: 'Herblore', level: 70 }]);
  });

  it('excludes a requirement already met by the player, same as notMetSkillRequirements', () => {
    const parent = quest('Parent', [{ skill: 'Crafting', level: 50 }]);
    const child = quest('Child', [{ skill: 'Woodcutting', level: 30 }], ['Parent']);
    const quests = [parent, child];

    assert.deepEqual(
      treeSkillRequirements(child, quests, new Map([['Crafting', 50]])),
      [{ skill: 'Woodcutting', level: 30 }],
    );
  });

  it('excludes the "quest points" pseudo-skill anywhere in the tree', () => {
    const parent = quest('Parent', [{ skill: 'quest points', level: 33 }]);
    const child = quest('Child', [{ skill: 'Agility', level: 10 }], ['Parent']);
    const quests = [parent, child];

    assert.deepEqual(treeSkillRequirements(child, quests, new Map()), [{ skill: 'Agility', level: 10 }]);
  });

  it('is just the quest\'s own requirements when it has no prerequisite quests', () => {
    const q = quest('Q', [{ skill: 'Agility', level: 25 }]);
    assert.deepEqual(treeSkillRequirements(q, [q], new Map()), [{ skill: 'Agility', level: 25 }]);
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

  it('never creates a skill goal for the "quest points" requirement (it broke the goal cards — no SKILLS entry, no icon)', () => {
    const q = quest('Dragon Slayer', [{ skill: 'quest points', level: 33 }]);
    const drafts = buildQuestGoalDrafts(q, new Map(), new Map(), options());
    assert.equal(drafts.length, 1, 'just the quest goal — no skillId: null draft alongside it');
    assert.equal(drafts[0].kind, 'quest');
  });

  it('uses an explicit requirements list instead of the quest\'s own, for the "include the tree" option', () => {
    // Plague's End itself has no Fletching requirement — this is the shape
    // renderQuestGoalDialog passes when the tree checkbox is on
    // (treeSkillRequirements' result), not what notMetSkillRequirements(q,
    // ...) alone would produce.
    const q = quest('Plague\'s End', []);
    const drafts = buildQuestGoalDrafts(
      q,
      new Map(),
      new Map([['Fletching', { id: 9, level: 40, xp: 10000 }]]),
      { ...options(), requirements: [{ skill: 'Fletching', level: 88 }] },
    );
    assert.equal(drafts.length, 2);
    assert.equal(drafts[1].kind, 'skill');
    assert.equal(drafts[1].skillId, 9);
    assert.equal(drafts[1].targetValue, 88);
  });
});
