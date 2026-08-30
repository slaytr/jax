import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeDailyBreakdown } from '../assets/js/compute.js';

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);

describe('computeDailyBreakdown', () => {
  it('splits xp gained into one bucket per UTC calendar day', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-21T00:00:00Z'), p: { a: [150] } }, // +50 on the 20th
      { t: t('2026-08-22T00:00:00Z'), p: { a: [170] } }, // +20 on the 21st
      { t: t('2026-08-22T12:00:00Z'), p: { a: [190] } }, // +20 more on the 22nd, "now"
    ];

    const breakdown = computeDailyBreakdown(snapshots, 'a', 'xp', 3);
    assert.deepEqual(
      breakdown.map((day) => day.gained),
      [50, 20, 20],
      'each day only counts the gain that happened within it',
    );
  });

  it('reports null, not zero, for a day before the group was tracked', () => {
    const snapshots = [
      { t: t('2026-08-21T00:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-22T00:00:00Z'), p: { a: [130] } },
    ];

    // Asking for 3 days reaches back to the 20th, a full day before tracking started.
    const breakdown = computeDailyBreakdown(snapshots, 'a', 'xp', 3);
    assert.equal(breakdown[0].gained, null, "the 20th predates history — it isn't a real zero");
    assert.equal(breakdown[1].gained, 30, 'the 21st is fully covered');
  });

  it('reads total level from l[slug][0] and quest points from q[slug]', () => {
    const snapshots = [
      { t: t('2026-08-23T00:00:00Z'), l: { a: [500, 10] }, q: { a: 5 } },
      { t: t('2026-08-23T12:00:00Z'), l: { a: [510, 11] }, q: { a: 6 } },
      { t: t('2026-08-24T06:00:00Z'), l: { a: [520, 12] }, q: { a: 8 } }, // "now"
    ];

    const levels = computeDailyBreakdown(snapshots, 'a', 'level', 2);
    assert.deepEqual(levels.map((day) => day.gained), [10, 10], 'the 23rd carries its own midday gain, the 24th its own');

    const quests = computeDailyBreakdown(snapshots, 'a', 'quests', 2);
    assert.deepEqual(quests.map((day) => day.gained), [1, 2]);
  });

  it('reads a specific skill slot when skillId is given, not just Overall', () => {
    const snapshots = [
      { t: t('2026-08-23T00:00:00Z'), l: { a: [500, 10] }, p: { a: [50000, 1000] } },
      { t: t('2026-08-23T12:00:00Z'), l: { a: [510, 11] }, p: { a: [51000, 1400] } },
      { t: t('2026-08-24T06:00:00Z'), l: { a: [520, 12] }, p: { a: [52000, 1900] } }, // "now"
    ];

    const totalLevels = computeDailyBreakdown(snapshots, 'a', 'level', 2);
    const skillLevels = computeDailyBreakdown(snapshots, 'a', 'level', 2, 1);
    assert.deepEqual(totalLevels.map((day) => day.gained), [10, 10], 'default skillId (0) is unchanged — Overall');
    assert.deepEqual(skillLevels.map((day) => day.gained), [1, 1], 'skillId 1 reads that skill\'s own level slot instead');

    const skillXp = computeDailyBreakdown(snapshots, 'a', 'xp', 2, 1);
    assert.deepEqual(skillXp.map((day) => day.gained), [400, 500]);
  });

  it('ignores skillId for quest points — there is no per-skill breakdown to read', () => {
    const snapshots = [
      { t: t('2026-08-23T00:00:00Z'), q: { a: 5 } },
      { t: t('2026-08-24T06:00:00Z'), q: { a: 8 } }, // "now"
    ];

    const withSkillId = computeDailyBreakdown(snapshots, 'a', 'quests', 1, 3);
    const withoutSkillId = computeDailyBreakdown(snapshots, 'a', 'quests', 1);
    assert.deepEqual(withSkillId, withoutSkillId);
  });

  it('caps the final day at "now" instead of assuming it ran a full 24h', () => {
    const snapshots = [
      { t: t('2026-08-23T00:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-24T06:00:00Z'), p: { a: [130] } }, // "now" — only 6h into the 24th
    ];

    const breakdown = computeDailyBreakdown(snapshots, 'a', 'xp', 2);
    assert.equal(breakdown[1].gained, 30, "today's figure stops at the latest snapshot, not a full day");
  });

  it('returns an empty array when there is no history at all', () => {
    assert.deepEqual(computeDailyBreakdown([], 'a', 'xp', 7), []);
  });
});
