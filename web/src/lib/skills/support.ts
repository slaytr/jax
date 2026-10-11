import type { Frame } from '../pixelArt';
import {
  ARM_BACK_LEFT,
  ARM_LOW,
  ARM_OUT,
  ARM_REST,
  ARM_UP,
  column,
  LX,
  LY,
  line,
  type Dot,
  type Layer,
  type PoseFn,
  type SkillDef,
  type SpriteStep,
} from '../spriteKit';

// ── Agility: sprint, vault a hurdle, land in a puff of dust ────────────────
const HURDLE: Layer = [13, 12, ['rwrwrw', 'n....n', 'n....n', 'n....n']];
const ARMS_PUMPING: Dot[] = [[8, 10, 't'], [9, 9, 't'], [10, 9, 's']];
const ARMS_UP_LEFT: Dot[] = [[0, 10, 't'], [-1, 9, 't'], [-2, 8, 's']];

/** Scene-space layer from canvas coordinates (pose scenes are LX/LY-relative). */
const at = (x: number, y: number, art: Frame): Layer => [x - LX, y - LY, art];

function agilitySteps(pose: PoseFn): SpriteStep[] {
  const scene = [HURDLE];
  const ready = pose({ headDy: 1, leftArm: ARM_BACK_LEFT, rightArm: [[8, 10, 't'], [9, 11, 't'], [9, 12, 's']], scene });
  const run = pose({ dx: 3, leftArm: ARM_BACK_LEFT, rightArm: ARMS_PUMPING, scene });
  const jump = pose({ dx: 7, dy: -4, leftArm: ARMS_UP_LEFT, rightArm: ARM_UP, scene });
  const apex = pose({ dx: 10, dy: -5, leftArm: ARMS_UP_LEFT, rightArm: ARM_UP, scene });
  const land = pose({
    dx: 14,
    rightArm: ARM_OUT,
    leftArm: ARM_BACK_LEFT,
    dots: [[-1, 15, 'w'], [0, 14, 'w'], [9, 15, 'w'], [10, 14, 'w'], [-2, 13, 'd']],
    scene,
  });
  return [
    { frame: ready, ms: 340 },
    { frame: run, ms: 110 },
    { frame: jump, ms: 120 },
    { frame: apex, ms: 140 },
    { frame: land, ms: 300, beat: true },
  ];
}

// ── Thieving: reach over to a stranger, reach back, reveal a gold coin ──────
// The stranger is drawn from behind in colours that don't change per player.
const MARK: Frame = [
  '.KKKKK.', 'KnnnnnK', 'KnnnnnK', 'KnnnnnK', '.KsssK.', 'KrrrrrK', 'KrrrrrK',
  'KrrrrrK', 'KooyooK', 'KWWWWWK', 'KWWKWWK', 'KooKooK', '.KK.KK.',
];
const COIN: Frame = ['.yy.', 'ywyy', 'yyyy', '.yy.'];

function thievingSteps(pose: PoseFn): SpriteStep[] {
  const scene: Layer[] = [at(19, 10, MARK)];
  const idle = pose({ dx: 1, rightArm: ARM_REST, scene });
  const reach = pose({ dx: 3, headDy: 1, rightArm: ARM_OUT, scene });
  const pullBack = pose({ dx: 1, headDy: 1, rightArm: ARM_LOW, scene });
  const reveal = pose({
    dx: 1,
    rightArm: ARM_UP,
    props: [[10, 4, COIN]],
    dots: [[9, 3, 'w'], [15, 4, 'y'], [14, 8, 'w'], [8, 6, 'y']],
    scene,
  });
  return [
    { frame: idle, ms: 380 },
    { frame: reach, ms: 280 },
    { frame: pullBack, ms: 240 },
    { frame: reveal, ms: 380, beat: true },
  ];
}

// ── Dungeoneering: unlock a door and light spills out ──────────────────────
const DOOR: Layer = [
  14,
  6,
  ['.KKKK.', 'KnnnnK', 'KnnnnK', 'KnnnnK', 'KKnnnK', 'KnnnnK', 'KnnnnK', 'KnnnnK', 'KnnnnK', 'KKKKKK'],
];
const DOOR_FRAME: Layer[] = [
  [15, 6, ['KKKK']],
  [19, 7, column('K', 9)],
];
const DOOR_SLAB: Layer = [14, 6, ['.KK', 'KnK', 'KnK', 'KnK', 'KnK', 'KnK', 'KnK', 'KnK', 'KnK', 'KKK']];
const LIGHT: Frame = ['yyy', 'yyy', 'ywy', 'yyy', 'yyy', 'ywy', 'yyy', 'yyy'];

function dungeoneeringSteps(pose: PoseFn): SpriteStep[] {
  const KEY: Dot[] = [[11, 9, 'y'], [11, 10, 'y'], [11, 11, 'y'], ...line(12, 10, 14, 10, 'y')];
  const hold = (scene: Layer[], sceneDots: Dot[] = []): Frame =>
    pose({ rightArm: ARM_OUT, dots: KEY, scene, sceneDots });
  return [
    { frame: hold([DOOR]), ms: 360 },
    { frame: hold([DOOR], [[15, 9, 'w'], [15, 11, 'w']]), ms: 200 },
    { frame: hold([...DOOR_FRAME, [17, 7, ['y', 'y', 'y', 'y', 'y', 'y', 'y', 'y']], DOOR_SLAB]), ms: 200 },
    {
      frame: hold(
        [...DOOR_FRAME, [17, 7, LIGHT], DOOR_SLAB],
        [[20, 8, 'y'], [21, 10, 'y'], [20, 12, 'y'], [22, 7, 'w'], [22, 13, 'w']],
      ),
      ms: 400,
      beat: true,
    },
  ];
}

export const SUPPORT_SKILLS: Record<string, SkillDef> = {
  agility: { action: 'Vaulting a hurdle', xpPerBeat: 30, steps: agilitySteps },
  thieving: { action: 'Pickpocketing', xpPerBeat: 35, steps: thievingSteps },
  dungeoneering: { action: 'Unlocking a door', xpPerBeat: 40, steps: dungeoneeringSteps },
};
