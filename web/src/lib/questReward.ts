import { SKILLS } from '@shared/config.js';

export type RewardPart = { type: 'text'; text: string } | { type: 'skill'; skill: (typeof SKILLS)[number] };

/** Real skills only — SKILLS' own id-0 "Overall" row isn't a skill anyone's
 * ever actually awarded xp in, and "Skill"/"Combat" (quest-guides.json's own
 * placeholders for "a skill of choice"/"a combat skill of choice") aren't
 * real skill names to begin with, so neither needs excluding by name here. */
const SKILL_NAMES = SKILLS.filter((skill) => skill.id !== 0).map((skill) => skill.name);
const SKILL_PATTERN = new RegExp(`\\b(${SKILL_NAMES.join('|')})\\b`, 'g');
const SKILL_BY_NAME = new Map(SKILLS.map((skill) => [skill.name, skill]));

const MENTIONS_XP = /\b(experience|xp)\b/i;

/** Splits one quest-guides.json reward line into plain-text and skill runs,
 * for QuestQuickGuide.vue to render a skill's own icon in place of its name
 * — but only within a line that's actually granting xp at all (the word
 * "experience"/"XP" appears somewhere in it); a reward that merely mentions
 * a skill by name without granting it any xp ("Access to the Oo'glog
 * Hunter area", an item literally called "Magic watering can") stays plain
 * text entirely; asking for an icon there would misread as an xp reward
 * that was never actually being made. Every skill named inside a
 * qualifying line gets its own icon, not just the first — a "choice of
 * Attack, Constitution, Strength, …" xp reward reads as a row of icons
 * rather than one substitution followed by four bare skill names. */
export function parseRewardItem(text: string): RewardPart[] {
  if (!MENTIONS_XP.test(text)) return [{ type: 'text', text }];

  const parts: RewardPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(SKILL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ type: 'text', text: text.slice(lastIndex, index) });
    parts.push({ type: 'skill', skill: SKILL_BY_NAME.get(match[0])! });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', text: text.slice(lastIndex) });
  return parts;
}
