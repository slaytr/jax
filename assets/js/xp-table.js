/**
 * Cumulative XP required to reach each level, for the per-player skill
 * grid's progress-to-next-level bar (player-skills.js) — how far into the
 * *current* level a player's XP sits, not their level against the skill's
 * cap (which is what the group matrix's own share bar already shows).
 *
 * Every skill follows the game's one standard curve —
 * level(n) xp = floor(1/4 * sum_{k=1}^{n-1} floor(k + 300 * 2^(k/7))) —
 * except Invention, an elite skill with its own curve (slower early, faster
 * late; RuneScape Wiki: "Level 84 is halfway to 99, as opposed to level 92
 * in other skills"). Its table below is transcribed from
 * https://runescape.wiki/w/Experience/Table and cross-checked against that
 * same halfway-point fact (level 84's value here is within 0.2% of half of
 * level 99's).
 */

const MAX_STANDARD_LEVEL = 120;

/** table[level] = cumulative xp to reach `level`; table[0] is unused (there
 * is no level 0). Extends to 120 to cover every elite skill's cap, not just
 * the common 99. */
function buildStandardTable(maxLevel) {
  const table = [0, 0];
  let sum = 0;
  for (let level = 2; level <= maxLevel; level += 1) {
    const n = level - 1;
    sum += Math.floor(n + 300 * 2 ** (n / 7));
    table[level] = Math.floor(sum / 4);
  }
  return Object.freeze(table);
}

export const STANDARD_XP_TABLE = buildStandardTable(MAX_STANDARD_LEVEL);

// prettier-ignore
export const INVENTION_XP_TABLE = Object.freeze([
  0, 0, 830, 1861, 2902, 3980, 5126, 6380, 7787, 9400, 11275,
  13605, 16372, 19656, 23546, 28134, 33520, 39809, 47109, 55535, 65209,
  77190, 90811, 106221, 123573, 143025, 164742, 188893, 215651, 245196, 277713,
  316311, 358547, 404634, 454796, 509259, 568254, 632019, 700797, 774834, 854383,
  946227, 1044569, 1149696, 1261903, 1381488, 1508756, 1644015, 1787581, 1939773, 2100917,
  2283490, 2476369, 2679917, 2894505, 3120508, 3358307, 3608290, 3870846, 4146374, 4435275,
  4758122, 5096111, 5449685, 5819299, 6205407, 6608473, 7028964, 7467354, 7924122, 8399751,
  8925664, 9472665, 10041285, 10632061, 11245538, 11882262, 12542789, 13227679, 13937496, 14672812,
  15478994, 16313404, 17176661, 18069395, 18992239, 19945833, 20930821, 21947856, 22997593, 24080695,
  25259906, 26475754, 27728955, 29020233, 30350318, 31719944, 33129852, 34580790, 36073511, 37608773,
  39270442, 40978509, 42733789, 44537107, 46389292, 48291180, 50243611, 52247435, 54303504, 56412678,
  58575824, 60793812, 63067521, 65397835, 67785643, 70231841, 72737330, 75303019, 77929820, 80618654,
]);

const xpTableFor = (skill) => (skill.name === 'Invention' ? INVENTION_XP_TABLE : STANDARD_XP_TABLE);

/** Cumulative xp required to reach `level` on `skill`'s own curve, or
 * `undefined` past the table's top (the skill's real level cap). */
export const xpForLevel = (skill, level) => xpTableFor(skill)[level];

/** The reverse of xpForLevel: the highest level whose own xp threshold is
 * at or below `xp` — level 1 for any xp below the table's own level-2 entry
 * (there's no level 0), and never above the table's own top level, however
 * far `xp` climbs past it. Used to keep a goal dialog's Level and XP inputs
 * in sync as a viewer edits either one directly (player-goals.js). */
export function levelForXp(skill, xp) {
  const table = xpTableFor(skill);
  let level = 1;
  for (let candidate = 2; candidate < table.length; candidate += 1) {
    if (table[candidate] > xp) break;
    level = candidate;
  }
  return level;
}

/**
 * How far `xp` sits between `level` and `level + 1`, as a 0–1 share — the
 * skill grid's progress-to-next-level bar. `level` is already at the top of
 * its table (the skill's real level cap, whatever `skill.max` says or not),
 * or `xp` doesn't reach the table's own next entry (a stale/inconsistent
 * reading): both read as "full", since there's no further progress to show
 * either way.
 */
export function xpProgress(skill, level, xp) {
  const at = xpForLevel(skill, level);
  const next = xpForLevel(skill, level + 1);

  if (at === undefined || next === undefined) return 1;

  const share = (xp - at) / (next - at);
  return Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 1;
}
