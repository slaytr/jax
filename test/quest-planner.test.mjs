import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeQuestPlan, subsequentQuests, MAX_LEVEL_GAP_PER_SKILL, MAX_SUBSEQUENT } from '../assets/js/quest-planner.js';

const quest = (name, overrides = {}) => ({
  name,
  series: null,
  seriesPosition: 0,
  skillRequirements: [],
  questRequirements: [],
  fullCompletionRequirements: [],
  ...overrides,
});

const req = (skill, level) => ({ skill, level });
const questReq = (name) => ({ quest: name, relation: 'required' });

const player = (overrides = {}) => ({
  completedQuests: [],
  startedQuests: [],
  skillById: {},
  questPoints: 0,
  ...overrides,
});

describe('computeQuestPlan — readyNow', () => {
  it('includes a not-started quest with no requirements at all', () => {
    const quests = [quest('Cook\'s Assistant')];
    const plan = computeQuestPlan(quests, player());
    assert.deepEqual(plan.readyNow.map((c) => c.quest.name), ["Cook's Assistant"]);
  });

  it('excludes a quest whose skill requirement is not yet met', () => {
    const quests = [quest('Plague\'s End', { skillRequirements: [req('Agility', 75)] })];
    const plan = computeQuestPlan(quests, player({ skillById: { 17: { level: 74 } } }));
    assert.deepEqual(plan.readyNow, []);
  });

  it('excludes a quest whose direct quest prerequisite is not completed', () => {
    const quests = [
      quest('A'),
      quest('B', { questRequirements: [questReq('A')] }),
    ];
    const plan = computeQuestPlan(quests, player());
    assert.deepEqual(plan.readyNow.map((c) => c.quest.name), ['A'], 'B is blocked on A, only A is ready');
  });

  it('includes a quest once its prerequisite is completed', () => {
    const quests = [
      quest('A'),
      quest('B', { questRequirements: [questReq('A')] }),
    ];
    const plan = computeQuestPlan(quests, player({ completedQuests: ['A'] }));
    assert.deepEqual(plan.readyNow.map((c) => c.quest.name), ['B']);
  });

  it('excludes a quest whose quest-points requirement is not met, even with skills satisfied', () => {
    const quests = [quest('Dragon Slayer', { skillRequirements: [req('quest points', 32)] })];
    const plan = computeQuestPlan(quests, player({ questPoints: 31 }));
    assert.deepEqual(plan.readyNow, []);
  });

  it('ranks by how many other incomplete quests directly require it, most first', () => {
    const quests = [
      quest('Popular'),
      quest('Lonely'),
      quest('Needs Popular 1', { questRequirements: [questReq('Popular')] }),
      quest('Needs Popular 2', { questRequirements: [questReq('Popular')] }),
    ];
    // Needs Popular 1/2 aren't ready (Popular isn't done), so readyNow is
    // just [Popular, Lonely] — Popular should sort first since two
    // still-incomplete quests point at it.
    const plan = computeQuestPlan(quests, player());
    assert.deepEqual(plan.readyNow.map((c) => c.quest.name), ['Popular', 'Lonely']);
    assert.equal(plan.readyNow[0].unlocks, 2);
    assert.equal(plan.readyNow[1].unlocks, 0);
  });

  it('never includes an already-completed quest', () => {
    const quests = [quest('Done')];
    const plan = computeQuestPlan(quests, player({ completedQuests: ['Done'] }));
    assert.deepEqual(plan.readyNow, []);
  });
});

describe('computeQuestPlan — almostThere', () => {
  it('includes a quest whose only gap is within the per-skill threshold', () => {
    const quests = [quest('Close', { skillRequirements: [req('Agility', 75)] })];
    const plan = computeQuestPlan(quests, player({ skillById: { 17: { level: 75 - MAX_LEVEL_GAP_PER_SKILL } } }));
    assert.deepEqual(plan.almostThere.map((c) => c.quest.name), ['Close']);
  });

  it('excludes a quest whose gap exceeds the per-skill threshold, even if it is the only one', () => {
    const quests = [quest('Far', { skillRequirements: [req('Agility', 75)] })];
    const plan = computeQuestPlan(quests, player({ skillById: { 17: { level: 75 - MAX_LEVEL_GAP_PER_SKILL - 1 } } }));
    assert.deepEqual(plan.almostThere, []);
  });

  it('excludes a quest with one small gap and one large one — every gap must be small', () => {
    const quests = [
      quest('Mixed', {
        skillRequirements: [req('Agility', 75), req('Crafting', 90)],
      }),
    ];
    const plan = computeQuestPlan(
      quests,
      player({ skillById: { 17: { level: 74 }, 13: { level: 50 } } }),
    );
    assert.deepEqual(plan.almostThere, []);
  });

  it('excludes a quest blocked on an incomplete quest prerequisite, however small its skill gap', () => {
    const quests = [
      quest('Gate'),
      quest('Behind Gate', { questRequirements: [questReq('Gate')], skillRequirements: [req('Agility', 75)] }),
    ];
    const plan = computeQuestPlan(quests, player({ skillById: { 17: { level: 74 } } }));
    assert.deepEqual(plan.almostThere, [], 'skills are close, but the quest gate is not a "stat" requirement');
  });

  it('ranks by total levels needed, ascending', () => {
    const quests = [
      quest('Needs 4', { skillRequirements: [req('Agility', 75)] }),
      quest('Needs 1', { skillRequirements: [req('Crafting', 75)] }),
    ];
    const plan = computeQuestPlan(
      quests,
      player({ skillById: { 17: { level: 71 }, 13: { level: 74 } } }),
    );
    assert.deepEqual(plan.almostThere.map((c) => c.quest.name), ['Needs 1', 'Needs 4']);
  });
});

