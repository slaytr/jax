import { describe, expect, it } from 'vitest';

import { visibleGoalItems } from './goalGraphLayout';
import type { GoalItem } from './goals';

function questItem(id: string, questName: string, completedAt: string | null = null, children: any[] = []): GoalItem {
  return { quest: { id, kind: 'quest', questName, completedAt }, children };
}

function skillItem(id: string): GoalItem {
  return { quest: { id, kind: 'skill', completedAt: null }, children: [] };
}

function quest(name: string, requires: string[] = []) {
  return { name, questRequirements: requires.map((req) => ({ quest: req, relation: 'required' })) };
}

describe('visibleGoalItems', () => {
  it('returns every item unchanged, with no edges, when the quest catalog is not loaded yet', () => {
    const items = [questItem('a', 'Quest A'), skillItem('s')];
    expect(visibleGoalItems(items, null)).toEqual({ items, questPrereqEdges: [] });
  });

  it('drops a completed quest item outright, no matter what depends on it', () => {
    const items = [questItem('a', 'Quest A', '2026-01-01'), questItem('b', 'Quest B')];
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A'])];
    const result = visibleGoalItems(items, quests);
    expect(result.items.map((item) => item.quest.id)).toEqual([]);
    expect(result.questPrereqEdges).toEqual([]);
  });

  it('drops a standalone open quest item with no requirement link to any other tracked quest', () => {
    const items = [questItem('a', 'Quest A')];
    const quests = [quest('Quest A')];
    const result = visibleGoalItems(items, quests);
    expect(result.items).toEqual([]);
    expect(result.questPrereqEdges).toEqual([]);
  });

  it('keeps two open quest items directly linked by a real requirement, with one edge from the required quest to the dependent one', () => {
    const items = [questItem('a', 'Quest A'), questItem('b', 'Quest B')];
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A'])];
    const result = visibleGoalItems(items, quests);
    expect(result.items.map((item) => item.quest.id).sort()).toEqual(['a', 'b']);
    expect(result.questPrereqEdges).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('keeps every link in a tracked chain, one edge per direct link', () => {
    const items = [questItem('a', 'Quest A'), questItem('b', 'Quest B'), questItem('c', 'Quest C')];
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A']), quest('Quest C', ['Quest B'])];
    const result = visibleGoalItems(items, quests);
    expect(result.items.map((item) => item.quest.id).sort()).toEqual(['a', 'b', 'c']);
    expect(result.questPrereqEdges.sort((x, y) => x.from.localeCompare(y.from))).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
  });

  it('drops both ends of a real requirement chain when the middle quest is not itself tracked', () => {
    // Quest A -> Quest B -> Quest C in the real game, but the player only
    // tracks A and C as goals — A's own direct requirement is B, not C, so
    // no link resolves between the two quests actually being tracked.
    const items = [questItem('a', 'Quest A'), questItem('c', 'Quest C')];
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A']), quest('Quest C', ['Quest B'])];
    const result = visibleGoalItems(items, quests);
    expect(result.items).toEqual([]);
    expect(result.questPrereqEdges).toEqual([]);
  });

  it('leaves skill-only items untouched regardless of any quest filtering', () => {
    const items = [questItem('a', 'Quest A'), skillItem('s')];
    const quests = [quest('Quest A')];
    const result = visibleGoalItems(items, quests);
    expect(result.items.map((item) => item.quest.id)).toEqual(['s']);
  });

  it('keeps a quest goal that requires another tracked quest goal even though nothing requires it back', () => {
    // Quest B is the player's own real target — nothing else requires it —
    // but it should still show since it's what draws the edge from A.
    const items = [questItem('a', 'Quest A'), questItem('b', 'Quest B')];
    const quests = [quest('Quest A'), quest('Quest B', ['Quest A'])];
    const result = visibleGoalItems(items, quests);
    expect(result.items.map((item) => item.quest.id)).toContain('b');
  });
});
