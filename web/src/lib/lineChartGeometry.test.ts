import { describe, expect, it } from 'vitest';

import { declutterLabels, HEIGHT, PAD_Y, yAxisTicks } from './lineChartGeometry';

describe('yAxisTicks', () => {
  it('returns a single tick at the value when min equals max (a flat line)', () => {
    const ticks = yAxisTicks(100, 100);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].value).toBe(100);
  });

  it('picks round-number ticks within the actual min/max span, not forced to 0', () => {
    const ticks = yAxisTicks(1_234_000, 1_260_000);
    expect(ticks.every((tick) => tick.value >= 1_234_000 && tick.value <= 1_260_000)).toBe(true);
    expect(ticks.length).toBeGreaterThan(0);
  });
});

describe('declutterLabels', () => {
  it('leaves already-spaced labels untouched', () => {
    const entries = [{ y: 20 }, { y: 60 }];
    const result = declutterLabels(entries);
    expect(result.map((e) => e.y)).toEqual([20, 60]);
  });

  it('pushes apart labels that would otherwise overlap, preserving order', () => {
    const entries = [{ y: 50 }, { y: 50.5 }, { y: 51 }];
    const result = declutterLabels(entries);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].y - result[i - 1].y).toBeGreaterThanOrEqual(9 - 1e-9);
    }
  });

  it('keeps every label within the chart bounds even under a dense cluster', () => {
    const entries = Array.from({ length: 6 }, () => ({ y: HEIGHT / 2 }));
    const result = declutterLabels(entries);
    for (const entry of result) {
      expect(entry.y).toBeGreaterThanOrEqual(PAD_Y - 1e-9);
      expect(entry.y).toBeLessThanOrEqual(HEIGHT - PAD_Y + 1e-9);
    }
  });
});
