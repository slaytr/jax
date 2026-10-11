import { blankFrame, compose, type Frame } from '../pixelArt';
import {
  ARM_OUT,
  ARM_UP,
  HEIGHT,
  LX,
  LY,
  WIDTH,
  line,
  makePose,
  type Dot,
  type Layer,
  type Look,
  type PoseFn,
  type SkillDef,
  type SpriteStep,
} from '../spriteKit';

/**
 * Downtime animations — not skills, so they carry no XP and no beat. Both are
 * drawn in absolute canvas coordinates (the scene is the point), converting
 * to the pose factory's scene space with `at` where a hero is involved.
 */

const dotLayers = (dots: Dot[]): Layer[] => dots.map(([x, y, char]) => [x, y, [char]]);
const rows = (char: string, count: number): Frame => Array.from({ length: count }, () => char);

/** Scene-space layer from canvas coordinates (pose scenes are LX/LY-relative). */
const at = (x: number, y: number, art: Frame): Layer => [x - LX, y - LY, art];

// ── Sleeping: tucked into bed under the moon, Zs drifting up ───────────────
const MOON: Frame = ['.yyy.', 'yy...', 'yy...', 'yy...', '.yyy.'];
const Z_SMALL: Frame = ['www', '.w.', 'www'];
const Z_BIG: Frame = ['wwwww', '...w.', '..w..', '.w...', 'wwwww'];
const PILLOW: Frame = ['.wwwwwwww.', 'wwwwwwwwww', 'wGGGGGGGGw'];
const BLANKET: Frame = ['..tttttttt.ttt..', 'tttttttttttttttt', 'tttttttttttttttt', 'TTTTTTTTTTTTTTTT'];
const STARS_A: Dot[] = [[10, 2, 'y'], [16, 1, 'w'], [27, 7, 'y'], [29, 12, 'w'], [21, 14, 'w']];
const STARS_B: Dot[] = [[11, 3, 'w'], [15, 2, 'y'], [26, 8, 'w'], [28, 13, 'y'], [20, 13, 'y']];

/** Eyes shut: drop the highlight and stretch the pupils into lashes. */
function closeEyes(head: Frame): Frame {
  return head.map((row, i) => {
    if (i === 4) return row.replace(/w/g, 's');
    if (i !== 5) return row;
    const cells = [...row];
    for (const col of [3, 4, 6, 7]) cells[col] = 'e';
    return cells.join('');
  });
}

function sleepingSteps(_pose: PoseFn, look: Look): SpriteStep[] {
  const sleeper = closeEyes(look.head);
  const bed: Layer[] = [
    [1, 12, rows('nn', 10)],
    [29, 15, rows('nn', 7)],
    [3, 19, ['wwwwwwwwwwwwwwwwwwwwwwwwww', 'GGGGGGGGGGGGGGGGGGGGGGGGGG']],
    [1, 21, [rows('n', 1)[0].repeat(30)]],
    [1, 22, ['nn', 'nn']],
    [29, 22, ['nn', 'nn']],
    [3, 16, PILLOW],
  ];
  const night = (blanketY: number, zs: Layer[], stars: Dot[]): Frame =>
    compose(blankFrame(WIDTH, HEIGHT), [
      [2, 1, MOON],
      ...dotLayers(stars),
      ...bed,
      [4, 8, sleeper],
      [12, blanketY, BLANKET],
      ...zs,
    ]);
  const z1: Layer = [15, 11, Z_SMALL];
  const z2: Layer = [18, 6, Z_BIG];
  const z3: Layer = [24, 1, Z_BIG];
  return [
    { frame: night(16, [], STARS_A), ms: 480 },
    { frame: night(15, [z1], STARS_B), ms: 480 },
    { frame: night(16, [z1, z2], STARS_A), ms: 480 },
    { frame: night(15, [z1, z2, z3], STARS_B), ms: 520 },
    { frame: night(16, [z2, z3], STARS_A), ms: 480 },
  ];
}

