import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nextRunEstimate } from '../assets/js/compute.js';

describe('nextRunEstimate', () => {
  it('returns null when there is no fetchedAt yet', () => {
    assert.equal(nextRunEstimate(null), null);
  });

  it('points at the next top-of-the-hour from now, not fetchedAt plus an interval', () => {
    // fetchedAt is from way earlier in the hour — the old "fetchedAt + 1h"
    // calculation would land at 09:12, not the real next cron slot.
    const fetchedAt = '2026-09-02T08:12:00.000Z';
    const now = () => new Date('2026-09-02T08:47:00.000Z');

    const next = nextRunEstimate(fetchedAt, { now });
    assert.equal(next.toISOString(), '2026-09-02T09:00:00.000Z');
  });

  it('a fetch that landed exactly on the hour still counts down to the *next* hour, not itself', () => {
    const fetchedAt = '2026-09-02T09:00:00.000Z';
    const now = () => new Date('2026-09-02T09:00:00.000Z');

    const next = nextRunEstimate(fetchedAt, { now });
    assert.equal(next.toISOString(), '2026-09-02T10:00:00.000Z');
  });

  it('rolls over midnight and into the next day correctly', () => {
    const fetchedAt = '2026-09-02T23:50:00.000Z';
    const now = () => new Date('2026-09-02T23:58:00.000Z');

    const next = nextRunEstimate(fetchedAt, { now });
    assert.equal(next.toISOString(), '2026-09-03T00:00:00.000Z');
  });
});
