/**
 * Tiny pixel-art toolkit: a sprite frame is an array of equal-length strings,
 * one character per pixel, '.' meaning transparent. Every helper returns a
 * new frame rather than editing one in place, so a shared base (the hero)
 * can be reused across every skill's frames.
 */
export type Frame = string[];
export type Palette = Record<string, string>;

export const TRANSPARENT = '.';

export const blankFrame = (width: number, height: number): Frame =>
  Array.from({ length: height }, () => TRANSPARENT.repeat(width));

/** Overlays `art` onto `base` with its top-left at (x, y). Transparent art
 * pixels leave the base alone; anything falling outside the base is clipped. */
export function stamp(base: Frame, x: number, y: number, art: Frame): Frame {
  return base.map((row, rowIndex) => {
    const artRow = art[rowIndex - y];
    if (artRow === undefined) return row;
    const cells = [...row];
    [...artRow].forEach((char, i) => {
      const col = x + i;
      if (char !== TRANSPARENT && col >= 0 && col < cells.length) cells[col] = char;
    });
    return cells.join('');
  });
}

/** Applies several [x, y, art] overlays in order, later ones on top. */
export const compose = (base: Frame, layers: Array<[number, number, Frame]>): Frame =>
  layers.reduce((frame, [x, y, art]) => stamp(frame, x, y, art), base);

export interface PixelRect {
  x: number;
  y: number;
  /** Run length — adjacent same-colour pixels in a row merge into one rect. */
  w: number;
  fill: string;
}

/** Turns a frame into the fewest horizontal runs of coloured rects, so the
 * SVG stays small. A character missing from the palette is skipped (and so
 * shows as transparent) rather than throwing. */
export function frameToRects(frame: Frame, palette: Palette): PixelRect[] {
  const rects: PixelRect[] = [];
  frame.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row[x];
      const fill = palette[char];
      if (char === TRANSPARENT || !fill) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === char) end += 1;
      rects.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  return rects;
}
