import { TRACKED_SKILLS, colourForPlayer } from '@shared/config.js';
import { describe, expect, it } from 'vitest';

import { PLAYER_SPRITES, skillSpritesFor, stateSpritesFor } from './playerSprites';
import { HEIGHT, WIDTH } from './skillSprites';

const ALL_SPRITES = (player: (typeof PLAYER_SPRITES)[number]) => [...skillSpritesFor(player), ...stateSpritesFor(player)];
const PLAYERS = PLAYER_SPRITES.map((p) => [p.name, p] as const);

describe('PLAYER_SPRITES', () => {
  it('has one sprite per roster player, tagged with the pinned theme colour', () => {
    expect(PLAYER_SPRITES.map((p) => p.slug).sort()).toEqual(
      ['bloyze', 'cpt-draynor', 'highlordwhos', 'jelly-tax', 'melooms'],
    );
    for (const player of PLAYER_SPRITES) {
      expect(player.colour).toBe(colourForPlayer(player.slug, PLAYER_SPRITES.indexOf(player)));
    }
  });

  it('dresses everyone in their theme colour except HighlordWhos, who wears a dark purple hoodie', () => {
    for (const player of PLAYER_SPRITES) {
      if (player.slug === 'highlordwhos') continue;
      expect(player.palette.t, player.name).toBe(player.colour);
    }
    const hoodie = PLAYER_SPRITES.find((p) => p.slug === 'highlordwhos')!;
    expect(hoodie.palette.t).not.toBe(hoodie.colour);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hoodie.palette.t.slice(i, i + 2), 16));
    expect(Math.max(r, g, b), 'dark').toBeLessThan(110);
    expect(b, 'purple: blue leads, then red, green lowest').toBeGreaterThan(r);
    expect(r).toBeGreaterThan(g);
  });

  it.each(PLAYERS)('%s: head and body keep the shared footprint', (_name, player) => {
    expect(player.look.head).toHaveLength(9);
    expect(player.look.head.every((row) => row.length === 10)).toBe(true);
    expect(player.look.body).toHaveLength(7);
    expect(player.look.body.every((row) => row.length === 9)).toBe(true);
  });
});

describe('skillSpritesFor', () => {
  it.each(PLAYERS)('%s: has an animation for every tracked skill, in matrix order', (_name, player) => {
    expect(skillSpritesFor(player).map((s) => s.id)).toEqual(TRACKED_SKILLS.map((s: { slug: string }) => s.slug));
  });

  it('is memoised per player', () => {
    expect(skillSpritesFor(PLAYER_SPRITES[0])).toBe(skillSpritesFor(PLAYER_SPRITES[0]));
  });

  it.each(PLAYERS)('%s: every frame is canvas-sized and fully coloured', (_name, player) => {
    for (const sprite of ALL_SPRITES(player)) {
      for (const { frame } of sprite.steps) {
        expect(frame, sprite.id).toHaveLength(HEIGHT);
        expect(frame.every((row) => row.length === WIDTH), sprite.id).toBe(true);
        const unknown = [...new Set(frame.join('').replace(/\./g, ''))].filter((char) => !player.palette[char]);
        expect(unknown, sprite.id).toEqual([]);
      }
    }
  });

  it('gives each animation exactly one beat and at least three frames', () => {
    for (const sprite of skillSpritesFor(PLAYER_SPRITES[0])) {
      expect(sprite.steps.filter((step) => step.beat), sprite.id).toHaveLength(1);
      expect(sprite.steps.length, sprite.id).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(PLAYERS)('%s: has sleeping and vacation downtime animations with no XP', (_name, player) => {
    const states = stateSpritesFor(player);
    expect(states.map((s) => s.id)).toEqual(['sleeping', 'vacation']);
    for (const state of states) {
      expect(state.xpPerBeat, state.id).toBe(0);
      expect(state.steps.some((step) => step.beat), state.id).toBe(false);
      expect(state.steps.length, state.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('actually animates: no two consecutive frames within a loop are identical', () => {
    for (const sprite of ALL_SPRITES(PLAYER_SPRITES[0])) {
      sprite.steps.slice(0, -1).forEach((step, i) => {
        const next = sprite.steps[i + 1];
        expect(step.frame.join('\n') === next.frame.join('\n'), `${sprite.id} frame ${i}`).toBe(false);
      });
    }
  });
});
