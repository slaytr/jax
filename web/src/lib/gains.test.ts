import { describe, expect, it } from 'vitest';

import { computeAllGains } from './gains';

const t = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const players = [
  { slug: 'a', name: 'A', colour: '#000' },
  { slug: 'b', name: 'B', colour: '#111' },
];

describe('computeAllGains.hot', () => {
  it("names the week leader hot when they're beating their own gain from the week before", () => {
    const snapshots = [
      { t: t('2026-08-10T00:00:00Z'), p: { a: [1100], b: [500] }, q: { a: 10, b: 5 }, l: { a: { 1: 50 }, b: { 1: 40 } } },
      { t: t('2026-08-17T00:00:00Z'), p: { a: [1150], b: [520] }, q: { a: 12, b: 6 }, l: { a: { 1: 52 }, b: { 1: 41 } } },
      // "now" — a gained 150xp this week vs 50 the week before; b gained
      // 80xp this week vs 20 the week before. a leads both weeks, but only
      // a is also outpacing their own previous week.
      { t: t('2026-08-24T00:00:00Z'), p: { a: [1300], b: [600] }, q: { a: 20, b: 9 }, l: { a: { 1: 55 }, b: { 1: 43 } } },
    ];

    const gains = computeAllGains(snapshots, players);
    expect(gains.hot.xp.week).toBe('a');
  });

  it("doesn't name a leader hot when this period is their slower one", () => {
    const snapshots = [
      { t: t('2026-08-10T00:00:00Z'), p: { a: [1000], b: [100] } },
      { t: t('2026-08-17T00:00:00Z'), p: { a: [1200], b: [150] } }, // a gained 200 the week before, b gained 50
      { t: t('2026-08-24T00:00:00Z'), p: { a: [1250], b: [170] } }, // a only gains 50 this week (still leads b's 20), b gains 20
    ];

    const gains = computeAllGains(snapshots, players);
    // a still leads this week (50 vs b's 20) but that's slower than a's own
    // 200 the week before, so no ribbon — not just "was there a leader".
    expect(gains.hot.xp.week).toBeNull();
  });

  it('is null with no previous-period history to compare against', () => {
    const snapshots = [{ t: t('2026-08-24T00:00:00Z'), p: { a: [1000], b: [500] } }];

    const gains = computeAllGains(snapshots, players);
    expect(gains.hot.xp.week).toBeNull();
  });
});
