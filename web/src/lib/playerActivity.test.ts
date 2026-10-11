import { describe, expect, it } from 'vitest';

import { playerActivities } from './playerActivity';

const t = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const players = [
  { slug: 'a', name: 'A' },
  { slug: 'b', name: 'B' },
  { slug: 'c', name: 'C' },
];

// Skill ids: 1 Attack, 11 Firemaking, 15 Mining — only the indices matter.
const row = (total: number, extra: Record<number, number> = {}) => {
  const values: number[] = [];
  values[0] = total;
  for (const [id, xp] of Object.entries(extra)) values[Number(id)] = xp;
  return values;
};

describe('playerActivities', () => {
  it("uses each player's biggest XP skill today, sleeps on a quiet day, and vacations after two", () => {
    const snapshots = [
      { t: t('2026-09-27T12:00:00Z'), p: { a: row(1000, { 1: 500, 11: 500 }), b: row(1000, { 1: 500, 11: 500 }), c: row(1000, { 1: 500, 11: 500 }) } },
      // Yesterday: only a moves.
      { t: t('2026-09-28T12:00:00Z'), p: { a: row(1100, { 1: 520, 11: 580 }), b: row(1000, { 1: 500, 11: 500 }), c: row(1000, { 1: 500, 11: 500 }) } },
      // Today: a mines-ish (skill 15 jumps most), b moves, c stays put.
      { t: t('2026-09-29T12:00:00Z'), p: { a: row(1500, { 1: 520, 11: 580, 15: 400 }), b: row(1050, { 1: 500, 11: 550 }), c: row(1000, { 1: 500, 11: 500 }) } },
    ];

    const result = playerActivities(snapshots, players);
    const by = Object.fromEntries(result.map((entry) => [entry.slug, entry]));

    expect(by.a).toMatchObject({ kind: 'skill', skillId: 15, xp: 400 });
    expect(by.b).toMatchObject({ kind: 'skill', skillId: 11, xp: 50 });
    // c: no gain today, none yesterday either -> vacation.
    expect(by.c.kind).toBe('vacation');
  });

  it('sleeps (not vacation) when quiet today but active yesterday', () => {
    const snapshots = [
      { t: t('2026-09-27T12:00:00Z'), p: { a: row(1000, { 1: 1000 }) } },
      { t: t('2026-09-28T12:00:00Z'), p: { a: row(1100, { 1: 1100 }) } },
      { t: t('2026-09-29T12:00:00Z'), p: { a: row(1100, { 1: 1100 }) } },
    ];
    const [entry] = playerActivities(snapshots, [players[0]]);
    expect(entry.kind).toBe('sleeping');
  });

  it('returns sleeping for everyone when there are no snapshots', () => {
    const result = playerActivities([], players);
    expect(result.map((entry) => entry.kind)).toEqual(['sleeping', 'sleeping', 'sleeping']);
  });
});
