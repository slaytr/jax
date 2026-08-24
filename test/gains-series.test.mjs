import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeGainsSeries } from '../assets/js/compute.js';

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const players = [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }];

describe('computeGainsSeries', () => {
  it('carries one point per snapshot in the window, not one per day', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-21T00:00:00Z'), p: { a: [150] } },
      { t: t('2026-08-22T00:00:00Z'), p: { a: [170] } },
      { t: t('2026-08-23T00:00:00Z'), p: { a: [200] } },
    ];

    const series = computeGainsSeries(snapshots, [players[0]], 7 * 86400, 'xp');
    assert.equal(series.rows[0].points.length, 4, 'every snapshot in the window becomes a point, not just the endpoints');
    assert.deepEqual(
      series.rows[0].points.map((p) => p.value),
      [100, 150, 170, 200],
    );
  });

  it('normalises x by time and y by value across every player sharing the chart', () => {
    const snapshots = [
      { t: t('2026-08-23T00:00:00Z'), p: { a: [100], b: [0] } },
      { t: t('2026-08-24T00:00:00Z'), p: { a: [200], b: [400] } },
    ];

    const series = computeGainsSeries(snapshots, players, 7 * 86400, 'xp');
    const a = series.rows.find((r) => r.player.slug === 'a');
    const b = series.rows.find((r) => r.player.slug === 'b');

    // Shared y-scale across both players: b's 400 is the chart max (y=1), b's
    // own 0 is the chart min (y=0) — a's values sit between the two.
    assert.equal(b.points[1].y, 1);
    assert.equal(b.points[0].y, 0);
    assert.equal(a.points[0].y, 0.25, "a's 100 sits a quarter of the way up the shared 0–400 scale");
    // Shared x-scale: both start and end at the same two timestamps.
    assert.equal(a.points[0].x, 0);
    assert.equal(a.points[1].x, 1);
  });

  it('skips a snapshot for a player missing that field, without breaking other players', () => {
    const snapshots = [
      { t: t('2026-08-23T00:00:00Z'), p: { a: [100] } }, // b not yet tracked
      { t: t('2026-08-24T00:00:00Z'), p: { a: [150], b: [50] } },
    ];

    const series = computeGainsSeries(snapshots, players, 7 * 86400, 'xp');
    const b = series.rows.find((r) => r.player.slug === 'b');
    assert.equal(b.points.length, 1, 'only the snapshot carrying b counts');
  });

  it('reads total level from l[slug][0] and quest points from q[slug]', () => {
    const snapshots = [
      { t: t('2026-08-23T00:00:00Z'), l: { a: [500, 10] }, q: { a: 5 } },
      { t: t('2026-08-24T00:00:00Z'), l: { a: [520, 12] }, q: { a: 8 } },
    ];

    const level = computeGainsSeries(snapshots, [players[0]], 7 * 86400, 'level');
    assert.deepEqual(level.rows[0].points.map((p) => p.value), [500, 520]);

    const quests = computeGainsSeries(snapshots, [players[0]], 7 * 86400, 'quests');
    assert.deepEqual(quests.rows[0].points.map((p) => p.value), [5, 8]);
  });

  it('places a single-point player by real elapsed time, not centred by fallback', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-21T00:00:00Z'), p: { a: [150] } },
      { t: t('2026-08-23T00:00:00Z'), p: { a: [200], b: [50] } }, // b only appears at the end
    ];

    const series = computeGainsSeries(snapshots, players, 7 * 86400, 'xp');
    const b = series.rows.find((r) => r.player.slug === 'b');
    assert.equal(b.points.length, 1);
    assert.equal(b.points[0].x, 1, "b's lone point lands at the window's actual end, not x=0.5");
  });
});

describe('computeGainsSeries dayMarks', () => {
  it('interpolates a value at every UTC midnight the player has data across', () => {
    const snapshots = [
      { t: t('2026-08-20T10:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-21T14:00:00Z'), p: { a: [150] } },
      { t: t('2026-08-22T02:00:00Z'), p: { a: [170] } },
      { t: t('2026-08-23T08:00:00Z'), p: { a: [200] } },
    ];

    const series = computeGainsSeries(snapshots, [players[0]], 7 * 86400, 'xp');
    const marks = series.rows[0].dayMarks;

    assert.equal(marks.length, 3, 'one mark for each of the 21st, 22nd and 23rd — none before the first snapshot');
    assert.deepEqual(
      marks.map((m) => new Date(m.t * 1000).toISOString()),
      ['2026-08-21T00:00:00.000Z', '2026-08-22T00:00:00.000Z', '2026-08-23T00:00:00.000Z'],
    );
    // Aug 21 00:00 sits halfway (by time) between the 10:00 and 14:00(+1d) readings.
    assert.equal(marks[0].value, 125);
  });

  it('places a day mark exactly on the drawn line, not off to the side', () => {
    const snapshots = [
      { t: t('2026-08-20T10:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-21T14:00:00Z'), p: { a: [150] } },
    ];

    const series = computeGainsSeries(snapshots, [players[0]], 7 * 86400, 'xp');
    const [point0, point1] = series.rows[0].points;
    const [mark] = series.rows[0].dayMarks;

    // The mark's (x, y) must satisfy the same line equation as the segment
    // it falls on — i.e. sit on the straight line between the two points.
    const expectedY = point0.y + (point1.y - point0.y) * ((mark.x - point0.x) / (point1.x - point0.x));
    assert.ok(Math.abs(mark.y - expectedY) < 1e-9);
  });

  it('has no day marks when every snapshot falls on the same UTC day', () => {
    const snapshots = [
      { t: t('2026-08-23T01:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-23T20:00:00Z'), p: { a: [120] } },
    ];

    const series = computeGainsSeries(snapshots, [players[0]], 7 * 86400, 'xp');
    assert.deepEqual(series.rows[0].dayMarks, []);
  });

  it('has no day marks for a player with only one point', () => {
    const snapshots = [
      { t: t('2026-08-20T00:00:00Z'), p: { a: [100] } },
      { t: t('2026-08-23T00:00:00Z'), p: { a: [150], b: [50] } },
    ];

    const series = computeGainsSeries(snapshots, players, 7 * 86400, 'xp');
    const b = series.rows.find((r) => r.player.slug === 'b');
    assert.deepEqual(b.dayMarks, []);
  });
});
