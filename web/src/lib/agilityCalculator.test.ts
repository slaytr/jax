import { describe, expect, it } from 'vitest';

import { xpForLevel } from '@shared/xp-table.js';
import { AGILITY_SKILL, agilityOptions, bestAt, buildRoute, formatHours, lapsNeeded, liveRoute, optimalSwitches, planAgility, unlocksInRange } from './agilityCalculator';

describe('agilityOptions', () => {
  it('flattens every course into at least one option', () => {
    const options = agilityOptions();
    expect(options.length).toBeGreaterThan(15);
    expect(options.every((option) => option.xpPerHour > 0)).toBe(true);
  });

  it('expands a variant course into one option per variant, inheriting the course wiki url', () => {
    const options = agilityOptions();
    const hefin = options.filter((option) => option.label.startsWith('Hefin Agility Course —'));
    expect(hefin).toHaveLength(5);
    expect(hefin.every((option) => option.wikiUrl === 'https://runescape.wiki/w/Hefin_Agility_Course')).toBe(true);
  });
});

describe('planAgility', () => {
  const options = agilityOptions();

  it('picks the highest xp/hour option the player already qualifies for', () => {
    const plan = planAgility(85, 3_600_000, 90, 4_000_000, options);
    expect(plan.segments[0].option.label).toBe('Advanced Gnome Stronghold Agility Course');
  });

  it('returns no plan below every course’s own level requirement', () => {
    // Never actually happens in the real game (Agility starts at 1, and
    // level 1 already has two courses) — the defensive branch for a level
    // with truly nothing unlocked yet.
    const plan = planAgility(0, 0, 10, 5000, options);
    expect(plan.segments).toEqual([]);
    expect(plan.hoursRemaining).toBe(0);
  });

  it('is a single segment when nothing along the way beats the starting course', () => {
    const plan = planAgility(85, 0, 90, 162_045, options);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].option.xpPerHour).toBe(162045);
    expect(plan.hoursRemaining).toBeCloseTo(1, 5);
  });

  it('estimates whole laps remaining, rounded up, within a segment', () => {
    const plan = planAgility(85, 0, 90, 1801, options);
    // Advanced Gnome Stronghold is 1800.5 xp/lap — 1801 needed takes 2 laps, not 1.
    expect(plan.segments[0].option.xpPerLap).toBe(1800.5);
    expect(plan.segments[0].laps).toBe(2);
  });

  it('has no laps figure for a segment with no per-lap shape of its own', () => {
    // Brimhaven's ticket mechanic (20,000 xp/hr) beats every other level-1
    // course, so it's the only segment here — and null laps rides along.
    const plan = planAgility(1, 0, 1, 100, options);
    expect(plan.segments[0].option.label).toBe('Brimhaven Agility Arena');
    expect(plan.segments[0].laps).toBeNull();
    expect(lapsNeeded(plan.segments[0].option, plan.segments[0].xpInSegment)).toBeNull();
  });

  it('splits into one segment per course actually worth switching to, skipping same-level losers', () => {
    // Ape Atoll (48) leads until Bandos unlocks at 60 — Werewolf unlocks at
    // the very same level but never wins the tie, so it gets no segment of
    // its own. Het's Oasis unlocks right at the target level (65) with
    // nothing left to train there, so it's dropped as a trailing zero-xp
    // segment rather than shown as a third leg of the route.
    const plan = planAgility(55, 0, 65, xpForLevel(AGILITY_SKILL, 65)!, options);
    const labels = plan.segments.map((segment) => segment.option.label);
    expect(labels).toEqual(['Ape Atoll Agility Course', 'Bandos Agility Course']);
    expect(plan.segments[0].fromLevel).toBe(55);
    expect(plan.segments[0].toLevel).toBe(60);
    expect(plan.segments[1].fromLevel).toBe(60);
    expect(plan.segments[1].toLevel).toBe(65);
  });

  it('sums every segment’s own hours into the total', () => {
    const plan = planAgility(55, 0, 65, xpForLevel(AGILITY_SKILL, 65)!, options);
    const total = plan.segments.reduce((sum, segment) => sum + segment.hours, 0);
    expect(plan.hoursRemaining).toBeCloseTo(total, 10);
  });
});

describe('unlocksInRange', () => {
  const options = agilityOptions();

  it('includes every option unlocking in range, not just the ones worth switching to', () => {
    const unlocks = unlocksInRange(55, 65, options);
    const labels = unlocks.map((option) => option.label);
    expect(labels).toContain('Werewolf Agility Course');
    expect(labels).toContain('Bandos Agility Course');
    expect(labels).toContain("Het's Oasis Agility Course");
  });

  it('orders by level first, fastest first within a level', () => {
    const unlocks = unlocksInRange(55, 65, options);
    const atSixty = unlocks.filter((option) => option.levelRequirement === 60);
    expect(atSixty.map((option) => option.label)).toEqual(['Bandos Agility Course', 'Werewolf Agility Course']);
  });

  it('excludes the current level and anything past the target', () => {
    const unlocks = unlocksInRange(60, 60, options);
    expect(unlocks).toEqual([]);
  });
});

