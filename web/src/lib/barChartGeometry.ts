/**
 * Pure layout math for the player page's day-by-day bar charts (Gains
 * section) — ported directly from player-gains.js, split out so it's
 * independently testable, same reasoning as lineChartGeometry.ts.
 */

export const WIDTH = 300;
export const HEIGHT = 110;
export const PAD_X = 3;
export const PAD_LEFT_AXIS = 28; // room for y-axis tick labels — the active chart only
export const PAD_TOP = 6;
export const PAD_BOTTOM = 16; // room for the week view's weekday labels
export const BAR_GAP = 2; // the surface gap between bars
export const MAX_BAR_WIDTH = 24; // a lone bar (or a short month) never balloons
export const CLUSTER_GAP = 0.6; // thinner gap between two players' bars within one day's cluster
export const AXIS_TICKS = 4;

export const BASELINE = HEIGHT - PAD_BOTTOM;
export const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;

/** A "nice" gridline step (1/2/5/10 × a power of ten) for a given max value —
 * the standard trick so axis labels read as round numbers (0, 50K, 100K…)
 * instead of whatever fraction the data's actual peak happens to land on. */
export function niceStep(maxValue: number, tickCount: number): number {
  if (maxValue <= 0) return 1;
  const rawStep = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return niceResidual * magnitude;
}

/** The rounded axis max a niceStep-based axis actually tops out at — bars
 * scale against this, not the data's own raw peak, so the tallest bar
 * doesn't necessarily touch the top gridline. */
export function axisMaxFor(rawMax: number, step: number): number {
  return Math.max(Math.ceil(rawMax / step) * step, step);
}

export interface AxisTick {
  value: number;
  y: number;
}

/** Recessive horizontal gridlines plus tick labels at each niceStep, shared
 * by the day-by-day chart and the player-comparison chart. */
export function barAxisTicks(axisMax: number, step: number): AxisTick[] {
  const ticks: AxisTick[] = [];
  for (let value = 0; value <= axisMax + step * 0.001; value += step) {
    ticks.push({ value, y: BASELINE - (value / axisMax) * PLOT_HEIGHT });
  }
  return ticks;
}

/** A bar's pixel height for a given gained value against the chart's axis
 * max — floored at 1.5px so a real (if tiny) gain still reads as a sliver,
 * not nothing. */
export function barHeight(gained: number, axisMax: number): number {
  return Math.max(1.5, (gained / axisMax) * PLOT_HEIGHT);
}
