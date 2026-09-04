import { describe, expect, it } from 'vitest';

import { normalizeQuestGuide } from './questGuide';

describe('normalizeQuestGuide', () => {
  it('reads a lone "None" entry as no items required', () => {
    expect(normalizeQuestGuide({ items_required: ['None'], sections: [] }).itemsRequired).toEqual([]);
  });

  it('is case/whitespace-insensitive about the "None" sentinel', () => {
    expect(normalizeQuestGuide({ items_required: [' none '], sections: [] }).itemsRequired).toEqual([]);
  });

  it('keeps a real items list untouched', () => {
    const items = ['A ghostspeak amulet', '50 coins'];
    expect(normalizeQuestGuide({ items_required: items, sections: [] }).itemsRequired).toEqual(items);
  });

  it('does not treat "None" as the sentinel when it is one of several items', () => {
    const items = ['None', 'A hammer'];
    expect(normalizeQuestGuide({ items_required: items, sections: [] }).itemsRequired).toEqual(items);
  });

  it('defaults a section with no screenshots field to an empty array', () => {
    const sections = [{ heading: 'Getting started', needed: null, recommended: null, notes: [], steps: [] }];
    expect(normalizeQuestGuide({ items_required: [], sections }).sections).toEqual([{ ...sections[0], screenshots: [] }]);
  });

  it('keeps a section that already has screenshots untouched', () => {
    const shot = { src: 'https://runescape.wiki/images/x.png', width: 10, height: 20 };
    const sections = [{ heading: 'Getting started', needed: null, recommended: null, notes: [], steps: [], screenshots: [shot] }];
    expect(normalizeQuestGuide({ items_required: [], sections }).sections).toEqual(sections);
  });

  it('defaults missing fields to empty rather than throwing', () => {
    expect(normalizeQuestGuide({})).toEqual({ itemsRequired: [], sections: [] });
  });
});
