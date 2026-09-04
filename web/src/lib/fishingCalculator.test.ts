import { describe, expect, it } from 'vitest';

import { xpForLevel } from '@shared/xp-table.js';
import { FISHING_SKILL, bestAt, buildRoute, catchesNeeded, fishingOptions, formatHours, liveRoute, optimalSwitches, planFishing, unlocksInRange } from './fishingCalculator';

describe('fishingOptions', () => {
  it('flattens every method with a usable xp/hour figure', () => {
    const options = fishingOptions();
    expect(options.length).toBeGreaterThan(40);
    expect(options.every((option) => option.xpPerHour > 0)).toBe(true);
  });

  it('drops methods with no published catch-chance data', () => {
    const options = fishingOptions();
    expect(options.some((option) => option.label === 'Giant crayfish')).toBe(false);
    expect(options.some((option) => option.label === 'Fungal algae')).toBe(false);
    expect(options.some((option) => option.label === 'Enriched fungal algae')).toBe(false);
  });

  it('keeps a method with no per-catch shape (Fishing frenzy) as an option with null xpPerCatch', () => {
    const frenzy = fishingOptions().find((option) => option.label === 'Fishing frenzy');
    expect(frenzy).toBeDefined();
    expect(frenzy!.xpPerCatch).toBeNull();
    expect(frenzy!.xpPerHour).toBe(285000);
  });
});

describe('planFishing', () => {
  const options = fishingOptions();

  it('picks the highest xp/hour option the player already qualifies for', () => {
    const plan = planFishing(70, 0, 75, 100_000, options);
    expect(plan.segments[0].option.label).toBe('Karambwan');
  });

  it('returns no plan below every method’s own level requirement', () => {
    const plan = planFishing(0, 0, 5, 5000, options);
    expect(plan.segments).toEqual([]);
    expect(plan.hoursRemaining).toBe(0);
  });

  it('is a single segment when nothing along the way beats the starting method', () => {
    const plan = planFishing(94, 0, 94, 5000, options);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].option.label).toBe('Fishing frenzy');
    expect(plan.segments[0].option.xpPerHour).toBe(285000);
  });

  it('estimates whole catches remaining, rounded up, within a segment', () => {
    const plan = planFishing(20, 0, 20, 101, options);
    // Trout is 50 xp/catch — 101 needed takes 3 catches, not 2.
    expect(plan.segments[0].option.label).toBe('Trout');
    expect(plan.segments[0].option.xpPerCatch).toBe(50);
    expect(plan.segments[0].catches).toBe(3);
  });

  it('has no catches figure for a segment with no per-catch shape of its own', () => {
    const plan = planFishing(94, 0, 94, 5000, options);
    expect(plan.segments[0].catches).toBeNull();
    expect(catchesNeeded(plan.segments[0].option, plan.segments[0].xpInSegment)).toBeNull();
  });

  it('splits into one segment per method actually worth switching to', () => {
    const plan = planFishing(55, 0, 70, xpForLevel(FISHING_SKILL, 70)!, options);
    const labels = plan.segments.map((segment) => segment.option.label);
    expect(labels).toEqual(['Trout', 'Karambwan']);
    expect(plan.segments[0].fromLevel).toBe(55);
    expect(plan.segments[0].toLevel).toBe(65);
    expect(plan.segments[1].fromLevel).toBe(65);
    expect(plan.segments[1].toLevel).toBe(70);
  });

  it('sums every segment’s own hours into the total', () => {
    const plan = planFishing(55, 0, 70, xpForLevel(FISHING_SKILL, 70)!, options);
    const total = plan.segments.reduce((sum, segment) => sum + segment.hours, 0);
    expect(plan.hoursRemaining).toBeCloseTo(total, 10);
  });
});

describe('unlocksInRange', () => {
  const options = fishingOptions();

  it('includes every option unlocking in range, not just the ones worth switching to', () => {
    const unlocks = unlocksInRange(30, 40, options);
    const labels = unlocks.map((option) => option.label);
    expect(labels).toContain('Frog spawn');
    expect(labels).toContain('Tuna');
    expect(labels).toContain('Rainbow fish');
    expect(labels).toContain('Cave eel');
  });

  it('orders by level first, fastest first within a level', () => {
    const unlocks = unlocksInRange(30, 40, options);
    // Cave eel and Rainbow fish both unlock at 38 — Cave eel's own 37500
    // xp/hr beats Rainbow fish's 30000.
    const atThirtyEight = unlocks.filter((option) => option.levelRequirement === 38);
    expect(atThirtyEight.map((option) => option.label)).toEqual(['Cave eel', 'Rainbow fish']);
  });

  it('excludes the current level and anything past the target', () => {
    const unlocks = unlocksInRange(38, 38, options);
    expect(unlocks).toEqual([]);
  });
});

