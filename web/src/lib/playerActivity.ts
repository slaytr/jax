import { CALENDAR_DAY, computeGains } from '@shared/compute.js';

import { dayOffsetAsOf } from './gains';

/**
 * What each player is "doing" right now, for the home page's sprite
 * carousel: their biggest XP skill of the current UTC day, else sleeping
 * (nothing gained today), else on vacation (nothing gained today *or*
 * yesterday — two quiet days running).
 */
export type PlayerActivity =
  | { slug: string; kind: 'skill'; skillId: number; xp: number }
  | { slug: string; kind: 'sleeping' | 'vacation' };

// compute.js is untyped JS whose inferred signature has no room for `asOf`
// (same friction gains.ts documents) — one wrapper here keeps the calls below plain.
const dailyXp = (snapshots: any[], players: any[], asOf: number | null) =>
  (computeGains as any)(snapshots, players, CALENDAR_DAY, asOf == null ? {} : { asOf });

export function playerActivities(snapshots: any[], players: any[]): PlayerActivity[] {
  const today = dailyXp(snapshots, players, null);
  const yesterdayAsOf = dayOffsetAsOf(snapshots, 1);
  // Vacation needs evidence of a quiet yesterday — without history reaching
  // back that far, "no gain" just means "unknown", so stay on sleeping.
  const yesterday = yesterdayAsOf == null ? null : dailyXp(snapshots, players, yesterdayAsOf);

  return players.map((player): PlayerActivity => {
    const todayRow = today.rows.find((row: any) => row.player.slug === player.slug);
    const top = todayRow?.bySkill[0];
    if (top) return { slug: player.slug, kind: 'skill', skillId: top.skill.id, xp: top.gained };

    const yesterdayRow = yesterday?.rows.find((row: any) => row.player.slug === player.slug);
    const quietYesterday = Boolean(yesterday?.hasSpan) && (yesterdayRow?.total ?? 0) === 0;
    return { slug: player.slug, kind: quietYesterday ? 'vacation' : 'sleeping' };
  });
}
