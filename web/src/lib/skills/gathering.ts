import type { Frame } from '../pixelArt';
import {
  ARM_LOW,
  ARM_OUT,
  ARM_UP,
  column,
  line,
  type Dot,
  type Layer,
  type PoseFn,
  type SkillDef,
  type SpriteStep,
} from '../spriteKit';

// ── Mining: pick overhead → swing down → strike, chips fly ─────────────────
const ROCK: Layer = [19, 10, ['..KKKK..', '.KggGgK.', 'KgGggggK', 'KgggyygK', 'KggyyggK', '.KKKKKK.']];
const PICK_HEAD_OUT: Layer = [18, 8, ['gg', 'g.', 'g.', 'g.', 'gg']];

function miningSteps(pose: PoseFn): SpriteStep[] {
  const swinging = { dx: 1, rightArm: ARM_OUT, props: [[11, 10, ['nnnnnnn']], PICK_HEAD_OUT] as Layer[], scene: [ROCK] };
  const raised = pose({
    rightArm: ARM_UP,
    props: [[10, 0, column('n', 8)], [7, -2, ['.ggggg.', 'gg...gg']]],
    scene: [ROCK],
  });
  const swing = pose(swinging);
  const strike = pose({
    ...swinging,
    headDy: 1,
    dots: [
      [19, 7, 'y'], [21, 7, 'y'], [20, 8, 'w'], [20, 6, 'w'],
      [23, 6, 'y'], [25, 8, 'y'], [22, 4, 'w'],
    ],
  });
  return [
    { frame: raised, ms: 450 },
    { frame: swing, ms: 110 },
    { frame: strike, ms: 240, beat: true },
    { frame: swing, ms: 140 },
  ];
}

// ── Woodcutting: axe bites into a trunk, leaves drift down ─────────────────
const CANOPY: Frame = ['..llllll..', '.lllllllL.', 'lllllllllL', 'lllllllLLL', '.lllLLLLL.', '..LLLLLL..'];
const TRUNK: Layer = [19, 5, ['nn', 'nn', 'nn', 'nn', 'nn', 'nn', 'nn', 'nn', 'nn', 'nn', 'nn']];

function woodcuttingSteps(pose: PoseFn): SpriteStep[] {
  const tree = (shake: boolean): Layer[] => [TRUNK, [shake ? 16 : 15, -1, CANOPY]];
  const chop = { dx: 1, rightArm: ARM_OUT, props: [[16, 8, ['gg', 'gg', 'gg', 'gg', 'gg']], [11, 10, ['nnnnn']]] as Layer[] };
  const raised = pose({
    rightArm: ARM_UP,
    props: [[10, 1, column('n', 7)], [11, 0, ['gg.', 'ggg', 'gg.']]],
    scene: tree(false),
  });
  const swing = pose({ ...chop, scene: tree(false) });
  const strike = pose({
    ...chop,
    headDy: 1,
    scene: tree(true),
    sceneDots: [[21, 9, 'n'], [22, 7, 'n'], [18, 6, 'w'], [22, 3, 'l'], [24, 5, 'l'], [17, 4, 'l'], [25, 8, 'l']],
  });
  return [
    { frame: raised, ms: 440 },
    { frame: swing, ms: 100 },
    { frame: strike, ms: 240, beat: true },
    { frame: swing, ms: 140 },
  ];
}

// ── Fishing: wait, bite, hook, and a fish leaps out ────────────────────────
const waterLayer = (phase: number): Layer => [
  12,
  13,
  [
    Array.from({ length: 16 }, (_, x) => ((x + phase) % 4 < 2 ? 'X' : 'W')).join(''),
    'W'.repeat(16),
    'W'.repeat(16),
  ],
];
const FISH: Frame = ['..FF.', 'FFFwF', '..FF.'];

