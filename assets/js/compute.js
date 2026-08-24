/**
 * Derived standings. Every function is pure and returns fresh objects — nothing
 * here mutates the loaded snapshot.
 */

import { SKILLS, TRACKED_SKILLS, UPDATE_SCHEDULE } from './config.js';

/**
 * When the next update is due, estimated as one schedule interval after the
 * last successful fetch rather than the cron's wall-clock slot — so a late
 * or skipped run pushes the countdown out instead of it snapping back to 0.
 */
export function nextRunEstimate(fetchedAt) {
  if (!fetchedAt) return null;
  const intervalMs = (24 * 60 * 60 * 1000) / UPDATE_SCHEDULE.hours.length;
  return new Date(new Date(fetchedAt).getTime() + intervalMs);
}

const EMPTY_SKILL = Object.freeze({ level: 1, xp: 0, rank: null });

const skillFor = (player, skillId) => player.skillById?.[skillId] ?? EMPTY_SKILL;

/**
 * Higher is better for level and xp; for rank, lower is better and null is
 * worst. `invert` flips the comparison (and rank's null handling) so the
 * matrix can highlight the row's weakest account instead of its strongest.
 */
function isBetter(metric, candidate, incumbent, invert = false) {
  if (incumbent === null) return true;
  if (metric === 'rank') {
    if (candidate.rank === null) return !invert;
    if (incumbent.rank === null) return invert;
    return invert ? candidate.rank > incumbent.rank : candidate.rank < incumbent.rank;
  }
  if (candidate[metric] !== incumbent[metric]) {
    return invert ? candidate[metric] < incumbent[metric] : candidate[metric] > incumbent[metric];
  }
  return invert ? candidate.xp < incumbent.xp : candidate.xp > incumbent.xp;
}

/**
 * One row per skill, one cell per player, with the row leader marked.
 * `share` scales the in-cell progress rule: level against the skill cap, xp and
 * rank against the best value in the row so the row is self-normalising.
 *
 * @param invert Highlight the row's weakest account instead of its strongest —
 *   the skill matrix's "lowest level" toggle.
 */
export function buildMatrix(players, metric, invert = false) {
  return TRACKED_SKILLS.map((skill) => {
    const entries = players.map((player) => ({ player, value: skillFor(player, skill.id) }));

    const best = entries.reduce(
      (leader, entry) => (isBetter(metric, entry.value, leader?.value ?? null, invert) ? entry : leader),
      null,
    );

    const maxXp = Math.max(...entries.map((entry) => entry.value.xp), 1);
    // A row nobody has trained has no meaningful leader in either direction —
    // don't crown the first player just because they're tied with everyone
    // else at the untrained floor.
    const anyTrained = entries.some((entry) => entry.value.xp > 0);

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
        isLeader: player.slug === best.player.slug && anyTrained,
      };
    });

    return { skill, cells, groupXp: entries.reduce((sum, entry) => sum + entry.value.xp, 0) };
  });
}

/** Pseudo-skill descriptor so the totals row reuses the matrix row chrome
 * (star, gain chip, tooltip) exactly like a real skill. `max` mirrors the
 * feed's own "Overall" entry (SKILLS[0]) rather than duplicating the figure. */
export const TOTAL_MEASURE = Object.freeze({ id: 'total', name: 'Total level', max: SKILLS[0].max, slug: 'total-level' });

/**
 * Total level as a matrix row, using the same leader logic as buildMatrix so
 * the totals row can be folded into leaderCounts alongside the per-skill rows
 * — a player's best-in-group total counts toward their star count too.
 */
