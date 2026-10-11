import { TRACKED_SKILLS } from '@shared/config.js';

import { ARTISAN_SKILLS } from './skills/artisan';
import { COMBAT_SKILLS } from './skills/combat';
import { GATHERING_SKILLS } from './skills/gathering';
import { STATE_SKILLS } from './skills/states';
import { SUPPORT_SKILLS } from './skills/support';
import { makePose, type Look, type SkillDef, type SkillSprite } from './spriteKit';

export { HEIGHT, PALETTE, WIDTH } from './spriteKit';
export type { Look, SkillSprite, SpriteStep } from './spriteKit';

/**
 * Registry of every skill's animation, keyed by the skill's slug from
 * config.js — one entry per tracked skill (everything except the synthetic
 * "Overall" row), in the same order as the hiscore matrix. The animations
 * themselves live in ./skills/*, grouped by theme.
 */
const DEFINITIONS: Record<string, SkillDef> = {
  ...COMBAT_SKILLS,
  ...GATHERING_SKILLS,
  ...ARTISAN_SKILLS,
  ...SUPPORT_SKILLS,
  ...STATE_SKILLS,
};

export interface SkillInfo {
  id: string;
  name: string;
}

export const SKILL_INFOS: SkillInfo[] = TRACKED_SKILLS.map((skill: { slug: string; name: string }) => ({
  id: skill.slug,
  name: skill.name,
}));

/** Downtime animations — shown beside the skills but not skills themselves:
 * no XP, no beat. */
export const STATE_INFOS: SkillInfo[] = [
  { id: 'sleeping', name: 'Sleeping' },
  { id: 'vacation', name: 'Vacation' },
];

/** One animation (a skill's, or a downtime state's) drawn on one character. */
export function buildSkillSprite(info: SkillInfo, look: Look): SkillSprite {
  const definition = DEFINITIONS[info.id];
  if (!definition) throw new Error(`No sprite animation for skill "${info.id}"`);
  const { steps, ...meta } = definition;
  return { id: info.id, name: info.name, ...meta, steps: steps(makePose(look), look) };
}
