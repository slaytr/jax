import { describe, expect, it } from 'vitest';

import { calculateCombatLevel, dropQuestCoveredSkills, keepHighestSkillRequirements, parseRequirement, requirementStatus, summarizeRequirementStatuses } from './areaTasks';

const req = (text: string, quest = false) => ({ text, quest });

describe('parseRequirement', () => {
  it('parses a plain "level skill" requirement into its skill', () => {
    const result = parseRequirement(req('25 Crafting'));
    expect(result.level).toBe(25);
    expect(result.skill?.name).toBe('Crafting');
  });

  it('matches skill names case-insensitively', () => {
    const result = parseRequirement(req('56 agility'));
    expect(result.level).toBe(56);
    expect(result.skill?.name).toBe('Agility');
  });

  it('parses a "One of: N Skill" alternative-requirement fragment', () => {
    const result = parseRequirement(req('One of: 68 Magic'));
    expect(result.level).toBe(68);
    expect(result.skill?.name).toBe('Magic');
  });

  it('parses a "N Skill or" alternative-requirement fragment', () => {
    const result = parseRequirement(req('70 Ranged or'));
    expect(result.level).toBe(70);
    expect(result.skill?.name).toBe('Ranged');
  });

  it('parses a boostable skill requirement and flags it as boostable', () => {
    const result = parseRequirement(req('22 Herblore (boostable)'));
    expect(result.level).toBe(22);
    expect(result.skill?.name).toBe('Herblore');
    expect(result.boostable).toBe(true);
  });

  it('does not flag a plain skill requirement as boostable', () => {
    expect(parseRequirement(req('25 Crafting')).boostable).toBe(false);
  });

  it('carries the quest flag through for a quest requirement', () => {
    expect(parseRequirement(req('Priest in Peril', true))).toEqual({
      skill: null,
      level: null,
      alternatives: null,
      combatLevel: null,
      quest: true,
      boostable: false,
      text: 'Priest in Peril',
    });
  });

  it('falls back to plain text for a number that is not a skill level', () => {
    expect(parseRequirement(req('500 music'))).toEqual({
      skill: null,
      level: null,
      alternatives: null,
      combatLevel: null,
      quest: false,
      boostable: false,
      text: '500 music',
    });
  });

  it('parses a "N combat level" requirement into combatLevel', () => {
    expect(parseRequirement(req('100 combat level')).combatLevel).toBe(100);
  });

  it('treats a quest with trailing "recommended ..." advice as just the quest', () => {
    const parsed = parseRequirement(req('The Dig Site recommended to make it easier to obtain Kudos', true));
    expect(parsed.quest).toBe(true);
    expect(parsed.text).toBe('The Dig Site');
  });

  it('parses a bare "N Combat" requirement into combatLevel too', () => {
    expect(parseRequirement(req('63 Combat')).combatLevel).toBe(63);
  });

  it('parses a "N SkillA or M SkillB" either/or requirement into two alternatives', () => {
    const result = parseRequirement(req('33 Magic or 40 Smithing'));
    expect(result.skill).toBeNull();
    expect(result.level).toBeNull();
    expect(result.alternatives).toEqual([
      { skill: expect.objectContaining({ name: 'Magic' }), level: 33, boostable: false },
      { skill: expect.objectContaining({ name: 'Smithing' }), level: 40, boostable: false },
    ]);
  });

  it('parses an either/or requirement with trailing explanatory text', () => {
    const result = parseRequirement(req('33 Magic or 40 Smithing to produce the gold bar.'));
    expect(result.alternatives).toHaveLength(2);
    expect(result.alternatives?.[0].skill.name).toBe('Magic');
    expect(result.alternatives?.[1].skill.name).toBe('Smithing');
  });

  it('flags either side of an either/or requirement as boostable independently', () => {
    const result = parseRequirement(req('33 Magic (boostable) or 40 Smithing'));
    expect(result.alternatives?.[0]).toEqual({ skill: expect.objectContaining({ name: 'Magic' }), level: 33, boostable: true });
    expect(result.alternatives?.[1]).toEqual({ skill: expect.objectContaining({ name: 'Smithing' }), level: 40, boostable: false });
  });
});

