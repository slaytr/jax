import { describe, expect, it } from 'vitest';

import { parseRewardItem } from './questReward';

describe('parseRewardItem', () => {
  it('splits a simple "N Skill experience" reward into text/skill/text', () => {
    const parts = parseRewardItem('3,500 Farming experience');
    expect(parts).toEqual([
      { type: 'text', text: '3,500 ' },
      { type: 'skill', skill: expect.objectContaining({ name: 'Farming' }) },
      { type: 'text', text: ' experience' },
    ]);
  });

  it('replaces every skill named in a multi-skill xp reward, not just the first', () => {
    const parts = parseRewardItem('10,000 Combat experience lamp in a choice of Attack, Constitution, or Strength');
    const skillNames = parts.filter((p) => p.type === 'skill').map((p) => (p as any).skill.name);
    expect(skillNames).toEqual(['Attack', 'Constitution', 'Strength']);
  });

  it('leaves a reward with no xp wording as plain text, even if it names a skill', () => {
    expect(parseRewardItem('Access to the Oo\'glog Hunter area')).toEqual([{ type: 'text', text: "Access to the Oo'glog Hunter area" }]);
  });

  it('leaves an item literally named after a skill alone when nothing grants xp', () => {
    expect(parseRewardItem('Magic watering can')).toEqual([{ type: 'text', text: 'Magic watering can' }]);
  });

  it('leaves a reward with xp wording but no real skill name as plain text', () => {
    expect(parseRewardItem('2,500 Skill experience lamp (skill must be level 30 or higher, bankable)')).toEqual([
      { type: 'text', text: '2,500 Skill experience lamp (skill must be level 30 or higher, bankable)' },
    ]);
  });

  it('is case-sensitive so an unrelated capitalised word never false-matches', () => {
    expect(parseRewardItem('Prismatic XP lamp yielding 5,000 experience in a skill of choice')).toEqual([
      { type: 'text', text: 'Prismatic XP lamp yielding 5,000 experience in a skill of choice' },
    ]);
  });
});
