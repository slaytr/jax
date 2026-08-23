/**
 * Static reference data: skill metadata and the validated player palette.
 */

/**
 * RS3 skills in hiscore-feed id order. `name` is the in-game name, which differs
 * from the feed's own labels for two skills (Hitpoints → Constitution,
 * Runecraft → Runecrafting).
 *
 * `max` is the skill's level cap, used only to scale the progress rule in a cell.
 */
const RAW_SKILLS = [
  { id: 0, name: 'Overall', max: 2898, combat: false },
  { id: 1, name: 'Attack', max: 99, combat: true },
  { id: 2, name: 'Defence', max: 99, combat: true },
  { id: 3, name: 'Strength', max: 99, combat: true },
  { id: 4, name: 'Constitution', max: 99, combat: true },
  { id: 5, name: 'Ranged', max: 99, combat: true },
  { id: 6, name: 'Prayer', max: 99, combat: true },
  { id: 7, name: 'Magic', max: 99, combat: true },
  { id: 8, name: 'Cooking', max: 99, combat: false },
  { id: 9, name: 'Woodcutting', max: 99, combat: false },
  { id: 10, name: 'Fletching', max: 99, combat: false },
  { id: 11, name: 'Fishing', max: 99, combat: false },
  { id: 12, name: 'Firemaking', max: 99, combat: false },
  { id: 13, name: 'Crafting', max: 99, combat: false },
  { id: 14, name: 'Smithing', max: 99, combat: false },
  { id: 15, name: 'Mining', max: 99, combat: false },
  { id: 16, name: 'Herblore', max: 120, combat: false },
  { id: 17, name: 'Agility', max: 99, combat: false },
  { id: 18, name: 'Thieving', max: 99, combat: false },
  { id: 19, name: 'Slayer', max: 120, combat: false },
  { id: 20, name: 'Farming', max: 120, combat: false },
  { id: 21, name: 'Runecrafting', max: 99, combat: false },
  { id: 22, name: 'Hunter', max: 99, combat: false },
  { id: 23, name: 'Construction', max: 99, combat: false },
  { id: 24, name: 'Summoning', max: 99, combat: false },
  { id: 25, name: 'Dungeoneering', max: 120, combat: false },
  { id: 26, name: 'Divination', max: 99, combat: false },
  { id: 27, name: 'Invention', max: 150, combat: false },
  { id: 28, name: 'Archaeology', max: 120, combat: false },
  { id: 29, name: 'Necromancy', max: 120, combat: true },
];

/** Shared by the icon downloader and the renderer so filenames cannot drift. */
export const skillSlug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const SKILLS = Object.freeze(
  RAW_SKILLS.map((skill) => Object.freeze({ ...skill, slug: skillSlug(skill.name) })),
);

/** Committed locally rather than hotlinked — see scripts/fetch-icons.mjs. */
export const iconFor = (skill) => `assets/icons/${skill.slug}.png`;

/**
 * When the update job is scheduled to run, in UTC — on the hour, every hour.
 *
 * COUPLED to the cron in .github/workflows/update-hiscores.yml. Change one and
 * you must change the other; nothing enforces it at runtime.
 *
 * GitHub queues cron jobs on a best-effort basis and can run them late, so any
 * countdown derived from this is an estimate, not a guarantee.
 */
export const UPDATE_SCHEDULE = Object.freeze({ minute: 0, hours: Array.from({ length: 24 }, (_, hour) => hour) });

/** Every skill except the synthetic "Overall" row. */
export const TRACKED_SKILLS = Object.freeze(SKILLS.filter((skill) => skill.id !== 0));

/**
 * Current RS3 caps, for scaling the Account Standings progress bars. Not
 * derived from SKILLS' own `max` totals — those track individual skill caps
 * (last updated for Necromancy) and undercount the game's actual current
 * total level; update by hand if the caps change again.
 */
export const MAX_TOTAL_LEVEL = 3232;
export const MAX_QUEST_POINTS = 473;

/**
 * Player palette: teal, red, green, blue, pink.
 *
 * Validated with the dataviz palette validator against the page surface
 * #0c0a09 in this exact declared order: lightness band, chroma floor,
 * contrast and the adjacent-pair CVD gate all PASS (worst adjacent
 * normal-vision ΔE 20.9). Red↔green sits in the accepted 6–8 CVD floor band
 * — legal here because colour is never the sole identifier: every player's
 * name sits beside their colour in every view. Re-run the validator before
 * changing any value or reordering.
 *
 * Colour is pinned per account (see PLAYER_COLOURS below) rather than
 * cycled by index, so this order only matters for validation and for the
 * fallback a roster addition gets.
 */
const SERIES_COLOURS = Object.freeze(['#0b8fa3', '#cc3346', '#199e70', '#3987e5', '#dd6296']);

/**
 * Fixed per-account colour, keyed by slug — so a player's colour stays
 * stable as standings shift, rather than swapping when two players cross in
 * rank. Update alongside data/players.json if the roster changes; a slug not
 * listed here falls back to cycling SERIES_COLOURS by roster position (see
 * colourForPlayer).
 */
const PLAYER_COLOURS = Object.freeze({
  'jelly-tax': SERIES_COLOURS[0],
  bloyze: SERIES_COLOURS[1],
  melooms: SERIES_COLOURS[2],
  'cpt-draynor': SERIES_COLOURS[3],
  highlordwhos: SERIES_COLOURS[4],
});

export const colourForIndex = (index) => SERIES_COLOURS[index % SERIES_COLOURS.length];

/** `fallbackIndex` (e.g. roster position) covers a slug with no pinned colour. */
export const colourForPlayer = (slug, fallbackIndex) => PLAYER_COLOURS[slug] ?? colourForIndex(fallbackIndex);