function fishingSteps(pose: PoseFn): SpriteStep[] {
  const rod = (tipX: number, tipY: number): Dot[] => line(11, 9, tipX, tipY, 'n');
  const wait = pose({
    rightArm: ARM_OUT,
    dots: [...rod(17, 3), ...line(17, 3, 22, 12, 'w'), [22, 13, 'r']],
    scene: [waterLayer(0)],
  });
  const bite = pose({
    rightArm: ARM_OUT,
    dots: [...rod(17, 3), ...line(17, 3, 22, 13, 'w'), [22, 14, 'r']],
    scene: [waterLayer(1)],
    sceneDots: [[19, 13, 'w'], [26, 13, 'w']],
  });
  const hook = pose({
    dx: -1,
    rightArm: ARM_OUT,
    dots: [...rod(16, 2), ...line(16, 2, 23, 13, 'w'), [4, -5, 'y'], [4, -4, 'y'], [4, -2, 'y']],
    scene: [waterLayer(2)],
  });
  const catchFrame = pose({
    dx: -1,
    rightArm: ARM_OUT,
    dots: rod(15, 3),
    props: [[17, 1, FISH]],
    scene: [waterLayer(3)],
    sceneDots: [[19, 12, 'w'], [22, 11, 'w'], [24, 12, 'w'], [21, 13, 'w']],
  });
  return [
    { frame: wait, ms: 420 },
    { frame: bite, ms: 220 },
    { frame: hook, ms: 200 },
    { frame: catchFrame, ms: 320, beat: true },
  ];
}

// ── Farming: water a seedling until it blooms ──────────────────────────────
const SOIL: Layer = [19, 14, ['.oooooo.', 'oooooooo']];
const FLOWER: Layer = [21, 3, ['.r.', 'ryr', '.r.']];

function farmingSteps(pose: PoseFn): SpriteStep[] {
  const can: Layer = [11, 9, ['gggg', 'gggg', 'gggg']];
  const level = pose({ rightArm: ARM_OUT, props: [can], dots: line(15, 9, 17, 8, 'g'), scene: [SOIL] });
  const pouring = (drops: Dot[], plant: Dot[], extra: Layer[] = []): Frame =>
    pose({ rightArm: ARM_OUT, props: [can], dots: line(15, 10, 18, 12, 'g'), scene: [SOIL, ...extra], sceneDots: [...drops, ...plant] });
  const sprout: Dot[] = [[22, 13, 'l']];
  const seedling: Dot[] = [...line(22, 10, 22, 13, 'L'), [21, 10, 'l'], [23, 10, 'l'], [21, 11, 'l']];
  const bloom: Dot[] = [
    ...line(22, 6, 22, 13, 'L'),
    [20, 9, 'l'], [24, 9, 'l'], [21, 11, 'l'], [23, 11, 'l'],
    [19, 4, 'y'], [25, 3, 'y'], [24, 7, 'y'],
  ];
  return [
    { frame: level, ms: 380 },
    { frame: pouring([[19, 12, 'c'], [20, 13, 'c'], [21, 12, 'c']], sprout), ms: 260 },
    { frame: pouring([[19, 13, 'c'], [20, 12, 'c'], [21, 13, 'c']], seedling), ms: 260 },
    { frame: pouring([], bloom, [FLOWER]), ms: 340, beat: true },
  ];
}

// ── Hunter: swing a net over a butterfly ───────────────────────────────────
const HOOP: Frame = ['.www.', 'w...w', 'w...w', 'w...w', '.www.'];
const BUTTERFLY_OPEN: Frame = ['P.P', '.y.'];
const BUTTERFLY_CLOSED: Frame = ['.P.', '.y.'];

function hunterSteps(pose: PoseFn): SpriteStep[] {
  const ready = pose({
    rightArm: ARM_UP,
    dots: line(11, 7, 14, 4, 'n'),
    props: [[13, -1, HOOP], [21, 0, BUTTERFLY_OPEN]],
  });
  const near = pose({
    rightArm: ARM_UP,
    dots: line(11, 7, 14, 4, 'n'),
    props: [[13, -1, HOOP], [19, 2, BUTTERFLY_CLOSED]],
  });
  const swing = (sparkles: Dot[]): Frame =>
    pose({
      dx: 1,
      rightArm: ARM_OUT,
      dots: [...line(11, 10, 15, 8, 'n'), ...sparkles],
      props: [[15, 3, HOOP], [16, 4, BUTTERFLY_CLOSED]],
    });
  return [
    { frame: ready, ms: 380 },
    { frame: near, ms: 240 },
    { frame: swing([]), ms: 130 },
    { frame: swing([[14, 2, 'y'], [20, 2, 'y'], [21, 6, 'y'], [15, 9, 'w'], [19, 8, 'w']]), ms: 300, beat: true },
  ];
}

