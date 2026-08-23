/**
 * Derived standings. Every function is pure and returns fresh objects — nothing
 * here mutates the loaded snapshot.
 */

import { TRACKED_SKILLS } from './config.js';

const EMPTY_SKILL = Object.freeze({ level: 1, xp: 0, rank: null });

const skillFor = (player, skillId) => player.skillById?.[skillId] ?? EMPTY_SKILL;

/** Higher is better for level and xp; for rank, lower is better and null is worst. */
function isBetter(metric, candidate, incumbent) {
  if (incumbent === null) return true;
  if (metric === 'rank') {
    if (candidate.rank === null) return false;
    if (incumbent.rank === null) return true;
    return candidate.rank < incumbent.rank;
  }
  if (candidate[metric] !== incumbent[metric]) return candidate[metric] > incumbent[metric];
  return candidate.xp > incumbent.xp;
}

/**
 * One row per skill, one cell per player, with the row leader marked.
 * `share` scales the in-cell progress rule: level against the skill cap, xp and
 * rank against the best value in the row so the row is self-normalising.
 */
export function buildMatrix(players, metric) {
  return TRACKED_SKILLS.map((skill) => {
    const entries = players.map((player) => ({ player, value: skillFor(player, skill.id) }));

    const best = entries.reduce(
      (leader, entry) => (isBetter(metric, entry.value, leader?.value ?? null) ? entry : leader),
      null,
    );

    const maxXp = Math.max(...entries.map((entry) => entry.value.xp), 1);

    const cells = entries.map(({ player, value }) => {
      const share =
        metric === 'level'
          ? Math.min(1, value.level / skill.max)
          : metric === 'xp'
            ? value.xp / maxXp
            : value.rank === null
              ? 0
              : Math.min(1, (best.value.rank ?? value.rank) / value.rank);

      return {
        player,
        level: value.level,
        xp: value.xp,
        rank: value.rank,
        share: Number.isFinite(share) ? Math.max(0, share) : 0,
        isLeader: player.slug === best.player.slug && value.xp > 0,
      };
    });

    return { skill, cells, groupXp: entries.reduce((sum, entry) => sum + entry.value.xp, 0) };
  });
}

/** Pseudo-skill descriptor so the quest row reuses the matrix row chrome. */
export const QUEST_MEASURE = Object.freeze({ id: 'quests', name: 'Quest points', slug: 'quest-points' });

/**
 * Quest points as a matrix row. Not a skill — it has no level, xp or rank — so
 * it carries a single value and normalises against the group's best.
 */
export function buildQuestRow(players) {
  const values = players.map((player) => ({
    player,
    points: Number.isFinite(player.questPoints) ? player.questPoints : null,
    stale: Boolean(player.questsStale),
  }));

  const best = Math.max(...values.map((entry) => entry.points ?? 0), 0);

  return {
    skill: QUEST_MEASURE,
    isQuestRow: true,
    cells: values.map((entry) => ({
      player: entry.player,
      points: entry.points,
      questsComplete: entry.player.questsComplete ?? null,
      share: best > 0 && entry.points ? entry.points / best : 0,
      isLeader: entry.points !== null && entry.points > 0 && entry.points === best,
      stale: entry.stale,
    })),
  };
}

/** How many rows each player leads, keyed by slug. Drives the column headers. */
export function leaderCounts(rows) {
  const counts = Object.create(null);
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.isLeader) counts[cell.player.slug] = (counts[cell.player.slug] ?? 0) + 1;
    }
  }
  return counts;
}

export function groupSummary(players) {
  const active = players.filter((player) => (player.total?.xp ?? 0) > 0);

  const countAtLeast = (threshold) =>
    players.reduce(
      (count, player) => count + TRACKED_SKILLS.filter((skill) => skillFor(player, skill.id).level >= threshold).length,
      0,
    );

  return {
    totalXp: players.reduce((sum, player) => sum + (player.total?.xp ?? 0), 0),
    totalLevel: players.reduce((sum, player) => sum + (player.total?.level ?? 0), 0),
    maxedSkills: countAtLeast(99),
    milestone50: countAtLeast(50),
    playerCount: players.length,
    activeCount: active.length,
  };
}

/** Standings ordered by a metric, with dense placement (ties share a place). */
export function standings(players, metric = 'xp') {
  const ordered = [...players].sort((a, b) => {
    const left = metric === 'level' ? a.total?.level ?? 0 : a.total?.xp ?? 0;
    const right = metric === 'level' ? b.total?.level ?? 0 : b.total?.xp ?? 0;
    return right - left || (b.total?.xp ?? 0) - (a.total?.xp ?? 0);
  });

  const leaderXp = ordered[0]?.total?.xp ?? 0;
  return ordered.map((player, index) => ({
    player,
    place: index + 1,
    behind: leaderXp - (player.total?.xp ?? 0),
    share: leaderXp > 0 ? (player.total?.xp ?? 0) / leaderXp : 0,
  }));
}

const latestSnapshot = (snapshots) => snapshots[snapshots.length - 1] ?? null;

/**
 * Baseline for a window: the newest snapshot at or before the cutoff, so the
 * delta spans at least the requested window. Falls back to the oldest snapshot
 * when history is shorter than the window.
 */
