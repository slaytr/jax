import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CALENDAR_DAY, CALENDAR_WEEK, CALENDAR_MONTH, computeGains, computeQuestGains, computeLevelGains } from '../assets/js/compute.js';

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const players = [{ slug: 'a', name: 'A' }];

describe('computeGains with CALENDAR_DAY', () => {
  // Player gains 20xp before midnight, then 10xp after it.
  const snapshots = [
    { t: t('2026-08-23T10:00:00Z'), p: { a: [100] } },
    { t: t('2026-08-24T00:00:00Z'), p: { a: [120] } }, // exactly on the boundary — belongs to the new day
    { t: t('2026-08-24T02:00:00Z'), p: { a: [130] } }, // "now"
  ];

  it('resets at UTC midnight instead of rolling a 24h window', () => {
    const day = computeGains(snapshots, players, CALENDAR_DAY);
    assert.equal(day.rows[0].total, 10, 'only the post-midnight 10xp counts, not the 23-08 gain too');
    assert.equal(day.hasSpan, true);
    assert.equal(day.coversWindow, true, 'history reaches back to (exactly) the day boundary');

    // Same data, rolling 24h window: 05:00 the previous day is out of reach,
    // so the baseline falls back to the very first snapshot instead.
    const rolling = computeGains(snapshots, players, 86400);
    assert.equal(rolling.rows[0].total, 30, 'rolling window instead spans back into the previous day');
  });

  it('treats a snapshot taken exactly at 00:00:00 as the new day, not the old one', () => {
    const midnightOnly = [
      { t: t('2026-08-23T10:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-24T00:00:00Z'), p: { a: [120] } },
    ];
    const day = computeGains(midnightOnly, players, CALENDAR_DAY);
    // "current" is also the midnight snapshot here, so there is no later
    // reading yet — the day hasn't produced a span to report.
    assert.equal(day.hasSpan, false);
  });
});

describe('computeGains with CALENDAR_WEEK', () => {
  it('resets Monday 00:00 UTC (ISO week), not a rolling 7 days', () => {
    // 2026-08-24 is a Monday.
    const snapshots = [
      { t: t('2026-08-20T10:00:00Z'), p: { a: [100] } }, // Thursday, previous week
      { t: t('2026-08-24T00:00:00Z'), p: { a: [150] } }, // exactly on the boundary — this week
      { t: t('2026-08-25T05:00:00Z'), p: { a: [170] } }, // "now", Tuesday this week
    ];

    const week = computeGains(snapshots, players, CALENDAR_WEEK);
    assert.equal(week.rows[0].total, 20, "only this week's gain counts, not last Thursday's too");

    const rolling = computeGains(snapshots, players, 7 * 86400);
    assert.equal(rolling.rows[0].total, 70, 'a rolling 7 days instead reaches back into last week');
  });
});

describe('computeGains with CALENDAR_MONTH', () => {
  it('resets on the 1st of the UTC month, not a rolling 30 days', () => {
    const snapshots = [
      { t: t('2026-07-31T10:00:00Z'), p: { a: [1000] } }, // last day of July
      { t: t('2026-08-01T00:00:00Z'), p: { a: [1050] } }, // exactly on the boundary — August
      { t: t('2026-08-15T00:00:00Z'), p: { a: [1200] } }, // "now"
    ];

    const month = computeGains(snapshots, players, CALENDAR_MONTH);
    assert.equal(month.rows[0].total, 150, "only August's gain counts, not July 31st's too");
  });
});

describe('computeQuestGains with CALENDAR_DAY', () => {
  it('resets at UTC midnight', () => {
    const snapshots = [
      { t: t('2026-08-23T10:00:00Z'), q: { a: 50 } },
      { t: t('2026-08-24T00:00:00Z'), q: { a: 52 } },
      { t: t('2026-08-24T06:00:00Z'), q: { a: 55 } },
    ];

    const day = computeQuestGains(snapshots, players, CALENDAR_DAY);
    assert.equal(day.rows[0].gained, 3, 'only the post-midnight 3 quest points count');
  });
});

describe('computeLevelGains with CALENDAR_DAY', () => {
  it('resets at UTC midnight', () => {
    const snapshots = [
      { t: t('2026-08-23T10:00:00Z'), l: { a: { 1: 50 } } },
      { t: t('2026-08-24T00:00:00Z'), l: { a: { 1: 52 } } },
      { t: t('2026-08-24T06:00:00Z'), l: { a: { 1: 53 } } },
    ];

    const day = computeLevelGains(snapshots, players, CALENDAR_DAY);
    assert.equal(day.rows[0].total, 1, 'only the post-midnight level counts, not the earlier gain too');
  });
});