// ── Divination: draw glowing wisps into the body ───────────────────────────
const WISP_C: Frame = ['.c.', 'cwc', '.c.'];
const WISP_P: Frame = ['.P.', 'PwP', '.P.'];

function divinationSteps(pose: PoseFn): SpriteStep[] {
  const reach = (props: Layer[], dots: Dot[] = [], dy = 0): Frame => pose({ rightArm: ARM_UP, props, dots, dy });
  return [
    { frame: reach([[14, 1, WISP_C], [19, 4, WISP_P], [15, 8, WISP_C]]), ms: 360 },
    {
      frame: reach([[12, 2, WISP_C], [16, 5, WISP_P], [13, 8, WISP_C]], [[14, 4, 'c'], [15, 7, 'P'], [14, 10, 'c']]),
      ms: 240,
    },
    {
      frame: reach(
        [[13, 4, WISP_C], [15, 8, WISP_P]],
        [...line(12, 5, 7, 10, 'c'), ...line(14, 9, 9, 11, 'P'), [-1, 9, 'w'], [9, 13, 'w'], [-1, 13, 'w']],
      ),
      ms: 200,
      beat: true,
    },
    { frame: reach([], [[-2, 5, 'w'], [11, 4, 'c'], [-2, 13, 'c'], [11, 13, 'w'], [4, -3, 'w'], [1, -2, 'c'], [8, -2, 'c']]), ms: 260 },
  ];
}

// ── Archaeology: brush dirt away to uncover a relic ────────────────────────
const MOUND: Layer = [17, 12, ['...oooo...', '..oooooo..', '.oooooooo.', 'oooooooooo']];
const BRISTLES: Frame = ['yy', 'yy', 'yy'];
const VASE_TOP: Layer = [19, 11, ['yyyyyyy', '.yyyyy.']];
const VASE: Layer = [19, 6, ['.yyyyy.', '..yyy..', '..yyy..', '.yyyyy.', 'yyyyyyy', 'yywyyyy', '.yyyyy.']];

function archaeologySteps(pose: PoseFn): SpriteStep[] {
  const stroke = (reach: number, scene: Layer[], sceneDots: Dot[] = []): Frame =>
    pose({
      rightArm: ARM_LOW,
      dots: line(11, 12, 13 + reach, 12, 'n'),
      props: [[14 + reach, 11, BRISTLES]],
      scene,
      sceneDots,
    });
  return [
    { frame: stroke(0, [MOUND]), ms: 320 },
    { frame: stroke(2, [MOUND], [[19, 10, 'd'], [21, 9, 'd'], [20, 11, 'd']]), ms: 180 },
    { frame: stroke(0, [MOUND, VASE_TOP], [[18, 10, 'd'], [22, 9, 'd']]), ms: 220 },
    {
      frame: stroke(0, [MOUND, VASE], [[18, 4, 'w'], [24, 4, 'y'], [26, 8, 'w'], [17, 8, 'y']]),
      ms: 340,
      beat: true,
    },
  ];
}

export const GATHERING_SKILLS: Record<string, SkillDef> = {
  mining: { action: 'Swinging a pickaxe', xpPerBeat: 25, steps: miningSteps },
  woodcutting: { action: 'Chopping a tree', xpPerBeat: 25, steps: woodcuttingSteps },
  fishing: { action: 'Landing a fish', xpPerBeat: 25, steps: fishingSteps },
  farming: { action: 'Watering a seedling', xpPerBeat: 30, steps: farmingSteps },
  hunter: { action: 'Netting a butterfly', xpPerBeat: 35, steps: hunterSteps },
  divination: { action: 'Harvesting wisps', xpPerBeat: 40, steps: divinationSteps },
  archaeology: { action: 'Unearthing a relic', xpPerBeat: 45, steps: archaeologySteps },
};

