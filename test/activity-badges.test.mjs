import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeActivityBadges } from '../assets/js/compute.js';

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const snap = (iso, xp) => ({ t: t(iso), p: { a: [xp] } });
const keysOf = (badges) => badges.map((badge) => badge.key);

describe('computeActivityBadges', () => {
  it('returns nothing before the group has a single tracked day to go on', () => {
    // One snapshot: every one of the last 7 days predates it, so every
    // bucket is null — there's no basis to call the week "sleeping" or
    // anything else.
    const snapshots = [snap('2026-08-30T12:00:00Z', 500)];
    assert.deepEqual(computeActivityBadges(snapshots, 'a'), []);
  });

  it('flags a flat week with zero xp gained as Sleeping', () => {
    const snapshots = [
      snap('2026-08-24T00:00:00Z', 1000),
      snap('2026-08-25T00:00:00Z', 1000),
      snap('2026-08-26T00:00:00Z', 1000),
      snap('2026-08-27T00:00:00Z', 1000),
      snap('2026-08-28T00:00:00Z', 1000),
      snap('2026-08-29T00:00:00Z', 1000),
      snap('2026-08-30T00:00:00Z', 1000),
      snap('2026-08-30T12:00:00Z', 1000), // "now"
    ];
    const badges = computeActivityBadges(snapshots, 'a');
    assert.deepEqual(keysOf(badges), ['sleeping']);
    assert.equal(typeof badges[0].hint, 'string', 'each badge carries an explanation for its hover title');
    assert.match(badges[0].hint, /7 days/);
  });

  it('flags 5 active days out of 7 as Consistent, with no other badge', () => {
    const snapshots = [
      snap('2026-08-24T00:00:00Z', 0),
      snap('2026-08-25T00:00:00Z', 10_000), // +10K on the 24th
      snap('2026-08-26T00:00:00Z', 20_000), // +10K on the 25th
      snap('2026-08-27T00:00:00Z', 30_000), // +10K on the 26th
      snap('2026-08-28T00:00:00Z', 40_000), // +10K on the 27th
      snap('2026-08-29T00:00:00Z', 50_000), // +10K on the 28th
      snap('2026-08-30T00:00:00Z', 50_000), // nothing on the 29th
      snap('2026-08-30T12:00:00Z', 50_000), // nothing today
    ];
    assert.deepEqual(keysOf(computeActivityBadges(snapshots, 'a')), ['consistent']);
  });

  it('flags over 400K xp across just the last 2 days as Hot streak, with no other badge', () => {
    const snapshots = [
      snap('2026-08-24T00:00:00Z', 0),
      snap('2026-08-25T00:00:00Z', 0),
      snap('2026-08-26T00:00:00Z', 0),
      snap('2026-08-27T00:00:00Z', 0),
      snap('2026-08-28T00:00:00Z', 0),
      snap('2026-08-29T00:00:00Z', 0),
      snap('2026-08-30T00:00:00Z', 250_000), // +250K on the 29th
      snap('2026-08-30T12:00:00Z', 450_000), // +200K today — last 2 days: 450K
    ];
    assert.deepEqual(keysOf(computeActivityBadges(snapshots, 'a')), ['hot-streak']);
  });

  it('flags at least 600K xp on any 2 of the last 7 days as Grinder, with no other badge', () => {
    const snapshots = [
      snap('2026-08-24T00:00:00Z', 0),
      snap('2026-08-25T00:00:00Z', 700_000), // +700K on the 24th
      snap('2026-08-26T00:00:00Z', 700_000), // nothing on the 25th
      snap('2026-08-27T00:00:00Z', 1_350_000), // +650K on the 26th
      snap('2026-08-28T00:00:00Z', 1_350_000),
      snap('2026-08-29T00:00:00Z', 1_350_000),
      snap('2026-08-30T00:00:00Z', 1_350_000),
      snap('2026-08-30T12:00:00Z', 1_350_000), // "now" — last 2 days: 0
    ];
    assert.deepEqual(keysOf(computeActivityBadges(snapshots, 'a')), ['grinder']);
  });

  it('allows Consistent and Grinder to apply together', () => {
    const snapshots = [
      snap('2026-08-24T00:00:00Z', 0),
      snap('2026-08-25T00:00:00Z', 610_000), // +610K on each of 5 days
      snap('2026-08-26T00:00:00Z', 1_220_000),
      snap('2026-08-27T00:00:00Z', 1_830_000),
      snap('2026-08-28T00:00:00Z', 2_440_000),
      snap('2026-08-29T00:00:00Z', 3_050_000),
      snap('2026-08-30T00:00:00Z', 3_050_000), // nothing on the 29th
      snap('2026-08-30T12:00:00Z', 3_050_000), // nothing today
    ];
    assert.deepEqual(keysOf(computeActivityBadges(snapshots, 'a')), ['consistent', 'grinder']);
  });

  it('reads the overall xp total (skillId 0), same as computeDailyBreakdown default', () => {
    const snapshots = [
      { t: t('2026-08-24T00:00:00Z'), p: { a: [0, 0] } },
      { t: t('2026-08-30T12:00:00Z'), p: { a: [0, 999_999] } },
    ];
    // Skill 1 gained a fortune, but overall (index 0) gained nothing —
    // Sleeping, not Grinder, confirms the overall total is what's read.
    assert.deepEqual(keysOf(computeActivityBadges(snapshots, 'a')), ['sleeping']);
  });
});
