import type { Frame } from '../pixelArt';
import {
  ARM_HIGH,
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

// ── Cooking: flip a steak in a frying pan ──────────────────────────────────
const PAN: Frame = ['gggggg', '.gggg.'];
const STEAK: Frame = ['oFFo', '.oo.'];
const STEAK_FLIPPED: Frame = ['.oo.', 'oFFo'];

function cookingSteps(pose: PoseFn): SpriteStep[] {
  const hold = (dots: Dot[] = []): Frame =>
    pose({ rightArm: ARM_OUT, dots: [...line(11, 10, 13, 10, 'n'), ...dots], props: [[14, 10, PAN], [15, 8, STEAK]] });
  const flicked = (food: Layer): Frame =>
    pose({ rightArm: ARM_UP, dots: line(11, 8, 13, 7, 'n'), props: [[14, 6, PAN], food] });
  return [
    { frame: hold(), ms: 380 },
    { frame: flicked([15, 2, STEAK_FLIPPED]), ms: 140 },
    { frame: flicked([16, -3, STEAK]), ms: 160 },
    { frame: hold([[16, 5, 'y'], [19, 6, 'y'], [17, 3, 'w'], [14, 6, 'w'], [18, 4, 'w']]), ms: 300, beat: true },
  ];
}

// ── Fletching: whittle a stick into an arrow ───────────────────────────────
const WHITTLE_LEFT: Dot[] = [[0, 10, 't'], [1, 11, 't'], [2, 12, 't'], [3, 12, 's']];
const KNIFE: Dot[] = [[9, 11, 'g'], [8, 12, 'g']];

function fletchingSteps(pose: PoseFn): SpriteStep[] {
  const carve = (shift: number, shavings: Dot[]): Frame =>
    pose({ rightArm: ARM_OUT, leftArm: WHITTLE_LEFT, dots: [...line(3 + shift, 12, 13 + shift, 12, 'n'), ...KNIFE, ...shavings] });
  const done = pose({
    rightArm: ARM_OUT,
    leftArm: WHITTLE_LEFT,
    dots: [
      ...line(3, 12, 13, 12, 'n'), [14, 12, 'G'], [3, 11, 'r'], [3, 13, 'r'], [4, 11, 'w'], [4, 13, 'w'],
      [15, 10, 'y'], [16, 13, 'y'], [14, 9, 'w'],
    ],
  });
  return [
    { frame: carve(0, [[7, 13, 'n'], [9, 14, 'n'], [6, 14, 'n']]), ms: 280 },
    { frame: carve(2, [[8, 13, 'n'], [5, 14, 'n'], [10, 13, 'n']]), ms: 280 },
    { frame: carve(0, [[7, 14, 'n'], [10, 14, 'n']]), ms: 240 },
    { frame: done, ms: 360, beat: true },
  ];
}

// ── Firemaking: throw a log on the fire and it flares up ───────────────────
const LOGS: Layer = [18, 13, ['.nnnnnn.', 'nnKnnKnn', 'KKKKKKKK']];
const LOG: Frame = ['nnnnn', 'ooooo'];
const FLAME_SMALL: Frame = ['.F.', 'FyF'];
const FIRE_MEDIUM: Frame = ['..F..', '.FyF.', 'FFyFF', 'FFFFF'];
const FIRE_BIG: Frame = ['..y..', '.yFy.', '.FFF.', 'FFyFF', 'FFFFF', 'FFFFF'];

function firemakingSteps(pose: PoseFn): SpriteStep[] {
  const smoulder: Layer[] = [LOGS, [20, 11, FLAME_SMALL]];
  const holding = (dx: number, log: Layer, extra: { dots?: Dot[] } = {}): Frame =>
    pose({ dx, rightArm: ARM_UP, props: [log], dots: extra.dots, scene: smoulder });
  const throwing = pose({
    dx: 1,
    rightArm: ARM_OUT,
    props: [[14, 5, LOG]],
    dots: [[12, 7, 'w'], [11, 8, 'w'], [13, 8, 'w']],
    scene: smoulder,
  });
  const flare = pose({
    dx: 1,
    rightArm: ARM_OUT,
    scene: [LOGS, [19, 11, LOG], [19, 7, FIRE_BIG]],
    sceneDots: [[18, 5, 'y'], [24, 6, 'y'], [21, 3, 'y'], [25, 9, 'w'], [17, 8, 'w']],
  });
  const settle = pose({ scene: [LOGS, [19, 11, LOG], [19, 9, FIRE_MEDIUM]], sceneDots: [[22, 6, 'y']] });
  return [
    { frame: holding(0, [9, 7, LOG]), ms: 360 },
    { frame: holding(-1, [10, 3, LOG]), ms: 220 },
    { frame: throwing, ms: 130 },
    { frame: flare, ms: 300, beat: true },
    { frame: settle, ms: 280 },
  ];
}

// ── Crafting: shape clay on a potter's wheel ───────────────────────────────
const WHEEL: Layer[] = [
  [14, 12, ['ggggggggg']],
  [14, 13, ['.nnnnnnn.', '..nnnnn..']],
];

function craftingSteps(pose: PoseFn): SpriteStep[] {
  const shape = (clay: Layer, spin: Dot[], sparkles: Dot[] = []): Frame =>
    pose({
      dx: 3,
      rightArm: ARM_OUT,
      dots: [[11, 10, 's'], [12, 10, 's']],
      scene: [...WHEEL, clay],
      sceneDots: [...spin, ...sparkles],
    });
  const spinA: Dot[] = [[16, 12, 'w'], [20, 12, 'w']];
  const spinB: Dot[] = [[18, 12, 'w'], [22, 12, 'w']];
  const lump: Layer = [16, 10, ['.CCC.', 'CCCCC']];
  const column4: Layer = [16, 8, ['.CCC.', 'CCCCC', 'CCCCC', '.CCC.']];
  const vase: Layer = [16, 6, ['.CCC.', '..C..', '.CCC.', 'CCCCC', 'CCCCC', '.CCC.']];
  return [
    { frame: shape(lump, spinA), ms: 320 },
    { frame: shape(column4, spinB), ms: 260 },
    { frame: shape(vase, spinA, [[15, 5, 'y'], [21, 4, 'y'], [22, 8, 'w'], [14, 9, 'w']]), ms: 320, beat: true },
    { frame: shape(vase, spinB), ms: 200 },
  ];
}

// ── Smithing & Construction share a hammer ─────────────────────────────────
const HAMMER_HEAD: Frame = ['gggg', 'gggg'];

function hammerRaised(pose: PoseFn, scene: Layer[], sceneDots: Dot[] = []): Frame {
  return pose({ rightArm: ARM_UP, props: [[10, 0, column('n', 8)], [8, -2, HAMMER_HEAD]], scene, sceneDots });
}
function hammerMid(pose: PoseFn, scene: Layer[], sceneDots: Dot[] = []): Frame {
  return pose({ rightArm: ARM_UP, dots: line(11, 8, 14, 5, 'n'), props: [[13, 2, HAMMER_HEAD]], scene, sceneDots });
}

// ── Smithing: hammer a glowing bar on the anvil ────────────────────────────
const ANVIL: Layer = [15, 11, ['.KKKKKKK', 'KggggggK', '.KKggKK.', '..KggK..', '.KKKKKK.']];

function smithingSteps(pose: PoseFn): SpriteStep[] {
  const bar = (char: string): Dot[] => line(16, 10, 21, 10, char);
  const strike = pose({
    rightArm: ARM_UP,
    dots: line(11, 8, 15, 8, 'n'),
    props: [[16, 7, ['ggg', 'ggg', 'ggg']]],
    scene: [ANVIL],
    sceneDots: [...bar('y'), [20, 7, 'w'], [22, 8, 'y'], [23, 10, 'y'], [14, 9, 'y'], [15, 10, 'w']],
  });
  return [
    { frame: hammerRaised(pose, [ANVIL], bar('F')), ms: 420 },
    { frame: hammerMid(pose, [ANVIL], bar('F')), ms: 90 },
    { frame: strike, ms: 220, beat: true },
    { frame: hammerMid(pose, [ANVIL], bar('F')), ms: 180 },
  ];
}

// ── Construction: nail down another plank ──────────────────────────────────
const PLANK = (y: number): Layer => [18, y, ['nnnnnnnn', 'oooooooo']];

function constructionSteps(pose: PoseFn): SpriteStep[] {
  const low: Layer[] = [PLANK(14), PLANK(12)];
  const nail: Dot[] = [[19, 11, 'g']];
  const strike = pose({
    rightArm: ARM_HIGH,
    dots: line(11, 9, 17, 9, 'n'),
    props: [[18, 9, HAMMER_HEAD]],
    scene: low,
    sceneDots: [[17, 10, 'y'], [21, 9, 'y'], [22, 11, 'w'], [17, 12, 'w']],
  });
  return [
    { frame: hammerRaised(pose, low, nail), ms: 420 },
    { frame: hammerMid(pose, low, nail), ms: 90 },
    { frame: strike, ms: 220, beat: true },
    { frame: hammerRaised(pose, [...low, PLANK(10)]), ms: 280 },
  ];
}

// ── Herblore: pour two vials into a flask, stir, and the mix changes colour ─
const VIAL: Frame = ['KK...', 'KLK..', '.KLK.', '..KLK', '...KK'];
/** Interior levels top → bottom ('.' = empty glass). */
const flask = (levels: string[]): Layer => {
  const [top, upper, middle, bottom] = levels;
  const fill = (char: string, width: number): string => char.repeat(width);
  return [
    18,
    10,
    ['..KKK..', `.K${fill(top, 3)}K.`, `K${fill(upper, 5)}K`, `K${fill(middle, 5)}K`, `K${fill(bottom, 5)}K`, '.KKKKK.'],
  ];
};
const vial = (liquid: string): Layer => [10, 6, VIAL.map((row) => row.replace(/L/g, liquid))];
const pour = (liquid: string): Dot[] => [...line(15, 9, 21, 9, liquid), [21, 10, liquid], [21, 11, liquid]];
const stirRod = (tipX: number, tipY: number): Dot[] => [...line(11, 10, tipX, tipY, 'g'), [tipX, tipY, 'G']];
const BUBBLES: Dot[] = [[19, 8, 'w'], [23, 7, 'w'], [21, 8, 'w'], [25, 9, 'w']];

function herbloreSteps(pose: PoseFn): SpriteStep[] {
  const pouring = (liquid: string | null, levels: string[]): Frame =>
    pose({
      rightArm: ARM_UP,
      props: liquid ? [vial(liquid)] : [],
      dots: liquid ? pour(liquid) : [],
      scene: [flask(levels)],
    });
  const stirring = (levels: string[], tip: [number, number], bubbles: Dot[]): Frame =>
    pose({ rightArm: ARM_OUT, dots: stirRod(...tip), scene: [flask(levels)], sceneDots: bubbles });
  const mixed = pose({
    rightArm: ARM_UP,
    scene: [flask(['c', 'c', 'c', 'c'])],
    sceneDots: [...BUBBLES, [17, 7, 'y'], [26, 7, 'y'], [21, 5, 'y'], [18, 9, 'y'], [24, 9, 'w']],
  });
  return [
    { frame: pouring('v', ['.', '.', '.', '.']), ms: 360 },
    { frame: pouring('v', ['.', '.', 'v', 'v']), ms: 260 },
    { frame: pouring('P', ['P', 'P', 'v', 'v']), ms: 260 },
    { frame: stirring(['P', 'v', 'P', 'v'], [20, 11], BUBBLES.slice(0, 2)), ms: 180 },
    { frame: stirring(['v', 'P', 'v', 'P'], [21, 12], BUBBLES.slice(1, 4)), ms: 180 },
    { frame: mixed, ms: 360, beat: true },
  ];
}

// ── Runecrafting: feed essence to an altar, runes float out ────────────────
const altar = (symbol: string): Layer => [
  18,
  10,
  ['.KKKKKKK.', 'KgggggggK', 'KgggXgggK', 'KggXXXggK', 'KgggXgggK', 'KKKKKKKKK'].map((row) => row.replace(/X/g, symbol)),
];
const ESSENCE: Frame = ['.w.', 'wcw', '.w.'];
const RUNES: Array<[number, Frame]> = [
  [18, ['PPP', 'PwP', 'PPP']],
  [21, ['FFF', 'FwF', 'FFF']],
  [24, ['ccc', 'cwc', 'ccc']],
];
const runesAt = (y: number): Layer[] => RUNES.map(([x, art], i): Layer => [x, y - (i === 1 ? 2 : 0), art]);

function runecraftingSteps(pose: PoseFn): SpriteStep[] {
  const carry = (dx: number, props: Layer[], scene: Layer[], sceneDots: Dot[] = []): Frame =>
    pose({ dx, rightArm: ARM_OUT, props, scene, sceneDots });
  return [
    { frame: carry(0, [[11, 9, ESSENCE]], [altar('P')]), ms: 360 },
    { frame: carry(1, [[14, 9, ESSENCE]], [altar('P')]), ms: 160 },
    {
      frame: carry(1, [], [altar('w')], [[17, 9, 'y'], [27, 9, 'y'], [22, 8, 'c'], [20, 8, 'w'], [24, 8, 'w']]),
      ms: 220,
      beat: true,
    },
    { frame: carry(0, [], [altar('w'), ...runesAt(5)]), ms: 260 },
    { frame: carry(0, [], [altar('P'), ...runesAt(3)]), ms: 240 },
  ];
}

// ── Summoning: pouch, glowing circle, a spirit fox appears ─────────────────
const circle = (char: string): Layer => [15, 13, ['.PPPPPPPPP.', 'P.........P', '.PPPPPPPPP.'].map((row) => row.replace(/P/g, char))];
const POUCH: Frame = ['.y.', 'ooo', 'ooo'];
const FOX: Frame = ['KK...KK', 'KFKKKFK', 'KFFFFFK', 'KFeFFeK', 'KFFFFFK', '.KKKKK.'];
const FOX_SMALL: Frame = ['K.K', 'KFK', 'KKK'];

function summoningSteps(pose: PoseFn): SpriteStep[] {
  const hold = (scene: Layer[], sceneDots: Dot[] = []): Frame =>
    pose({ rightArm: ARM_UP, props: [[11, 5, POUCH]], scene, sceneDots });
  return [
    { frame: hold([circle('P')]), ms: 360 },
    { frame: hold([circle('w')], [[17, 10, 'P'], [20, 8, 'P'], [23, 10, 'P'], [19, 6, 'w'], [22, 6, 'w']]), ms: 240 },
    { frame: hold([circle('w'), [20, 10, FOX_SMALL]], [[17, 8, 'y'], [24, 8, 'y']]), ms: 180 },
    {
      frame: hold([circle('P'), [18, 7, FOX]], [[17, 6, 'y'], [25, 6, 'w'], [21, 4, 'y'], [26, 10, 'w']]),
      ms: 320,
      beat: true,
    },
    { frame: hold([circle('P'), [18, 7, FOX]]), ms: 200 },
  ];
}

// ── Invention: turn the gears, the lightbulb comes on ──────────────────────
const GEAR_A: Frame = ['..g..', '.ggg.', 'gg.gg', '.ggg.', '..g..'];
const GEAR_B: Frame = ['g...g', '.ggg.', '.g.g.', '.ggg.', 'g...g'];
const BULB_OFF: Frame = ['.KKK.', 'KgggK', 'KgGgK', '.KgK.', '..K..'];
const BULB_ON: Frame = ['.KKK.', 'KyyyK', 'KywyK', '.KyK.', '..K..'];

function inventionSteps(pose: PoseFn): SpriteStep[] {
  const WRENCH: Dot[] = [...line(11, 10, 13, 10, 'g'), [14, 9, 'g'], [14, 11, 'g']];
  const work = (a: Frame, b: Frame, bulb: Frame, sceneDots: Dot[] = []): Frame =>
    pose({ rightArm: ARM_OUT, dots: WRENCH, scene: [[14, 9, a], [18, 11, b], [21, 1, bulb]], sceneDots });
  return [
    { frame: work(GEAR_A, GEAR_B, BULB_OFF), ms: 320 },
    { frame: work(GEAR_B, GEAR_A, BULB_OFF, [[18, 10, 'y'], [19, 10, 'w']]), ms: 200 },
    { frame: work(GEAR_A, GEAR_B, BULB_OFF, [[18, 12, 'y'], [17, 11, 'w']]), ms: 200 },
    {
      frame: work(GEAR_B, GEAR_A, BULB_ON, [[20, 0, 'y'], [26, 0, 'y'], [19, 3, 'y'], [27, 3, 'y'], [23, -1, 'y']]),
      ms: 380,
      beat: true,
    },
  ];
}

export const ARTISAN_SKILLS: Record<string, SkillDef> = {
  cooking: { action: 'Flipping a steak', xpPerBeat: 25, steps: cookingSteps },
  fletching: { action: 'Whittling an arrow', xpPerBeat: 25, steps: fletchingSteps },
  firemaking: { action: 'Lighting a bonfire', xpPerBeat: 30, steps: firemakingSteps },
  crafting: { action: 'Throwing a vase', xpPerBeat: 30, steps: craftingSteps },
  smithing: { action: 'Hammering hot metal', xpPerBeat: 35, steps: smithingSteps },
  herblore: { action: 'Brewing a potion', xpPerBeat: 40, steps: herbloreSteps },
  runecrafting: { action: 'Crafting runes', xpPerBeat: 45, steps: runecraftingSteps },
  construction: { action: 'Building a wall', xpPerBeat: 30, steps: constructionSteps },
  summoning: { action: 'Summoning a familiar', xpPerBeat: 45, steps: summoningSteps },
  invention: { action: 'Tinkering with gears', xpPerBeat: 50, steps: inventionSteps },
};