function baselineSnapshot(snapshots, windowSeconds) {
  if (snapshots.length === 0) return null;
  if (!Number.isFinite(windowSeconds)) return snapshots[0];

  const cutoff = (latestSnapshot(snapshots)?.t ?? 0) - windowSeconds;
  const atOrBefore = snapshots.filter((snapshot) => snapshot.t <= cutoff);
  return atOrBefore.length > 0 ? atOrBefore[atOrBefore.length - 1] : snapshots[0];
}

/**
 * XP gained per player over a window. Index 0 of a snapshot vector is Overall,
 * so it is the total; indices 1+ are the individual skills.
 */
export function computeGains(snapshots, players, windowSeconds) {
  const current = latestSnapshot(snapshots);
  const baseline = baselineSnapshot(snapshots, windowSeconds);

  const hasSpan = Boolean(current && baseline && current.t > baseline.t);

  const rows = players.map((player) => {
    const now = current?.p?.[player.slug];
    const then = baseline?.p?.[player.slug];
    const total = hasSpan && now && then ? Math.max(0, (now[0] ?? 0) - (then[0] ?? 0)) : 0;

    const bySkill = TRACKED_SKILLS.map((skill) => ({
      skill,
      gained: hasSpan && now && then ? Math.max(0, (now[skill.id] ?? 0) - (then[skill.id] ?? 0)) : 0,
    }))
      .filter((entry) => entry.gained > 0)
      .sort((a, b) => b.gained - a.gained);

    return { player, total, bySkill };
  });

  const best = Math.max(...rows.map((row) => row.total), 0);

  const spanSeconds = hasSpan ? current.t - baseline.t : 0;

  return {
    hasSpan,
    spanSeconds,
    // False when history is shorter than the window asked for, so the figures
    // actually cover less time than the heading claims.
    coversWindow: hasSpan && (!Number.isFinite(windowSeconds) || spanSeconds >= windowSeconds),
    from: baseline ? new Date(baseline.t * 1000).toISOString() : null,
    to: current ? new Date(current.t * 1000).toISOString() : null,
    rows: rows
      .map((row) => ({ ...row, share: best > 0 ? row.total / best : 0 }))
      .sort((a, b) => b.total - a.total),
  };
}

/**
 * Levels gained per player over a window (default 24h), overall and per skill.
 *
 * Only snapshots carrying a level vector (`l`) count — earlier ones predate
 * level tracking, and treating their absence as "level 0" would report a wildly
 * inflated gain the first time this runs.
 */
export function computeLevelGains(snapshots, players, windowSeconds = 86400) {
  const levelled = snapshots.filter((snapshot) => snapshot.l && typeof snapshot.l === 'object');
  if (levelled.length < 2) return { hasSpan: false, from: null, bySlug: {} };

  const current = levelled[levelled.length - 1];
  const cutoff = current.t - windowSeconds;
  const atOrBefore = levelled.filter((snapshot) => snapshot.t <= cutoff);
  const baseline = atOrBefore.length > 0 ? atOrBefore[atOrBefore.length - 1] : levelled[0];

  if (baseline.t === current.t) return { hasSpan: false, from: null, bySlug: {} };

  const bySlug = Object.fromEntries(
    players.map((player) => {
      const now = current.l[player.slug];
      const then = baseline.l[player.slug];
      if (!now || !then) return [player.slug, { total: 0, bySkill: {} }];

      const bySkill = {};
      let total = 0;
      for (const skill of TRACKED_SKILLS) {
        const gained = (now[skill.id] ?? 0) - (then[skill.id] ?? 0);
        if (gained > 0) {
          bySkill[skill.id] = gained;
          total += gained;
        }
      }
      return [player.slug, { total, bySkill }];
    }),
  );

  return { hasSpan: true, from: new Date(baseline.t * 1000).toISOString(), bySlug };
}

/**
 * Movement on the competitive ladder over a window (default 24h).
 *
 * A lower rank number is better, so `delta` is positive when the group has
 * climbed. Returns null until history holds two snapshots carrying a rank —
 * older snapshots predate rank tracking and simply have no `r`.
 */
export function computeRankDelta(snapshots, windowSeconds = 86400) {
  const ranked = snapshots.filter((snapshot) => Number.isFinite(snapshot.r));
  if (ranked.length < 2) return null;

  const current = ranked[ranked.length - 1];
  const cutoff = current.t - windowSeconds;
  const atOrBefore = ranked.filter((snapshot) => snapshot.t <= cutoff);
  const baseline = atOrBefore.length > 0 ? atOrBefore[atOrBefore.length - 1] : ranked[0];

  if (baseline.t === current.t) return null;

  return {
    rank: current.r,
    previousRank: baseline.r,
    delta: baseline.r - current.r,
    from: new Date(baseline.t * 1000).toISOString(),
    spanSeconds: current.t - baseline.t,
  };
}

/**
 * Cumulative group XP per snapshot, normalised to 0–1 for the masthead sparkline.
 * Returns null when there is not yet enough history to draw a line.
 */
export function groupTrend(snapshots) {
  if (snapshots.length < 2) return null;

  const points = snapshots.map((snapshot) => ({
    t: snapshot.t,
    xp: Object.values(snapshot.p).reduce((sum, vector) => sum + (vector[0] ?? 0), 0),
  }));

  const min = Math.min(...points.map((point) => point.xp));
  const max = Math.max(...points.map((point) => point.xp));
  const spanX = points[points.length - 1].t - points[0].t || 1;
  const spanY = max - min || 1;

  return points.map((point) => ({
    x: (point.t - points[0].t) / spanX,
    y: (point.xp - min) / spanY,
    xp: point.xp,
    t: point.t,
  }));
}
