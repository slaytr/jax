import { colourForPlayer } from '@shared/config.js';

import type { Palette } from './pixelArt';
import { PALETTE, SKILL_INFOS, STATE_INFOS, buildSkillSprite, type Look, type SkillInfo, type SkillSprite } from './skillSprites';

/**
 * One chibi per group member, themed on that player's pinned colour (the
 * same one the charts use — assets/js/config.js PLAYER_COLOURS), so a
 * glance at a sprite says whose it is. Every look shares the 10x9 head /
 * 9x7 body footprint, so any player can perform any skill.
 *
 * Frame letters: t/T tunic + shade, p trousers, h/H hair + highlight,
 * a accent trim, N hat, d beard, s/S skin — each look overrides the ones it
 * cares about through its palette.
 */
export interface PlayerSprite {
  slug: string;
  name: string;
  /** Theme colour — the player's pinned colour from config.js. */
  colour: string;
  look: Look;
  palette: Palette;
}

// ── Heads ───────────────────────────────────────────────────────────────────
const FACE = ['KssswsswsK', 'KsssessesK', 'KsmssssmsK', '.KsssssSK.', '..KKKKKK..'];

/** Jelly Tax: messy, spiky dark hair. */
const SPIKY_HEAD = ['.K.KKKK.K.', '.KhhHHhhK.', 'KhHHhhhhhK', 'KhhssssshK', ...FACE];

/** Bloyze: short blond hair under a headband. */
const BANDANA_HEAD = ['..KKKKKK..', '.KhhHHhhK.', 'KhHHhhhhhK', 'KaaaaaaaaK', ...FACE];

/** Melooms: long hair past the shoulders, bow on top. */
const LONG_HAIR_HEAD = [
  '..KKKKKK..',
  '.KhhHHhaK.',
  'KhHHhhhaaK',
  'KhhssssshK',
  'KhsswsswhK',
  'KhssessehK',
  'KhmssssmhK',
  '.KhsssshK.',
  '.KhKKKKhK.',
];

/** Cpt Draynor: captain's hat, brown beard. */
const CAPTAIN_HEAD = [
  '..KKKKKK..',
  '.KNNNNNNK.',
  'KNNNaaNNNK',
  'KNNNNNNNNK',
  'KssswsswsK',
  'KsssessesK',
  'KdsmssmsdK',
  '.KddddddK.',
  '..KKKKKK..',
];

/** HighlordWhos: hood up over the face, silver fringe peeking out. */
const HOOD_HEAD = [
  '..KKKKKK..',
  '.KttttttK.',
  'KttttttttK',
  'KtThHHhTtK',
  'KtsswsswtK',
  'KtssessetK',
  'KtmssssmtK',
  '.KtsssStK.',
  '..KKKKKK..',
];

// ── Bodies ──────────────────────────────────────────────────────────────────
const TUNIC_BODY = ['.KtttttK.', '.KtttttK.', '.KooyooK.', '.KpppppK.', '.KpK.KpK.', '.KoK.KoK.', '.KKK.KKK.'];

/** Melooms: a dress with a sash and a flared skirt. */
const DRESS_BODY = ['.KtttttK.', '.KtttttK.', '.KaaaaaK.', 'KtttttttK', 'KTTTTTTTK', '.KoK.KoK.', '.KKK.KKK.'];

/** Cpt Draynor: a coat with a gold button. */
const COAT_BODY = ['.KtttttK.', '.KttyttK.', '.KooyooK.', '.KpppppK.', '.KpK.KpK.', '.KoK.KoK.', '.KKK.KKK.'];

/** HighlordWhos: a hoodie — bunched hood at the neck, drawstrings, ribbed hem. */
const HOODIE_BODY = ['.KtTTTtK.', '.KtaTatK.', '.KTTTTTK.', '.KpppppK.', '.KpK.KpK.', '.KoK.KoK.', '.KKK.KKK.'];

type LookSpec = Pick<PlayerSprite, 'slug' | 'name'> & { look: Look; colours: Palette };

// Theme colour → tunic (t), its shade → T; every other override is flavour.
// A look can set its own `t` (HighlordWhos' dark hoodie) to wear something other
// than the theme colour.
const SPECS: LookSpec[] = [
  {
    slug: 'jelly-tax',
    name: 'Jelly Tax',
    look: { head: SPIKY_HEAD, body: TUNIC_BODY },
    colours: { T: '#086a79', p: '#3d4a63', h: '#2c2230', H: '#4f3f5c' },
  },
  {
    slug: 'bloyze',
    name: 'Bloyze',
    look: { head: BANDANA_HEAD, body: TUNIC_BODY },
    colours: { T: '#8f2232', p: '#5a4636', h: '#d9a93a', H: '#f2d36b', a: '#fff0e0' },
  },
  {
    slug: 'melooms',
    name: 'Melooms',
    look: { head: LONG_HAIR_HEAD, body: DRESS_BODY },
    colours: { T: '#117050', h: '#6b3a22', H: '#9b5a33', a: '#ff9ea1', s: '#e9b48a', S: '#c98f62', m: '#e07a80' },
  },
  {
    slug: 'cpt-draynor',
    name: 'Cpt Draynor',
    look: { head: CAPTAIN_HEAD, body: COAT_BODY },
    colours: { T: '#2a5fa3', p: '#2f3b5a', N: '#23304f', a: '#ffd23f', d: '#7a5a3a', s: '#d99a6c', S: '#b87a50', m: '#c97a6c' },
  },
  {
    slug: 'highlordwhos',
    name: 'HighlordWhos',
    look: { head: HOOD_HEAD, body: HOODIE_BODY },
    // t/T: the dark purple hoodie and its shade, in place of the usual theme-
    // coloured tunic; a: pink drawstrings keep the theme colour in the outfit.
    colours: { t: '#3b2a63', T: '#241838', p: '#262433', h: '#cfd2e6', H: '#ffffff', a: '#ff9fc8', s: '#ffe0c4', S: '#efb892' },
  },
];

export const PLAYER_SPRITES: PlayerSprite[] = SPECS.map(({ slug, name, look, colours }, index) => {
  const colour = colourForPlayer(slug, index) as string;
  return {
    slug,
    name,
    colour,
    look,
    palette: { ...PALETTE, ...colours, t: colours.t ?? colour },
  };
});

const spriteCache = new Map<string, SkillSprite[]>();

function memoised(cacheKey: string, infos: SkillInfo[], player: PlayerSprite): SkillSprite[] {
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;
  const built = infos.map((info) => buildSkillSprite(info, player.look));
  spriteCache.set(cacheKey, built);
  return built;
}

/** Every skill's animation for one player, built on first request and kept —
 * 29 four-frame animations per player is cheap, but there's no reason to
 * build the four players nobody's looking at. */
export const skillSpritesFor = (player: PlayerSprite): SkillSprite[] => memoised(`skills:${player.slug}`, SKILL_INFOS, player);

/** The downtime animations (sleeping, on vacation) for one player. */
export const stateSpritesFor = (player: PlayerSprite): SkillSprite[] => memoised(`states:${player.slug}`, STATE_INFOS, player);
