import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nextScheduledRun } from '../assets/js/compute.js';
import { UPDATE_SCHEDULE } from '../assets/js/config.js';

const at = (iso) => new Date(iso);
const iso = (date) => date.toISOString();

describe('nextScheduledRun', () => {
  it('finds the top of the next hour', () => {
    assert.equal(iso(nextScheduledRun(at('2026-08-23T03:35:00Z'))), '2026-08-23T04:00:00.000Z');
    assert.equal(iso(nextScheduledRun(at('2026-08-23T04:01:00Z'))), '2026-08-23T05:00:00.000Z');
  });

  it('rolls over midnight into the next day', () => {
    assert.equal(iso(nextScheduledRun(at('2026-08-23T23:30:00Z'))), '2026-08-24T00:00:00.000Z');
    assert.equal(iso(nextScheduledRun(at('2026-08-23T23:59:59Z'))), '2026-08-24T00:00:00.000Z');
  });

  it('rolls over a month boundary', () => {
    assert.equal(iso(nextScheduledRun(at('2026-08-31T23:30:00Z'))), '2026-09-01T00:00:00.000Z');
  });

  it('rolls over a year boundary', () => {
    assert.equal(iso(nextScheduledRun(at('2026-12-31T23:30:00Z'))), '2027-01-01T00:00:00.000Z');
  });

  it('handles a leap day', () => {
    assert.equal(iso(nextScheduledRun(at('2028-02-28T23:30:00Z'))), '2028-02-29T00:00:00.000Z');
  });

  it('is always strictly in the future, even exactly on a slot', () => {
    // Landing exactly on 04:00:00 must advance, not return the same instant.
    const onTheSlot = at('2026-08-23T04:00:00Z');
    assert.equal(iso(nextScheduledRun(onTheSlot)), '2026-08-23T05:00:00.000Z');
  });

  it('never returns a time more than the scheduling interval away', () => {
    const gapHours = 24 / UPDATE_SCHEDULE.hours.length;

    // Walk a full day in ten-minute steps; the next run is always within one gap.
    for (let minutes = 0; minutes < 24 * 60; minutes += 10) {
      const from = new Date(Date.UTC(2026, 7, 23, 0, 0) + minutes * 60000);
      const next = nextScheduledRun(from);

      assert.ok(next > from, `expected a future slot from ${iso(from)}`);
      const hoursAway = (next.getTime() - from.getTime()) / 3600000;
      assert.ok(hoursAway <= gapHours, `${hoursAway}h away from ${iso(from)} exceeds the ${gapHours}h interval`);
      assert.equal(next.getUTCMinutes(), UPDATE_SCHEDULE.minute);
      assert.ok(UPDATE_SCHEDULE.hours.includes(next.getUTCHours()));
    }
  });
});