export function buildTotalsRow(players, invert = false) {
  const entries = players.map((player) => ({
    player,
    level: player.total?.level ?? 0,
    xp: player.total?.xp ?? 0,
    rank: player.total?.rank ?? null,
  }));

  const best = entries.reduce((leader, entry) => (isBetter('level', entry, leader, invert) ? entry : leader), null);
  const maxLevel = Math.max(...entries.map((entry) => entry.level), 1);
  // As with a skill row, an all-zero board (every fetch failed) has no
  // meaningful leader.
  const anyLeveled = entries.some((entry) => entry.level > 0);

  return {
    skill: TOTAL_MEASURE,
    cells: entries.map((entry) => ({
      player: entry.player,
      level: entry.level,
      xp: entry.xp,
      rank: entry.rank,
      share: Math.min(1, entry.level / maxLevel),
      isLeader: entry.player.slug === best.player.slug && anyLeveled,
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

/**
 * Current quest points, ranked highest first — the static counterpart to
 * `standings`. Quest points live outside `total` (a separate feed, RuneMetrics
 * rather than the hiscores), so they need their own ranking rather than
 * reusing it.
 */
export function questStandings(players) {
  const ordered = [...players].sort((a, b) => (b.questPoints ?? 0) - (a.questPoints ?? 0));
  const leader = ordered[0]?.questPoints ?? 0;

  return ordered.map((player, index) => ({
    player,
    place: index + 1,
    behind: leader - (player.questPoints ?? 0),
    share: leader > 0 && Number.isFinite(player.questPoints) ? player.questPoints / leader : 0,
  }));
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
  const valueOf = (player) => (metric === 'level' ? (player.total?.level ?? 0) : (player.total?.xp ?? 0));

  const ordered = [...players].sort(
    (a, b) => valueOf(b) - valueOf(a) || (b.total?.xp ?? 0) - (a.total?.xp ?? 0),
  );

  const leader = valueOf(ordered[0]);
  return ordered.map((player, index) => ({
    player,
    place: index + 1,
    behind: leader - valueOf(player),
    share: leader > 0 ? valueOf(player) / leader : 0,
  }));
}

const latestSnapshot = (snapshots) => snapshots[snapshots.length - 1] ?? null;

/**
 * Sentinel for the Gains "day" period: anchors the cutoff to the start of
 * the current UTC day instead of `latest - 24h`, so the figure resets to
 * zero at midnight rather than decaying on a rolling window. Week/month
 * periods stay rolling (7 * 86400 / 30 * 86400 seconds) — unlike a day, "this
 * week" or "this month" resetting to near-zero right after its calendar
 * boundary reads as broken rather than as a fresh start.
 */
export const CALENDAR_DAY = Symbol('calendar-day');

const utcDayStart = (unixSeconds) => {
  const date = new Date(unixSeconds * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
};

/**
 * The baseline cutoff for a window, anchored to the latest snapshot's own
 * clock (not the caller's) so this stays a pure function of the data. A
 * non-finite window (no window at all) resolves to -Infinity, which no
 * snapshot is ever at-or-before, so `snapshotAtOrBefore` falls through to
 * the very first snapshot — "all of history".
 */
function resolveCutoff(latestSeconds, window) {
  if (window === CALENDAR_DAY) return utcDayStart(latestSeconds);
  return Number.isFinite(window) ? latestSeconds - window : -Infinity;
}

/** The newest snapshot at or before `cutoff`, so the delta spans at least the
 * requested window; falls back to the oldest snapshot when history doesn't
 * reach back that far. */
function snapshotAtOrBefore(snapshots, cutoff) {
  const atOrBefore = snapshots.filter((snapshot) => snapshot.t <= cutoff);
  return atOrBefore.length > 0 ? atOrBefore[atOrBefore.length - 1] : snapshots[0];
}

/**
 * XP gained per player over a window. Index 0 of a snapshot vector is Overall,
 * so it is the total; indices 1+ are the individual skills.
 *
 * @param window seconds (a rolling span) or CALENDAR_DAY (aligned to the
 *   start of the current UTC day)
 */
export function computeGains(snapshots, players, window) {
  const current = latestSnapshot(snapshots);
  const cutoff = current ? resolveCutoff(current.t, window) : null;
  const baseline = current ? snapshotAtOrBefore(snapshots, cutoff) : null;

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
    // False when history doesn't reach back to the cutoff, so the figures
    // actually cover less time than the heading claims.
    coversWindow: hasSpan && baseline.t <= cutoff,
    from: baseline ? new Date(baseline.t * 1000).toISOString() : null,
    to: current ? new Date(current.t * 1000).toISOString() : null,
    rows: rows
      .map((row) => ({ ...row, share: best > 0 ? row.total / best : 0 }))
      .sort((a, b) => b.total - a.total),
  };
}

/**
 * Quest points gained per player over a window. Mirrors computeGains, but
 * quest points are a single scalar per snapshot (`q`) rather than a per-skill
 * vector, so there is no skill breakdown to build.
 *
 * Snapshots older than the `q` field predate quest-point tracking, so only
 * snapshots carrying it count — same reasoning as computeLevelGains and `l`.
 */
export function computeQuestGains(snapshots, players, window) {
  const withQuests = snapshots.filter((snapshot) => snapshot.q && typeof snapshot.q === 'object');
  const current = latestSnapshot(withQuests);
  const cutoff = current ? resolveCutoff(current.t, window) : null;
  const baseline = current ? snapshotAtOrBefore(withQuests, cutoff) : null;

  const hasSpan = Boolean(current && baseline && current.t > baseline.t);
  const spanSeconds = hasSpan ? current.t - baseline.t : 0;

  const rows = players.map((player) => {
    const now = current?.q?.[player.slug];
    const then = baseline?.q?.[player.slug];
    const gained = hasSpan && Number.isFinite(now) && Number.isFinite(then) ? Math.max(0, now - then) : 0;
    return { player, gained };
  });

  const best = Math.max(...rows.map((row) => row.gained), 0);

  return {
    hasSpan,
    spanSeconds,
    coversWindow: hasSpan && baseline.t <= cutoff,
    rows: rows
      .map((row) => ({ ...row, share: best > 0 ? row.gained / best : 0 }))
      .sort((a, b) => b.gained - a.gained),
  };
}

/**
 * Levels gained per player over a window (default a rolling 24h), overall
 * and per skill.
 *
 * Only snapshots carrying a level vector (`l`) count — earlier ones predate
 * level tracking, and treating their absence as "level 0" would report a wildly
 * inflated gain the first time this runs.
 *
 * Returns both shapes callers need: `bySlug` for an O(1) per-skill lookup
 * (the matrix cell's "+N today" chip) and `rows` — ranked, with `bySkill` as
 * an array like computeGains — for a leaderboard band.
 */
export function computeLevelGains(snapshots, players, window = 86400) {
  const levelled = snapshots.filter((snapshot) => snapshot.l && typeof snapshot.l === 'object');
  const empty = () => ({
    hasSpan: false,
    spanSeconds: 0,
    coversWindow: false,
    from: null,
    bySlug: {},
    rows: players.map((player) => ({ player, total: 0, bySkill: [], share: 0 })),
  });

  if (levelled.length < 2) return empty();

  const current = levelled[levelled.length - 1];
  const cutoff = resolveCutoff(current.t, window);
  const baseline = snapshotAtOrBefore(levelled, cutoff);

  if (baseline.t === current.t) return empty();

  const perPlayer = players.map((player) => {
    const now = current.l[player.slug];
    const then = baseline.l[player.slug];

    const bySkill = {};
    let total = 0;
    if (now && then) {
      for (const skill of TRACKED_SKILLS) {
        const gained = (now[skill.id] ?? 0) - (then[skill.id] ?? 0);
        if (gained > 0) {
          bySkill[skill.id] = gained;
          total += gained;
        }
      }
    }

    return { player, total, bySkill };
  });

  const best = Math.max(...perPlayer.map((entry) => entry.total), 0);
  const spanSeconds = current.t - baseline.t;

  return {
    hasSpan: true,
    spanSeconds,
    coversWindow: baseline.t <= cutoff,
    from: new Date(baseline.t * 1000).toISOString(),
    bySlug: Object.fromEntries(perPlayer.map(({ player, total, bySkill }) => [player.slug, { total, bySkill }])),
    rows: perPlayer
      .map(({ player, total, bySkill }) => ({
        player,
        total,
        bySkill: TRACKED_SKILLS.filter((skill) => bySkill[skill.id])
          .map((skill) => ({ skill, gained: bySkill[skill.id] }))
          .sort((a, b) => b.gained - a.gained),
        share: best > 0 ? total / best : 0,
      }))
      .sort((a, b) => b.total - a.total),
  };
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