describe('requirementStatus', () => {
  const skillLevels = new Map([['Crafting', 30]]);
  const completedQuests = new Set(['Priest in Peril']);

  it('is met when the player is at or above the required skill level', () => {
    expect(requirementStatus(parseRequirement(req('25 Crafting')), skillLevels, completedQuests)).toBe('met');
  });

  it('is unmet when the player is below the required skill level', () => {
    expect(requirementStatus(parseRequirement(req('99 Crafting')), skillLevels, completedQuests)).toBe('unmet');
  });

  it('is met when the required quest is completed', () => {
    expect(requirementStatus(parseRequirement(req('Priest in Peril', true)), skillLevels, completedQuests)).toBe('met');
  });

  it('is unmet when the required quest is not completed', () => {
    expect(requirementStatus(parseRequirement(req('Nature Spirit', true)), skillLevels, completedQuests)).toBe('unmet');
  });

  it('strips a trailing "(partial)" annotation before checking quest completion', () => {
    expect(requirementStatus(parseRequirement(req('Priest in Peril (partial)', true)), skillLevels, completedQuests)).toBe('met');
  });

  it('is unknown for a requirement with no determinable skill or quest', () => {
    expect(requirementStatus(parseRequirement(req('500 music')), skillLevels, completedQuests)).toBe('unknown');
  });

  it('checks a boostable skill requirement against the player\'s trained level, same as a regular one', () => {
    expect(requirementStatus(parseRequirement(req('30 Crafting (boostable)')), skillLevels, completedQuests)).toBe('met');
    expect(requirementStatus(parseRequirement(req('31 Crafting (boostable)')), skillLevels, completedQuests)).toBe('unmet');
  });

  it('is met for an either/or requirement when only one side is met', () => {
    // skillLevels only has Crafting 30 — "or 40 Smithing" is unmet, but the Crafting side is met.
    expect(requirementStatus(parseRequirement(req('25 Crafting or 40 Smithing')), skillLevels, completedQuests)).toBe('met');
  });

  it('is unmet for an either/or requirement when neither side is met', () => {
    expect(requirementStatus(parseRequirement(req('99 Crafting or 99 Smithing')), skillLevels, completedQuests)).toBe('unmet');
  });

  it('checks a combat-level requirement against the calculated combat level', () => {
    const levels = new Map([['Attack', 60], ['Strength', 60], ['Defence', 60], ['Constitution', 60]]);
    expect(calculateCombatLevel(levels)).toBe(Math.floor((1.3 * 120 + 60 + 60) / 4));
    expect(requirementStatus(parseRequirement(req('69 Combat')), levels, completedQuests)).toBe('met');
    expect(requirementStatus(parseRequirement(req('100 combat level')), levels, completedQuests)).toBe('unmet');
  });
});

describe('summarizeRequirementStatuses', () => {
  it('reads as met when every determinable requirement is met', () => {
    expect(summarizeRequirementStatuses(['met', 'met', 'unknown'])).toEqual({ label: 'Requirements Met', level: 'met' });
  });

  it('reads as met when nothing is determinable at all', () => {
    expect(summarizeRequirementStatuses(['unknown', 'unknown'])).toEqual({ label: 'Requirements Met', level: 'met' });
  });

  it('reads as unmet when no determinable requirement is met', () => {
    expect(summarizeRequirementStatuses(['unmet', 'unmet', 'unknown'])).toEqual({ label: 'No Requirements Met', level: 'unmet' });
  });

  it('reads as some when at most 80% of determinable requirements are met', () => {
    expect(summarizeRequirementStatuses(['met', 'unmet'])).toEqual({ label: 'Some Requirements Met', level: 'some' });
    expect(summarizeRequirementStatuses(['met', 'met', 'met', 'met', 'unmet'])).toEqual({ label: 'Some Requirements Met', level: 'some' });
  });

  it('reads as most when above 80% of determinable requirements are met', () => {
    expect(summarizeRequirementStatuses(['met', 'met', 'met', 'met', 'met', 'met', 'met', 'met', 'met', 'unmet'])).toEqual({
      label: 'Most Requirements Met',
      level: 'most',
    });
  });
});

describe('keepHighestSkillRequirements', () => {
  const rows = (...texts: string[]) => texts.map((text) => ({ parsed: parseRequirement(req(text)) }));

  it('keeps only the highest level per skill', () => {
    const result = keepHighestSkillRequirements(rows('81 Fishing (boostable)', '90 Fishing'));
    expect(result.map((row) => row.parsed.text)).toEqual(['90 Fishing']);
  });

  it('keeps the highest regardless of order and leaves other rows alone', () => {
    const result = keepHighestSkillRequirements(rows('90 Fishing', '50 Magic', '81 Fishing (boostable)', '500 music'));
    expect(result.map((row) => row.parsed.text)).toEqual(['90 Fishing', '50 Magic', '500 music']);
  });
});

describe('calculateCombatLevel', () => {
  it('reaches 138 with every combat skill at 99', () => {
    const levels = new Map(['Attack', 'Strength', 'Defence', 'Constitution', 'Prayer', 'Magic', 'Ranged', 'Summoning'].map((name) => [name, 99] as [string, number]));
    expect(calculateCombatLevel(levels)).toBe(138);
  });

  it('uses the best of melee, magic and ranged', () => {
    const levels = new Map([['Magic', 99], ['Constitution', 99], ['Defence', 99]]);
    expect(calculateCombatLevel(levels)).toBe(Math.floor((1.3 * 198 + 99 + 99) / 4));
  });

  it('counts a fresh account as combat level 3', () => {
    expect(calculateCombatLevel(new Map([['Attack', 1], ['Strength', 1], ['Defence', 1], ['Constitution', 10]]))).toBe(3);
  });
});

describe('dropQuestCoveredSkills', () => {
  const quests = [{ name: "Nomad's Requiem", skillRequirements: [{ skill: 'Mining', level: 66 }] }];
  const rows = (...items: Array<[string, boolean]>) => items.map(([text, quest]) => ({ parsed: parseRequirement(req(text, quest)) }));

  it('drops a skill a listed quest already requires at least as much of', () => {
    const result = dropQuestCoveredSkills(rows(["Nomad's Requiem", true], ['60 Mining', false], ['70 Fishing', false]), quests);
    expect(result.map((row) => row.parsed.text)).toEqual(["Nomad's Requiem", '70 Fishing']);
  });

  it('keeps a skill that demands more than the quest does, or when the quest is not listed', () => {
    expect(dropQuestCoveredSkills(rows(["Nomad's Requiem", true], ['80 Mining', false]), quests)).toHaveLength(2);
    expect(dropQuestCoveredSkills(rows(['60 Mining', false]), quests)).toHaveLength(1);
  });
});