describe('optimalSwitches', () => {
  const options = fishingOptions();

  it('picks every level whose fastest newly-unlocked option beats what came before it', () => {
    // Trout (level 20, 56250 xp/hr) is the best option already unlocked at
    // 55 — nothing between there and Karambwan (65, 153808.6) beats it.
    const switches = optimalSwitches(55, 70, options);
    expect(switches.map((option) => option.label)).toEqual(['Karambwan']);
  });

  it('is empty when nothing in range ever beats the starting method', () => {
    expect(optimalSwitches(65, 69, options)).toEqual([]);
  });
});

describe('buildRoute', () => {
  const options = fishingOptions();

  it('honours a deliberately slower switch a viewer picked themselves', () => {
    const start = bestAt(options, 55)!; // Trout
    const catfish = options.find((option) => option.label === 'Catfish')!;
    const target = xpForLevel(FISHING_SKILL, 65)!;

    const route = buildRoute(55, 0, 65, target, start, [catfish]);
    // Not what optimalSwitches would pick (Karambwan doesn't unlock until
    // 65, so nothing beats Trout before then) — buildRoute doesn't
    // second-guess an explicit choice either way.
    expect(route.map((segment) => segment.option.label)).toEqual(['Trout', 'Catfish']);
  });

  it('produces the same route as planFishing when fed optimalSwitches', () => {
    const start = bestAt(options, 55)!;
    const route = buildRoute(55, 0, 70, xpForLevel(FISHING_SKILL, 70)!, start, optimalSwitches(55, 70, options));
    const plan = planFishing(55, 0, 70, xpForLevel(FISHING_SKILL, 70)!, options);
    expect(route.map((segment) => segment.option.label)).toEqual(plan.segments.map((segment) => segment.option.label));
  });

  it('with no switches at all, trains the starting method the whole way', () => {
    const start = bestAt(options, 55)!;
    const route = buildRoute(55, 0, 65, xpForLevel(FISHING_SKILL, 65)!, start, []);
    expect(route).toHaveLength(1);
    expect(route[0].fromLevel).toBe(55);
    expect(route[0].toLevel).toBe(65);
  });
});

describe('liveRoute', () => {
  const options = fishingOptions();

  it('matches buildRoute exactly when the player hasn’t reached any saved switch yet', () => {
    const start = bestAt(options, 55)!; // Trout
    const karambwan = options.find((option) => option.label === 'Karambwan')!;
    const target = xpForLevel(FISHING_SKILL, 70)!;

    const live = liveRoute(55, 0, 70, target, start, [karambwan]);
    const built = buildRoute(55, 0, 70, target, start, [karambwan]);
    expect(live.map((segment) => segment.option.label)).toEqual(built.map((segment) => segment.option.label));
  });

  it('picks up on whichever saved switch the player has already reached, instead of starting from level 0 xp for it', () => {
    const start = bestAt(options, 55)!; // Trout
    const karambwan = options.find((option) => option.label === 'Karambwan')!;
    const target = xpForLevel(FISHING_SKILL, 70)!;

    // Saved while still level 55; the player's since reached level 66,
    // already past the saved Karambwan switch (65) — the route should
    // train Karambwan from the player's real current xp, not silently
    // rewind to level 65's own threshold.
    const currentXp = xpForLevel(FISHING_SKILL, 66)! + 5000;
    const route = liveRoute(66, currentXp, 70, target, start, [karambwan]);

    expect(route).toHaveLength(1);
    expect(route[0].option.label).toBe('Karambwan');
    expect(route[0].fromLevel).toBe(66);
    expect(route[0].xpInSegment).toBe(target - currentXp);
  });
});

describe('formatHours (re-exported from agilityCalculator)', () => {
  it('is the same generic hour formatter', () => {
    expect(formatHours(0.5)).toBe('30m');
    expect(formatHours(0)).toBe('Done');
  });
});
