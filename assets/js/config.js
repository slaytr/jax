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
 * When the update job is scheduled to run, in UTC — every six hours at :17.
 *
 * COUPLED to the cron in .github/workflows/update-hiscores.yml. Change one and
 * you must change the other; nothing enforces it at runtime. (The cron string
 * is not quoted here because it contains a comment-terminating sequence.)
 *
 * GitHub queues cron jobs on a best-effort basis and can run them late, so any
 * countdown derived from this is an estimate, not a guarantee.
 */
export const UPDATE_SCHEDULE = Object.freeze({ minute: 17, hours: [0, 6, 12, 18] });

/** Every skill except the synthetic "Overall" row. */
export const TRACKED_SKILLS = Object.freeze(SKILLS.filter((skill) => skill.id !== 0));

export const SKILL_BY_ID = Object.freeze(
  Object.fromEntries(SKILLS.map((skill) => [skill.id, skill])),
);

/**
 * Player palette: crimson, blue, green, purple, pink — assigned left-to-right
 * down the total-level standings.
 *
 * Validated with the dataviz palette validator against the page surface
 * #0c0a09 in this exact order: lightness band, chroma floor, contrast and the
 * adjacent-pair gates all PASS (worst adjacent normal-vision ΔE 18.4).
 *
 * Known limit: across *all* pairs the worst is blue↔purple at ΔE 12.5 normal /
 * 5.5 deutan. Five hues containing both a blue and a purple cannot clear the
 * all-pairs floor — that is a documented property of the method, not an
 * oversight. It is acceptable here only because colour is never the sole
 * identifier: every player's name sits beside their colour in every view.
 * Re-run the validator before changing any value.
 */
const SERIES_COLOURS = Object.freeze(['#cc3346', '#3987e5', '#199e70', '#8d4fc9', '#dd6296']);

export const colourForIndex = (index) => SERIES_COLOURS[index % SERIES_COLOURS.length];

