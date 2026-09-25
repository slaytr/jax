import { describe, expect, it } from 'vitest';

import { requiredQuestsFor } from './goals';

function quest(name: string, requires: string[] = []) {
  return { name, questRequirements: requires.map((req) => ({ quest: req, relation: 'required' })) };
}

function questGoal(questName: string, completedAt: string | null = null) {
  return { kind: 'quest', questName, completedAt };
}

describe('requiredQuestsFor', () => {
  it('returns null before the quest catalog has loaded', () => {
    expect(requiredQuestsFor(questGoal('Quest B'), null, {})).toBeNull();
  });

  it('returns null once the goal itself is already complete', () => {
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A'])];
    expect(requiredQuestsFor(questGoal('Quest B', '2026-01-01'), quests, {})).toBeNull();
  });

  it('returns null when the goal\'s own quest name does not resolve against the catalog', () => {
    const quests = [quest('Quest A')];
    expect(requiredQuestsFor(questGoal('Quest Z'), quests, {})).toBeNull();
  });

  it('returns an empty list for a quest with no requirements', () => {
    const quests = [quest('Quest A')];
    expect(requiredQuestsFor(questGoal('Quest A'), quests, {})).toEqual([]);
  });

  it('reports each direct requirement not-started by default', () => {
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A'])];
    const player = { completedQuests: [], startedQuests: [] };
    expect(requiredQuestsFor(questGoal('Quest B'), quests, player)).toEqual([{ name: 'Quest A', status: 'not-started' }]);
  });

  it('ticks a requirement off as completed once the player\'s own RuneMetrics list reports it done', () => {
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A'])];
    const player = { completedQuests: ['Quest A'], startedQuests: [] };
    expect(requiredQuestsFor(questGoal('Quest B'), quests, player)).toEqual([{ name: 'Quest A', status: 'completed' }]);
  });

  it('reports a started-but-not-finished requirement as in-progress', () => {
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A'])];
    const player = { completedQuests: [], startedQuests: ['Quest A'] };
    expect(requiredQuestsFor(questGoal('Quest B'), quests, player)).toEqual([{ name: 'Quest A', status: 'in-progress' }]);
  });

  it('only lists direct requirements, not the whole transitive chain', () => {
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A']), quest('Quest C', ['Quest B'])];
    const player = { completedQuests: [], startedQuests: [] };
    expect(requiredQuestsFor(questGoal('Quest C'), quests, player)).toEqual([{ name: 'Quest B', status: 'not-started' }]);
  });
});
