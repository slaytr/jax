import { describe, expect, it } from 'vitest';

import { axisMaxFor, barAxisTicks, barHeight, niceStep, PLOT_HEIGHT } from './barChartGeometry';

describe('niceStep', () => {
  it('returns 1 for a non-positive max', () => {
    expect(niceStep(0, 4)).toBe(1);
    expect(niceStep(-5, 4)).toBe(1);
  });

  it('picks a round step near maxValue / tickCount', () => {
    expect(niceStep(400, 4)).toBe(100);
    expect(niceStep(1_000_000, 4)).toBe(500_000);
  });
});

describe('axisMaxFor', () => {
  it('rounds up to the next multiple of step', () => {
    expect(axisMaxFor(340, 100)).toBe(400);
  });

  it('never returns less than one step, even for a tiny rawMax', () => {
    expect(axisMaxFor(1, 100)).toBe(100);
  });
});

describe('barAxisTicks', () => {
  it('produces one tick per step from 0 through axisMax inclusive', () => {
    const ticks = barAxisTicks(400, 100);
    expect(ticks.map((t) => t.value)).toEqual([0, 100, 200, 300, 400]);
  });

  it('the 0 tick sits on the baseline and the max tick sits at the plot top', () => {
    const ticks = barAxisTicks(400, 100);
    const baseline = ticks[0].y;
    const top = ticks[ticks.length - 1].y;
    expect(baseline - top).toBeCloseTo(PLOT_HEIGHT, 5);
  });
});

describe('barHeight', () => {
  it('scales proportionally to axisMax', () => {
    expect(barHeight(200, 400)).toBeCloseTo(PLOT_HEIGHT / 2, 5);
  });

  it('floors at 1.5px so a tiny real gain still reads as a sliver', () => {
    expect(barHeight(1, 1_000_000)).toBe(1.5);
  });
});
