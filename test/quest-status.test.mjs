import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { statusOf, skillLevelsByName, meetsSkillRequirements } from '../assets/js/quest-status.js';

const quest = (name, skillRequirements = []) => ({ name, skillRequirements });

describe('statusOf', () => {
  it('reads completed before started, and not-started when neither matches', () => {
    const completed = new Set(["Cook's Assistant"]);
    const started = new Set(['Lost City']);

    assert.equal(statusOf(quest("Cook's Assistant"), completed, started), 'completed');
    assert.equal(statusOf(quest('Lost City'), completed, started), 'in-progress');
    assert.equal(statusOf(quest('Dragon Slayer'), completed, started), 'not-started');
  });

  it('matches RuneMetrics own un-suffixed title against quest-data\'s disambiguated name', () => {
    const completed = new Set(['Father and Son']);
    assert.equal(statusOf(quest('Father and Son (miniquest)'), completed, new Set()), 'completed');
  });

  it('checks completed against the exact title first, even when a suffixed fallback would also match', () => {
    const completed = new Set(['Tears of Guthix']);
    const started = new Set(['Tears of Guthix (quest)']);
    // The exact-name RuneMetrics set (completed) wins over the started set's
    // own fallback match.
    assert.equal(statusOf(quest('Tears of Guthix (quest)'), completed, started), 'completed');
  });
});

describe('skillLevelsByName', () => {
  it('maps every SKILLS entry the player has data for, by name', () => {
    const player = { skillById: { 1: { level: 70 }, 4: { level: 99 } } };
    const levels = skillLevelsByName(player);
    assert.equal(levels.get('Attack'), 70);
    assert.equal(levels.get('Constitution'), 99);
    assert.equal(levels.has('Defence'), false, 'a skill with no data at all is simply absent, not zero');
  });
});

describe('meetsSkillRequirements', () => {
  it('is true only when every requirement is at or under the player\'s own level', () => {
    const levels = new Map([['Agility', 75], ['Crafting', 74]]);
    assert.equal(meetsSkillRequirements(quest('A', [{ skill: 'Agility', level: 75 }]), levels), true);
    assert.equal(meetsSkillRequirements(quest('B', [{ skill: 'Crafting', level: 75 }]), levels), false);
  });

  it('treats a skill with no player data as level 0', () => {
    const levels = new Map();
    assert.equal(meetsSkillRequirements(quest('A', [{ skill: 'Agility', level: 1 }]), levels), false);
  });
});
