import type { Frame } from '../pixelArt';
import {
  ARM_BACK_LEFT,
  ARM_OUT,
  ARM_UP,
  BURST,
  column,
  flash,
  line,
  type Dot,
  type Layer,
  type PoseFn,
  type SkillDef,
  type SpriteStep,
} from '../spriteKit';

// ── Attack: wind up overhead → swing → lunging slash with a trail ──────────
const SLASH_TRAIL: Dot[] = [
  [12, 1, 'w'], [13, 1, 'w'], [14, 2, 'w'], [15, 2, 'w'], [16, 3, 'w'], [17, 4, 'w'],
  [18, 5, 'w'], [18, 6, 'w'], [19, 7, 'w'], [19, 8, 'w'], [19, 9, 'w'],
  [14, 3, 'c'], [15, 3, 'c'], [16, 4, 'c'], [17, 5, 'c'], [17, 6, 'c'], [18, 7, 'c'], [18, 8, 'c'],
];

function attackSteps(pose: PoseFn): SpriteStep[] {
  const windup = pose({
    dx: -1,
    rightArm: ARM_UP,
    leftArm: ARM_BACK_LEFT,
    props: [
      [10, -4, ['G', ...column('g', 10)]],
      [9, 7, ['yyy']],
    ],
  });
  const swing = (dx: number): Frame =>
    pose({
      dx,
      rightArm: ARM_UP,
      props: [[11, 2, ['.....G', '....g.', '...g..', '..g...', '.g....', 'y.....']]],
    });
  const strike = pose({
    dx: 2,
    headDy: 1,
    rightArm: ARM_OUT,
    leftArm: [[0, 10, 't'], [-1, 9, 't'], [-2, 9, 's']],
    props: [[11, 11, ['y.....', '.g....', '..g...', '...g..', '....g.', '.....G']]],
    dots: SLASH_TRAIL,
  });
  return [
    { frame: windup, ms: 480 },
    { frame: swing(0), ms: 90 },
    { frame: strike, ms: 280, beat: true },
    { frame: swing(1), ms: 160 },
  ];
}

// ── Strength: dumbbell curls, squeezing at the top ─────────────────────────
const DUMBBELL: Frame = ['g...g', 'gnnng', 'g...g'];
const SQUEEZE_SPARKS: Dot[] = [[12, 5, 'y'], [13, 3, 'w'], [-5, 5, 'y'], [-6, 3, 'w'], [11, 1, 'y'], [-4, 1, 'y']];

function strengthSteps(pose: PoseFn): SpriteStep[] {
  const curl = (up: boolean, sparks: Dot[] = []): Frame =>
    pose({
      rightArm: up
        ? [[8, 10, 't'], [9, 10, 't'], [10, 9, 't'], [10, 8, 's']]
        : [[8, 10, 't'], [9, 11, 't'], [9, 12, 's']],
      leftArm: up
        ? [[0, 10, 't'], [-1, 10, 't'], [-2, 9, 't'], [-2, 8, 's']]
        : [[0, 10, 't'], [-1, 11, 't'], [-1, 12, 's']],
      props: up ? [[8, 7, DUMBBELL], [-4, 7, DUMBBELL]] : [[7, 11, DUMBBELL], [-3, 11, DUMBBELL]],
      dots: sparks,
    });
  return [
    { frame: curl(false), ms: 380 },
    { frame: curl(true), ms: 240, beat: true },
    { frame: curl(true, SQUEEZE_SPARKS), ms: 220 },
    { frame: curl(true), ms: 120 },
  ];
}

// ── Defence: shield up → incoming blow → shield takes the hit ──────────────
const SHIELD: Frame = ['.KKKK.', 'KwwwwK', 'KwggwK', 'KwggwK', 'KwwwgK', 'KwwwgK', '.KwgK.', '..KK..'];
const SHIELD_ARM: Dot[] = [[8, 10, 't'], [9, 10, 's']];
const INCOMING: Dot[] = [[25, 0, 'w'], [24, 1, 'w'], [23, 2, 'w'], [22, 3, 'g'], [21, 4, 'g'], [20, 5, 'w']];

