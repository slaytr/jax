import { blankFrame, compose, type Frame, type Palette } from './pixelArt';

/**
 * Shared kit for the skill sprites: canvas size, palette, the Look/Pose
 * types, and the pose factory that assembles a chibi from parts.
 *
 * Coordinates: props and dots are hero-relative (they travel with the body
 * when it leans or lunges). `scene` layers are canvas-fixed, measured from
 * the same origin as the hero's resting position — use them for anything the
 * hero acts on (a rock, a tree, an anvil) so it doesn't shift when the hero
 * does. Positive y is down; the hero's head top is y=0, feet y=15.
 */
export interface SpriteStep {
  frame: Frame;
  ms: number;
  /** The frame where the action lands — the XP pop fires here. */
  beat?: boolean;
}

export interface SkillSprite {
  id: string;
  name: string;
  /** Short caption for the animation. */
  action: string;
  steps: SpriteStep[];
  xpPerBeat: number;
}

/** A character's silhouette: head (10x9) and body (9x7) share one footprint
 * across every look, so any look can perform any skill. Colours come from
 * the palette handed to the renderer, not from the frames. */
export interface Look {
  head: Frame;
  body: Frame;
}

export type Dot = [number, number, string];
export type Layer = [number, number, Frame];

export interface Pose {
  /** Whole-body shift — a lunge, a recoil, a jump. */
  dx?: number;
  dy?: number;
  /** Extra head drop, so the head can nod into a swing. */
  headDy?: number;
  rightArm?: Dot[];
  leftArm?: Dot[];
  /** Hero-relative overlays (tools, effects that follow the body). */
  props?: Layer[];
  dots?: Dot[];
  /** Canvas-fixed overlays drawn behind the hero (the thing being acted on). */
  scene?: Layer[];
  /** Canvas-fixed dots drawn in front of everything. */
  sceneDots?: Dot[];
}
export type PoseFn = (pose?: Pose) => Frame;

export interface SkillDef {
  action: string;
  xpPerBeat: number;
  steps: (pose: PoseFn, look: Look) => SpriteStep[];
}

export const WIDTH = 32;
export const HEIGHT = 24;

// Cute-RPG look: warm dark-brown outline instead of black, two-tone shading,
// saturated-but-soft colours. Original art, drawn in the spirit of the
// 16x16 chibi style — not taken from any asset pack.
export const PALETTE: Palette = {
  K: '#3a2433', // outline
  h: '#a8552d', // hair
  H: '#d77a3e', // hair highlight
  s: '#ffd2a8', // skin
  S: '#e8a77e', // skin shade
  e: '#3a2433', // eye
  m: '#ff9ea1', // blush
  t: '#4fae5a', // tunic (per-player colour)
  T: '#348443', // tunic shade
  p: '#6b6fd6', // trousers
  o: '#8a5a3b', // boots / belt / soil
  g: '#b7c3d0', // steel
  G: '#f4f8fb', // steel highlight
  y: '#ffd23f', // gold
  n: '#a8703c', // wood
  r: '#e0454f', // red
  w: '#ffffff', // flash
  c: '#6fe3ff', // magic cyan
  P: '#b57bff', // magic purple
  a: '#ffffff', // accent trim (per-player)
  N: '#23304f', // hat
  d: '#8a6a4a', // beard / dust
  l: '#58b368', // leaf
  L: '#3a8a4a', // leaf shade
  F: '#ff8a2b', // fire / fish / fox
  v: '#7dff9b', // spirit / potion green
  W: '#3a8fd6', // water
  X: '#7fc4f5', // water highlight
  C: '#d98b5f', // clay
  Z: '#f3d9a0', // sand
  z: '#d9b97a', // sand shade
  i: '#f1e6c8', // bone
  I: '#cdbf9c', // bone shade
};

// Origin of the hero's top-left on the canvas; leaves headroom for tall props.
export const LX = 4;
export const LY = 7;

export const column = (char: string, length: number): Frame => Array.from({ length }, () => char);

/** Bresenham line as dots, endpoints included. */
export function line(x0: number, y0: number, x1: number, y1: number, char: string): Dot[] {
  const dots: Dot[] = [];
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  const spanX = Math.abs(x1 - x0);
  const spanY = Math.abs(y1 - y0);
  let x = x0;
  let y = y0;
  let err = spanX - spanY;
  for (;;) {
    dots.push([x, y, char]);
    if (x === x1 && y === y1) return dots;
    const doubled = 2 * err;
    if (doubled > -spanY) {
      err -= spanY;
      x += stepX;
    }
    if (doubled < spanX) {
      err += spanX;
      y += stepY;
    }
  }
}

/** A flash: every shaded fill pixel of `art` turned white, outline kept. */
export const flash = (art: Frame): Frame => art.map((row) => row.replace(/[^.K]/g, 'w'));

/** Four-pointed sparkle burst, 5x5. */
export const BURST: Frame = ['..y..', '.ywy.', 'ywwwy', '.ywy.', '..y..'];

// Right-arm presets; the comment names where the hand lands (hero-relative).
export const ARM_REST: Dot[] = [[8, 10, 't'], [8, 11, 't'], [8, 12, 's']]; // (8, 12)
export const ARM_OUT: Dot[] = [[8, 10, 't'], [9, 10, 't'], [10, 10, 's']]; // (10, 10)
export const ARM_UP: Dot[] = [[8, 10, 't'], [9, 9, 't'], [10, 8, 's']]; // (10, 8)
export const ARM_HIGH: Dot[] = [[8, 10, 't'], [9, 10, 't'], [10, 9, 's']]; // (10, 9)
export const ARM_LOW: Dot[] = [[8, 10, 't'], [9, 11, 't'], [10, 12, 's']]; // (10, 12)
export const ARM_REST_LEFT: Dot[] = [[0, 10, 't'], [0, 11, 't'], [0, 12, 's']];
export const ARM_BACK_LEFT: Dot[] = [[0, 10, 't'], [-1, 11, 't'], [-1, 12, 's']];

const dotLayers = (dots: Dot[]): Layer[] => dots.map(([x, y, char]) => [x, y, [char]]);

export const makePose =
  (look: Look): PoseFn =>
  ({ dx = 0, dy = 0, headDy = 0, rightArm = ARM_REST, leftArm = ARM_REST_LEFT, props = [], dots = [], scene = [], sceneDots = [] } = {}) => {
    const ox = LX + dx;
    const oy = LY + dy;
    const place = ([x, y, art]: Layer): Layer => [ox + x, oy + y, art];
    const fixed = ([x, y, art]: Layer): Layer => [LX + x, LY + y, art];
    return compose(blankFrame(WIDTH, HEIGHT), [
      ...scene.map(fixed),
      ...dotLayers(leftArm).map(place),
      [ox, oy + 9, look.body],
      [ox, oy + headDy, look.head],
      ...dotLayers(rightArm).map(place),
      ...props.map(place),
      ...dotLayers(dots).map(place),
      ...dotLayers(sceneDots).map(fixed),
    ]);
  };
