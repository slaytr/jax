import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fetchAllLatestActivity, latestActivityFrom, parseActivityDate } from '../scripts/activity.mjs';
import { mergePlayers } from '../scripts/snapshots.mjs';

describe('parseActivityDate', () => {
  it('parses RuneMetrics\' "DD-Mon-YYYY HH:mm" format as UTC', () => {
    assert.equal(parseActivityDate('02-Sep-2026 10:36'), '2026-09-02T10:36:00.000Z');
  });

  it('handles every month abbreviation', () => {
    assert.equal(parseActivityDate('01-Jan-2026 00:00'), '2026-01-01T00:00:00.000Z');
    assert.equal(parseActivityDate('31-Dec-2026 23:59'), '2026-12-31T23:59:00.000Z');
  });

  it('returns null for an unrecognised format instead of throwing', () => {
    assert.equal(parseActivityDate('not a date'), null);
    assert.equal(parseActivityDate(undefined), null);
    assert.equal(parseActivityDate(''), null);
  });
});

describe('latestActivityFrom', () => {
  it('picks the first (most recent) entry from the activities list', () => {
    const result = latestActivityFrom({
      activities: [
        { date: '02-Sep-2026 10:36', text: 'Levelled up Mining.', details: 'I levelled my Mining skill, I am now level 76.' },
        { date: '01-Sep-2026 06:47', text: 'Levelled up Slayer.', details: 'I levelled my Slayer skill, I am now level 73.' },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.text, 'Levelled up Mining.');
    assert.equal(result.date, '2026-09-02T10:36:00.000Z');
  });

  it('reports ok with nulls when a real (empty) profile has no activity yet', () => {
    const result = latestActivityFrom({ activities: [] });
    assert.equal(result.ok, true);
    assert.equal(result.text, null);
    assert.equal(result.date, null);
  });

  it('reports a private profile as a reason, not a crash', () => {
    const result = latestActivityFrom({ error: 'PROFILE_PRIVATE' });
    assert.equal(result.ok, false);
    assert.match(result.error, /PROFILE_PRIVATE/);
  });

  it('rejects a payload with no activities list', () => {
    assert.equal(latestActivityFrom({}).ok, false);
    assert.equal(latestActivityFrom(null).ok, false);
  });
});

describe('fetchAllLatestActivity', () => {
  it('is exported for scripts/update.mjs to wire in alongside fetchAllQuestPoints', () => {
    assert.equal(typeof fetchAllLatestActivity, 'function');
  });
});

describe('mergePlayers with latest activity', () => {
  const roster = [{ slug: 'a', name: 'A', table: 'main' }];
  const hiscoreOk = {
    ok: true,
    slug: 'a',
    name: 'A',
    table: 'main',
    skills: [{ id: 0, level: 10, xp: 500, rank: 1 }],
    activities: [],
  };

  it('attaches the latest activity when the lookup succeeded', () => {
    const [player] = mergePlayers(roster, [hiscoreOk], [], {}, {
      a: { ok: true, text: 'Levelled up Mining.', details: 'I levelled my Mining skill.', date: '2026-09-02T10:36:00.000Z' },
    });

    assert.deepEqual(player.latestActivity, {
      text: 'Levelled up Mining.',
      details: 'I levelled my Mining skill.',
      date: '2026-09-02T10:36:00.000Z',
    });
  });

  it('keeps the previous latest activity when the profile turns private', () => {
    const previous = [{ slug: 'a', name: 'A', latestActivity: { text: 'Quest complete: Lost City', details: null, date: '2026-08-01T00:00:00.000Z' } }];
    const [player] = mergePlayers(roster, [hiscoreOk], previous, {}, { a: { ok: false, error: 'RuneMetrics: PROFILE_PRIVATE' } });

    assert.deepEqual(player.latestActivity, { text: 'Quest complete: Lost City', details: null, date: '2026-08-01T00:00:00.000Z' });
  });

  it('reports null when there is nothing to carry forward', () => {
    const [player] = mergePlayers(roster, [hiscoreOk], [], {}, { a: { ok: false, error: 'boom' } });
    assert.equal(player.latestActivity, null);
  });
});
