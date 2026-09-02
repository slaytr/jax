import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import GainsGrid from './GainsGrid.vue';

const player = (slug: string) => ({ slug, name: slug, colour: '#000' });

describe('GainsGrid', () => {
  it('renders a bare empty slot (not an omitted column) for a player with zero gain', () => {
    // A 5-column grid with only 2 real gainers — the other 3 must still
    // occupy their column as .lb-entry-empty, not be missing entirely,
    // or the grid's fixed 5-column layout would show the wrong gap colour.
    const rows = [
      { player: player('alpha'), total: 100, bySkill: [] },
      { player: player('beta'), total: 50, bySkill: [] },
      { player: player('gamma'), total: 0, bySkill: [] },
      { player: player('delta'), total: 0, bySkill: [] },
      { player: player('epsilon'), total: 0, bySkill: [] },
    ];
    const wrapper = mount(GainsGrid, {
      props: {
        levels: { rows },
        xp: { rows: [] },
        quests: { rows: [] },
        selectedPlayer: null,
      },
    });

    const levelsBand = wrapper.findAll('.lb-band')[0];
    const entries = levelsBand.findAll('.lb-entry');
    expect(entries).toHaveLength(5);

    const empties = levelsBand.findAll('.lb-entry-empty');
    expect(empties).toHaveLength(3);
    // Every empty slot is a plain div, not a clickable button.
    for (const empty of empties) expect(empty.element.tagName).toBe('DIV');
  });

  it('renders no medal/Slacker ribbon banners', () => {
    const rows = [
      { player: player('alpha'), total: 100, bySkill: [] },
      { player: player('beta'), total: 80, bySkill: [] },
      { player: player('gamma'), total: 60, bySkill: [] },
      { player: player('delta'), total: 10, bySkill: [] },
      { player: player('epsilon'), total: 0, bySkill: [] },
    ];
    const wrapper = mount(GainsGrid, {
      props: { levels: { rows }, xp: { rows: [] }, quests: { rows: [] }, selectedPlayer: null },
    });

    expect(wrapper.find('.lb-ribbon').exists()).toBe(false);
  });

  it('renders a Hot ribbon only on the band whose leader is the hot slug', () => {
    const rows = [
      { player: player('alpha'), total: 100, bySkill: [] },
      { player: player('beta'), total: 80, bySkill: [] },
    ];
    const wrapper = mount(GainsGrid, {
      props: {
        levels: { rows },
        xp: { rows },
        quests: { rows: [] },
        hotLevelsSlug: 'alpha',
        hotXpSlug: null,
        selectedPlayer: null,
      },
    });

    const [levelsBand, xpBand] = wrapper.findAll('.lb-band');
    expect(levelsBand.find('.lb-ribbon').text()).toBe('Hot');
    expect(xpBand.find('.lb-ribbon').exists()).toBe(false);
  });

  it('never puts the Hot ribbon on a non-leading entry, even if that slug matches', () => {
    // hotLevelsSlug naming a lower-place player shouldn't happen in
    // practice (hotSlugFor only ever names the current leader), but the
    // template's own per-row check should still only ever match the row
    // that slug actually belongs to.
    const rows = [
      { player: player('alpha'), total: 100, bySkill: [] },
      { player: player('beta'), total: 80, bySkill: [] },
    ];
    const wrapper = mount(GainsGrid, {
      props: { levels: { rows }, xp: { rows: [] }, quests: { rows: [] }, hotLevelsSlug: 'beta', selectedPlayer: null },
    });

    const entries = wrapper.findAll('.lb-band')[0].findAll('.lb-entry');
    expect(entries[0].find('.lb-ribbon').exists()).toBe(false);
    expect(entries[1].find('.lb-ribbon').exists()).toBe(true);
  });
});