function defenceSteps(pose: PoseFn): SpriteStep[] {
  const guard = pose({ rightArm: SHIELD_ARM, props: [[10, 5, SHIELD]] });
  const incoming = pose({ rightArm: SHIELD_ARM, props: [[10, 5, SHIELD]], dots: INCOMING });
  const hit = pose({
    dx: -1,
    headDy: 1,
    rightArm: SHIELD_ARM,
    props: [[11, 5, SHIELD], [18, 6, BURST]],
  });
  return [
    { frame: guard, ms: 450 },
    { frame: incoming, ms: 130 },
    { frame: hit, ms: 220, beat: true },
    { frame: guard, ms: 160 },
  ];
}

// ── Constitution: a heart swells and heals ─────────────────────────────────
const HEART_SMALL: Frame = ['.r.r.', 'rwrrr', '.rrr.', '..r..'];
const HEART_BIG: Frame = ['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..'];
const PLUS: Frame = ['.v.', 'vvv', '.v.'];

function constitutionSteps(pose: PoseFn): SpriteStep[] {
  const small = pose({ rightArm: ARM_UP, props: [[10, 4, HEART_SMALL]] });
  const swell = (plusAt: Array<[number, number]>): Frame =>
    pose({
      rightArm: ARM_UP,
      props: [[10, 2, HEART_BIG], ...plusAt.map(([x, y]): Layer => [x, y, PLUS])],
      dots: [[18, 0, 'w'], [9, 1, 'w']],
    });
  return [
    { frame: small, ms: 380 },
    { frame: swell([[18, 3]]), ms: 200, beat: true },
    { frame: swell([[18, 1], [-3, 4]]), ms: 200 },
    { frame: small, ms: 140 },
  ];
}

// ── Ranged: draw, loose, arrow lands in the target ─────────────────────────
const BOW: Frame = ['nn..', '..n.', '...n', '...n', '...n', '...n', '...n', '..n.', 'nn..'];
const TARGET: Layer = [23, 6, ['.rr.', 'rwwr', 'rwwr', 'rwwr', '.rr.']];
const TARGET_STAND: Layer = [24, 11, column('n', 5)];

const arrow = (tailX: number, tipX: number): Dot[] => [
  ...line(tailX, 8, tipX - 1, 8, 'n'),
  [tipX, 8, 'G'],
  [tailX, 7, 'r'],
  [tailX, 9, 'r'],
];

function rangedSteps(pose: PoseFn): SpriteStep[] {
  const scene = [TARGET_STAND, TARGET];
  const straightString = line(11, 5, 11, 11, 'w');
  const bentString = [...line(11, 5, 10, 8, 'w'), ...line(10, 8, 11, 11, 'w')];
  const bow: Layer = [11, 4, BOW];
  const aim = pose({ rightArm: ARM_UP, props: [bow], dots: [...straightString, ...arrow(12, 17)], scene });
  const draw = pose({ dx: -1, rightArm: ARM_UP, props: [bow], dots: [...bentString, ...arrow(10, 15)], scene });
  const fly = pose({
    rightArm: ARM_UP,
    props: [bow],
    dots: [...straightString, ...arrow(15, 20), [13, 7, 'w'], [12, 9, 'w']],
    scene,
  });
  const hit = pose({
    rightArm: ARM_UP,
    props: [bow],
    dots: [
      ...straightString,
      ...arrow(17, 23),
      [22, 5, 'y'], [27, 6, 'y'], [27, 10, 'y'], [22, 11, 'y'], [24, 4, 'w'],
    ],
    scene,
  });
  return [
    { frame: aim, ms: 400 },
    { frame: draw, ms: 260 },
    { frame: fly, ms: 100 },
    { frame: hit, ms: 300, beat: true },
  ];
}

// ── Prayer: offer bones — they glow, vanish, and the offering repeats ──────
const PRAY_RIGHT: Dot[] = [[8, 10, 't'], [7, 11, 't'], [6, 11, 't'], [5, 11, 's']];
const PRAY_LEFT: Dot[] = [[0, 10, 't'], [1, 11, 't'], [2, 11, 't'], [3, 11, 's']];