describe('optimalSwitches', () => {
  const options = agilityOptions();

  it('picks every level whose fastest newly-unlocked option beats what came before it', () => {
    // Both Bandos (60) and Het's Oasis (65) genuinely beat the course
    // before them — this is a level-range computation, so it includes
    // Het's Oasis here even though planAgility's own final route (bounded
    // by an actual target xp) later drops it as a zero-xp trailing switch.
    const switches = optimalSwitches(55, 65, options);
    expect(switches.map((option) => option.label)).toEqual(['Bandos Agility Course', "Het's Oasis Agility Course"]);
  });

  it('is empty when nothing in range ever beats the starting course', () => {
    expect(optimalSwitches(85, 89, options)).toEqual([]);
  });
});

describe('buildRoute', () => {
  const options = agilityOptions();

  it('honours a deliberately slower switch a viewer picked themselves', () => {
    const start = bestAt(options, 55)!; // Ape Atoll
    const werewolf = options.find((option) => option.label === 'Werewolf Agility Course')!;
    const target = xpForLevel(AGILITY_SKILL, 65)!;

    const route = buildRoute(55, 0, 65, target, start, [werewolf]);
    // Not what optimalSwitches would pick (Bandos), but buildRoute doesn't
    // second-guess an explicit choice.
    expect(route.map((segment) => segment.option.label)).toEqual(['Ape Atoll Agility Course', 'Werewolf Agility Course']);
  });

  it('produces the same route as planAgility when fed optimalSwitches', () => {
    const start = bestAt(options, 55)!;
    const route = buildRoute(55, 0, 65, xpForLevel(AGILITY_SKILL, 65)!, start, optimalSwitches(55, 65, options));
    const plan = planAgility(55, 0, 65, xpForLevel(AGILITY_SKILL, 65)!, options);
    expect(route.map((segment) => segment.option.label)).toEqual(plan.segments.map((segment) => segment.option.label));
  });

  it('with no switches at all, trains the starting course the whole way', () => {
    const start = bestAt(options, 55)!;
    const route = buildRoute(55, 0, 65, xpForLevel(AGILITY_SKILL, 65)!, start, []);
    expect(route).toHaveLength(1);
    expect(route[0].fromLevel).toBe(55);
    expect(route[0].toLevel).toBe(65);
  });
});

describe('liveRoute', () => {
  const options = agilityOptions();

  it('matches buildRoute exactly when the player hasn’t reached any saved switch yet', () => {
    const start = bestAt(options, 55)!; // Ape Atoll
    const bandos = options.find((option) => option.label === 'Bandos Agility Course')!;
    const target = xpForLevel(AGILITY_SKILL, 65)!;

    const live = liveRoute(55, 0, 65, target, start, [bandos]);
    const built = buildRoute(55, 0, 65, target, start, [bandos]);
    expect(live.map((segment) => segment.option.label)).toEqual(built.map((segment) => segment.option.label));
  });

  it('picks up on whichever saved switch the player has already reached, instead of starting from level 0 xp for it', () => {
    const start = bestAt(options, 55)!; // Ape Atoll
    const bandos = options.find((option) => option.label === 'Bandos Agility Course')!;
    const target = xpForLevel(AGILITY_SKILL, 65)!;

    // Saved while still level 55; the player's since reached level 62,
    // already past the saved Bandos switch (60) — the route should train
    // Bandos from the player's real current xp, not silently rewind to
    // level 60's own threshold.
    const currentXp = xpForLevel(AGILITY_SKILL, 62)! + 5000;
    const route = liveRoute(62, currentXp, 65, target, start, [bandos]);

    expect(route).toHaveLength(1);
    expect(route[0].option.label).toBe('Bandos Agility Course');
    expect(route[0].fromLevel).toBe(62);
    expect(route[0].xpInSegment).toBe(target - currentXp);
  });

  it('drops a saved switch entirely once the player has already passed the target it was for', () => {
    const start = bestAt(options, 55)!;
    const bandos = options.find((option) => option.label === 'Bandos Agility Course')!;
    const hetsOasis = options.find((option) => option.label === "Het's Oasis Agility Course")!;
    const target = xpForLevel(AGILITY_SKILL, 70)!;

    // Player is already level 66 — past both saved switches (60 and 65) —
    // so the effective start is Het's Oasis (the later of the two), and
    // neither switch appears as a segment of its own any more.
    const route = liveRoute(66, xpForLevel(AGILITY_SKILL, 66)!, 70, target, start, [bandos, hetsOasis]);
    expect(route.map((segment) => segment.option.label)).toEqual(["Het's Oasis Agility Course"]);
  });
});

describe('formatHours', () => {
  it('shows whole minutes under an hour', () => {
    expect(formatHours(0.5)).toBe('30m');
  });

  it('shows one decimal place under ten hours', () => {
    expect(formatHours(4.25)).toBe('4.3h');
  });

  it('rounds to whole hours past ten', () => {
    expect(formatHours(123.4)).toBe('123h');
  });

  it('reads as done at or past the target', () => {
    expect(formatHours(0)).toBe('Done');
  });
});
