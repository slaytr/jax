/**
 * Pure layout math for the Gains/Standings line charts — ported directly
 * from the old gains-line.js, split out so it's independently testable.
 */

export const WIDTH = 300;
export const HEIGHT = 100;
export const PAD_X = 3;
export const PAD_Y = 8;
export const PAD_LEFT_AXIS = 26;
export const LABEL_WIDTH = 48;
export const PLOT_WIDTH = WIDTH - PAD_LEFT_AXIS - PAD_X - LABEL_WIDTH;
export const PLOT_RIGHT = PAD_LEFT_AXIS + PLOT_WIDTH;
const AXIS_TICKS = 4;
const LABEL_MIN_GAP = 9;
const LABEL_Y_MIN = PAD_Y;
const LABEL_Y_MAX = HEIGHT - PAD_Y;

export const toX = (x: number) => PAD_LEFT_AXIS + x * PLOT_WIDTH;
export const toY = (y: number) => HEIGHT - PAD_Y - y * (HEIGHT - PAD_Y * 2);

function niceStep(span: number, tickCount: number) {
  if (span <= 0) return 1;
  const rawStep = span / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return niceResidual * magnitude;
}

export interface AxisTick {
  value: number;
  y: number;
}

export function yAxisTicks(minValue: number, maxValue: number): AxisTick[] {
  if (minValue === maxValue) return [{ value: minValue, y: toY(0) }];

  const span = maxValue - minValue;
  const step = niceStep(span, AXIS_TICKS);
  const first = Math.ceil(minValue / step) * step;

  const ticks: AxisTick[] = [];
  for (let value = first; value <= maxValue + step * 0.001; value += step) {
    ticks.push({ value, y: toY((value - minValue) / span) });
  }
  return ticks;
}

export interface LabelEntry {
  y: number;
}

export function declutterLabels<T extends LabelEntry>(entries: T[]): T[] {
  const sorted = [...entries].sort((a, b) => a.y - b.y);

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < LABEL_MIN_GAP) sorted[i].y = sorted[i - 1].y + LABEL_MIN_GAP;
  }
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i + 1].y - sorted[i].y < LABEL_MIN_GAP) sorted[i].y = sorted[i + 1].y - LABEL_MIN_GAP;
  }

  clampToBounds(sorted);
  return sorted;
}

function clampToBounds(sorted: LabelEntry[]) {
  if (!sorted.length) return;

  const span = sorted[sorted.length - 1].y - sorted[0].y;
  const available = LABEL_Y_MAX - LABEL_Y_MIN;

  if (span > available) {
    const scale = available / span;
    const base = sorted[0].y;
    for (const entry of sorted) entry.y = LABEL_Y_MIN + (entry.y - base) * scale;
  } else if (sorted[0].y < LABEL_Y_MIN) {
    const shift = LABEL_Y_MIN - sorted[0].y;
    for (const entry of sorted) entry.y += shift;
  } else if (sorted[sorted.length - 1].y > LABEL_Y_MAX) {
    const shift = sorted[sorted.length - 1].y - LABEL_Y_MAX;
    for (const entry of sorted) entry.y -= shift;
  }
}