const halo = (char: string): Layer => [1, -3, ['..CCCC..', '.C....C.', '..CCCC..'].map((row) => row.replace(/C/g, char))];

const BONE: Frame = ['ii..ii', 'iIIIIi', 'ii..ii'];
const GLOWING_BONE: Frame = BONE.map((row) => row.replace(/[iI]/g, 'w'));
const BONE_SPOTS: Array<[number, number]> = [[12, 7], [12, 12]];
const bones = (art: Frame): Layer[] => BONE_SPOTS.map(([x, y]): Layer => [x, y, art]);

const BONE_AURA: Dot[] = [
  [11, 6, 'y'], [18, 6, 'y'], [11, 10, 'y'], [18, 10, 'y'], [11, 11, 'y'], [18, 11, 'y'], [11, 15, 'y'], [18, 15, 'y'],
];
const BONE_SPARKS: Dot[] = [[13, 5, 'y'], [16, 3, 'w'], [14, 1, 'y'], [17, 8, 'w'], [15, 10, 'y'], [13, 12, 'w'], [16, 13, 'y']];

function prayerSteps(pose: PoseFn): SpriteStep[] {
  const base = { rightArm: PRAY_RIGHT, leftArm: PRAY_LEFT };
  const hands: Dot = [4, 11, 's'];
  const praying = (props: Layer[], dots: Dot[] = [], headDy = 0): Frame =>
    pose({ ...base, headDy, props, dots: [hands, ...dots] });
  return [
    { frame: praying([halo('y'), ...bones(BONE)]), ms: 420 },
    { frame: praying([halo('y'), ...bones(BONE)], [[11, 5, 'y'], [18, 13, 'y']], 1), ms: 220 },
    { frame: praying([halo('w'), ...bones(GLOWING_BONE)], BONE_AURA), ms: 280, beat: true },
    { frame: praying([halo('w')], BONE_SPARKS), ms: 220 },
    { frame: praying([halo('y')]), ms: 300 },
  ];
}

// ── Magic: staff glows → charges → fireball flies off and bursts ───────────
const STAFF: Layer = [10, 0, column('n', 15)];
const ORB_IDLE: Layer = [9, -3, ['.P.', 'PcP', '.P.']];
const ORB_CHARGED: Layer = [8, -4, ['..c..', '.cwc.', 'cwwwc', '.cwc.', '..c..']];
const FIREBALL: Frame = ['.c.', 'cwc', '.c.'];

function magicSteps(pose: PoseFn): SpriteStep[] {
  const idle = pose({ rightArm: ARM_OUT, props: [STAFF, ORB_IDLE] });
  const charge = pose({
    rightArm: ARM_OUT,
    props: [STAFF, ORB_CHARGED],
    dots: [[6, -5, 'y'], [14, -3, 'y'], [12, -6, 'w'], [7, -1, 'c']],
  });
  const release = pose({ dx: 1, rightArm: ARM_OUT, props: [STAFF, ORB_CHARGED, [13, -3, FIREBALL]] });
  const flight = pose({
    rightArm: ARM_OUT,
    props: [STAFF, ORB_IDLE, [18, -3, FIREBALL]],
    dots: [[13, -2, 'c'], [14, -2, 'c'], [15, -2, 'c'], [16, -2, 'c'], [14, -3, 'w']],
  });
  const burst = pose({ rightArm: ARM_OUT, props: [STAFF, ORB_IDLE, [21, -5, BURST]] });
  return [
    { frame: idle, ms: 350 },
    { frame: charge, ms: 320 },
    { frame: release, ms: 150 },
    { frame: flight, ms: 150 },
    { frame: burst, ms: 260, beat: true },
  ];
}

// ── Necromancy: skull staff raises a spirit ────────────────────────────────
const SKULL: Layer = [8, -4, ['.www.', 'wKwKw', '.www.']];
const SKULL_STAFF: Layer = [10, -1, column('n', 16)];
const GHOST_SMALL: Frame = ['.v.', 'vvv', 'v.v'];
const GHOST: Frame = ['.vvv.', 'vKvKv', 'vvvvv', 'vvvvv', 'vvvvv', 'v.v.v'];
const NECRO_FLAMES: Dot[] = [[7, -5, 'v'], [13, -5, 'v'], [10, -6, 'v'], [6, -3, 'v'], [14, -3, 'v']];