describe('computeQuestPlan — questlines', () => {
  it('reports a series only once at least one, but not every, member is completed', () => {
    const notStarted = [quest('A1', { series: 'Alpha' }), quest('A2', { series: 'Alpha' })];
    const allDone = [quest('B1', { series: 'Beta' })];
    const partial = [quest('C1', { series: 'Gamma' }), quest('C2', { series: 'Gamma' })];

    const plan = computeQuestPlan([...notStarted, ...allDone, ...partial], player({ completedQuests: ['B1', 'C1'] }));
    assert.deepEqual(plan.questlines.map((line) => line.series), ['Gamma']);
    assert.equal(plan.questlines[0].completedCount, 1);
    assert.equal(plan.questlines[0].total, 2);
  });

  it("picks the remaining member closest to actionable as `next`, ready-now beating a skill-blocked one", () => {
    const quests = [
      quest('Done', { series: 'Alpha', seriesPosition: 1 }),
      quest('Blocked', { series: 'Alpha', seriesPosition: 2, skillRequirements: [req('Agility', 75)] }),
      quest('Ready', { series: 'Alpha', seriesPosition: 3 }),
    ];
    const plan = computeQuestPlan(quests, player({ completedQuests: ['Done'], skillById: { 17: { level: 70 } } }));
    assert.equal(plan.questlines[0].next.quest.name, 'Ready');
  });

  it('falls back to seriesPosition order among equally-ranked remaining members', () => {
    const quests = [
      quest('Done', { series: 'Alpha', seriesPosition: 1 }),
      quest('Second', { series: 'Alpha', seriesPosition: 3 }),
      quest('First', { series: 'Alpha', seriesPosition: 2 }),
    ];
    const plan = computeQuestPlan(quests, player({ completedQuests: ['Done'] }));
    assert.equal(plan.questlines[0].next.quest.name, 'First', 'both are ready now, so seriesPosition breaks the tie');
  });
});

describe('subsequentQuests', () => {
  it('returns nothing behind a quest nothing else requires', () => {
    const quests = [quest('Lonely')];
    assert.deepEqual(subsequentQuests(quest('Lonely'), quests, player()), []);
  });

  it('returns a direct child once its only requirement is this quest', () => {
    const quests = [
      quest('A'),
      quest('B', { questRequirements: [questReq('A')] }),
    ];
    const chain = subsequentQuests(quests[0], quests, player());
    assert.deepEqual(chain.map((q) => q.name), ['B']);
  });

  it('orders a two-deep chain by how many quests behind `quest` each one sits', () => {
    const quests = [
      quest('A'),
      quest('B', { questRequirements: [questReq('A')] }),
      quest('C', { questRequirements: [questReq('B')] }),
    ];
    const chain = subsequentQuests(quests[0], quests, player());
    assert.deepEqual(chain.map((q) => q.name), ['B', 'C']);
  });

  it('withholds a quest that also needs something else not yet satisfied', () => {
    const quests = [
      quest('A'),
      quest('Other'),
      quest('Needs Both', { questRequirements: [questReq('A'), questReq('Other')] }),
    ];
    const chain = subsequentQuests(quests[0], quests, player());
    assert.deepEqual(chain, [], "Needs Both also needs Other, which isn't done or in the chain");
  });

  it('includes a quest once its other requirement is already completed', () => {
    const quests = [
      quest('A'),
      quest('Other'),
      quest('Needs Both', { questRequirements: [questReq('A'), questReq('Other')] }),
    ];
    const chain = subsequentQuests(quests[0], quests, player({ completedQuests: ['Other'] }));
    assert.deepEqual(chain.map((q) => q.name), ['Needs Both']);
  });

  it('never re-surfaces an already-completed descendant', () => {
    const quests = [
      quest('A'),
      quest('B', { questRequirements: [questReq('A')] }),
    ];
    const chain = subsequentQuests(quests[0], quests, player({ completedQuests: ['B'] }));
    assert.deepEqual(chain, []);
  });

  it('caps the chain at MAX_SUBSEQUENT even on a long straight line', () => {
    const quests = [quest('Q0')];
    for (let i = 1; i <= MAX_SUBSEQUENT + 5; i += 1) {
      quests.push(quest(`Q${i}`, { questRequirements: [questReq(`Q${i - 1}`)] }));
    }
    const chain = subsequentQuests(quests[0], quests, player());
    assert.equal(chain.length, MAX_SUBSEQUENT);
    assert.deepEqual(chain.map((q) => q.name).slice(0, 3), ['Q1', 'Q2', 'Q3']);
  });
});