// ── Vacation: sunglasses, a coconut drink and a palm-tree island ───────────
const SUN: Frame = ['.yyy.', 'yyyyy', 'yyyyy', 'yyyyy', '.yyy.'];
const CLOUD: Frame = ['.ww.ww.', 'wwwwwww'];
const GULL: Frame = ['w.w', '.w.'];
const FRONDS: Frame = ['.llll.llll.', 'lllllllllll', 'Ll.lllll.lL', 'L...lLl...L'];
const ISLAND: Frame = [`.....${'Z'.repeat(20)}.....`, `..${'Z'.repeat(26)}..`, 'z'.repeat(30)];
const COCONUT: Frame = ['.www.', 'nnnnn', '.nnn.'];

function sunglasses(head: Frame): Frame {
  return head.map((row, i) => {
    if (i !== 4 && i !== 5) return row;
    const cells = [...row];
    for (const col of i === 4 ? [3, 4, 5, 6, 7] : [3, 4, 6, 7]) cells[col] = 'K';
    return cells.join('');
  });
}

/** Canvas-coordinate dots → pose scene space. */
const toScene = (dots: Dot[]): Dot[] => dots.map(([x, y, char]): Dot => [x - LX, y - LY, char]);

function waves(phase: number): Layer {
  const row = (r: number): string =>
    Array.from({ length: WIDTH }, (_, x) => ((x + phase + r * 2) % 4 < 2 ? 'X' : 'W')).join('');
  return at(0, 20, [0, 1, 2, 3].map(row));
}

function vacationSteps(_pose: PoseFn, look: Look): SpriteStep[] {
  const pose = makePose({ ...look, head: sunglasses(look.head) });
  const holiday = (opts: { raised: boolean; phase: number; sway: number; sun: Dot[]; cloudX: number; gullX: number; bubbles?: Dot[] }): Frame => {
    const { raised, phase, sway, sun, cloudX, gullX, bubbles = [] } = opts;
    const drink: Layer = raised ? [11, 5, COCONUT] : [11, 8, COCONUT];
    const straw = raised ? line(13, 4, 15, 1, 'r') : line(13, 7, 15, 4, 'r');
    const worldDots: Dot[] = [
        ...line(24, 20, 23 + sway, 9, 'n'),
        ...line(25, 20, 24 + sway, 9, 'n'),
        [22 + sway, 9, 'o'],
        [25 + sway, 9, 'o'],
        ...sun,
      ];
    return pose({
      dx: 2,
      dy: -2,
      rightArm: raised ? ARM_UP : ARM_OUT,
      props: [drink],
      dots: [...straw, ...bubbles],
      scene: [
        waves(phase),
        at(1, 20, ISLAND),
        at(1, 0, SUN),
        at(cloudX, 1, CLOUD),
        at(gullX, 3, GULL),
        at(18 + sway, 5, FRONDS),
      ],
      sceneDots: toScene(worldDots),
    });
  };
  const sunA: Dot[] = [[7, 1, 'y'], [3, 6, 'y'], [0, 3, 'y']];
  const sunB: Dot[] = [[7, 3, 'y'], [0, 5, 'y'], [3, 0, 'y']];
  return [
    { frame: holiday({ raised: false, phase: 0, sway: 0, sun: sunA, cloudX: 15, gullX: 28 }), ms: 420 },
    { frame: holiday({ raised: true, phase: 1, sway: 1, sun: sunB, cloudX: 16, gullX: 27 }), ms: 420 },
    {
      frame: holiday({ raised: true, phase: 2, sway: 0, sun: sunA, cloudX: 17, gullX: 26, bubbles: [[16, 0, 'w'], [14, -1, 'w']] }),
      ms: 420,
    },
    { frame: holiday({ raised: false, phase: 3, sway: 1, sun: sunB, cloudX: 18, gullX: 25 }), ms: 420 },
  ];
}

export const STATE_SKILLS: Record<string, SkillDef> = {
  sleeping: { action: 'Sound asleep', xpPerBeat: 0, steps: sleepingSteps },
  vacation: { action: 'Beach holiday', xpPerBeat: 0, steps: vacationSteps },
};