function necromancySteps(pose: PoseFn): SpriteStep[] {
  const staff = (extra: { props?: Layer[]; dots?: Dot[] } = {}): Frame =>
    pose({ rightArm: ARM_OUT, props: [SKULL_STAFF, SKULL, ...(extra.props ?? [])], dots: extra.dots });
  return [
    { frame: staff(), ms: 360 },
    { frame: staff({ dots: NECRO_FLAMES }), ms: 300 },
    { frame: staff({ props: [[16, 4, GHOST_SMALL]], dots: NECRO_FLAMES }), ms: 180 },
    { frame: staff({ props: [[15, 2, GHOST]], dots: [...NECRO_FLAMES, [14, 1, 'w'], [21, 3, 'w'], [20, 8, 'w']] }), ms: 280, beat: true },
    { frame: staff({ props: [[15, -1, GHOST]], dots: [[14, -2, 'w'], [21, 0, 'w']] }), ms: 160 },
  ];
}

// ── Slayer: thrust at a slime, it flashes and bursts ───────────────────────
const SLIME: Frame = ['..KKKK..', '.KllllK.', 'KlKllKlK', 'KllllllK', 'KLLLLLLK', '.KKKKKK.'];
const SLIME_SQUASH: Frame = ['.KKKKKK.', 'KlKllKlK', 'KllllllK', 'KLLLLLLK', 'KKKKKKKK'];
const SLIME_AT = (art: Frame, squashed: boolean): Layer => [19, squashed ? 11 : 10, art];
const SWORD_THRUST: Layer[] = [[11, 9, ['y', '.', 'y']]];
const swordLine = (): Dot[] => [...line(12, 10, 16, 10, 'g'), [17, 10, 'G'], [11, 10, 'y']];

function slayerSteps(pose: PoseFn): SpriteStep[] {
  const ready = (art: Frame, squashed: boolean): Frame =>
    pose({ rightArm: ARM_OUT, props: SWORD_THRUST, dots: swordLine(), scene: [SLIME_AT(art, squashed)] });
  const thrust = pose({
    dx: 1,
    headDy: 1,
    rightArm: ARM_OUT,
    props: SWORD_THRUST,
    dots: swordLine(),
    scene: [SLIME_AT(flash(SLIME_SQUASH), true)],
    sceneDots: [[18, 9, 'y'], [18, 11, 'y'], [19, 8, 'w']],
  });
  const poof = pose({
    dx: 1,
    rightArm: ARM_OUT,
    props: SWORD_THRUST,
    dots: swordLine(),
    sceneDots: [[20, 11, 'l'], [22, 9, 'l'], [24, 11, 'l'], [23, 13, 'l'], [21, 13, 'w'], [25, 8, 'w'], [22, 12, 'y']],
  });
  return [
    { frame: ready(SLIME, false), ms: 300 },
    { frame: ready(SLIME_SQUASH, true), ms: 200 },
    { frame: thrust, ms: 220, beat: true },
    { frame: poof, ms: 300 },
  ];
}

export const COMBAT_SKILLS: Record<string, SkillDef> = {
  attack: { action: 'Overhead slash', xpPerBeat: 40, steps: attackSteps },
  strength: { action: 'Dumbbell curls', xpPerBeat: 35, steps: strengthSteps },
  defence: { action: 'Raising a shield', xpPerBeat: 30, steps: defenceSteps },
  constitution: { action: 'Healing heart', xpPerBeat: 30, steps: constitutionSteps },
  ranged: { action: 'Shooting a target', xpPerBeat: 40, steps: rangedSteps },
  prayer: { action: 'Praying for light', xpPerBeat: 45, steps: prayerSteps },
  magic: { action: 'Casting a fireball', xpPerBeat: 55, steps: magicSteps },
  necromancy: { action: 'Raising a spirit', xpPerBeat: 60, steps: necromancySteps },
  slayer: { action: 'Slaying a slime', xpPerBeat: 50, steps: slayerSteps },
};
