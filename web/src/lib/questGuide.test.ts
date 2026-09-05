import { describe, expect, it } from 'vitest';

import { normalizeQuestGuide, splitNotation } from './questGuide';

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
    expect(normalizeQuestGuide({})).toEqual({ itemsRequired: [], rewards: [], sections: [] });
  });

  it('keeps a real rewards list untouched', () => {
    const rewards = [
      { label: null, items: ['3 quest points', '3,500 Farming experience'] },
      { label: 'Music unlocked', items: ['Crystal Cave'] },
    ];
    expect(normalizeQuestGuide({ items_required: [], sections: [], rewards }).rewards).toEqual(rewards);
  });

  it('pulls a step’s trailing dialogue notation into its own field', () => {
    const sections = [
      {
        heading: 'A vampyric threat',
        needed: null,
        recommended: null,
        notes: [],
        steps: [{ text: 'Talk to Morgan in Draynor Village. (2•✓)', substeps: [], notes: [] }],
      },
    ];
    const step = normalizeQuestGuide({ items_required: [], sections }).sections[0].steps[0];
    expect(step.text).toBe('Talk to Morgan in Draynor Village.');
    expect(step.notation).toBe('2•✓');
  });

  it('recurses into substeps for notation too', () => {
    const sections = [
      {
        heading: 'Getting started',
        needed: null,
        recommended: null,
        notes: [],
        steps: [{ text: 'Do the chores:', substeps: [{ text: 'Give Unferth a haircut. (2)', substeps: [], notes: [] }], notes: [] }],
      },
    ];
    const step = normalizeQuestGuide({ items_required: [], sections }).sections[0].steps[0].substeps[0];
    expect(step.text).toBe('Give Unferth a haircut.');
    expect(step.notation).toBe('2');
  });

  it('leaves a step with no notation untouched', () => {
    const sections = [{ heading: 'x', needed: null, recommended: null, notes: [], steps: [{ text: 'Enter the rift.', substeps: [], notes: [] }] }];
    const step = normalizeQuestGuide({ items_required: [], sections }).sections[0].steps[0];
    expect(step.text).toBe('Enter the rift.');
    expect(step.notation).toBeNull();
  });
});

describe('splitNotation', () => {
  it('extracts a plain digit-chain notation', () => {
    expect(splitNotation('Talk to Dr Harlow. (2)')).toEqual({ text: 'Talk to Dr Harlow.', notation: '2' });
  });

  it('extracts a bullet-chained notation with a checkmark', () => {
    expect(splitNotation('Talk to Morgan. (2•✓)')).toEqual({ text: 'Talk to Morgan.', notation: '2•✓' });
  });

  it('extracts a tilde-only notation', () => {
    expect(splitNotation('Watch the cutscene. (~)')).toEqual({ text: 'Watch the cutscene.', notation: '~' });
  });

  it('extracts the "N or M" and "[Varies]" hand-restored variants', () => {
    expect(splitNotation('Return to Malignius. (2 or 1)')).toEqual({ text: 'Return to Malignius.', notation: '2 or 1' });
    expect(splitNotation("Go directly west and talk to Captain Braindeath. ([Varies]•3)")).toEqual({
      text: 'Go directly west and talk to Captain Braindeath.',
      notation: '[Varies]•3',
    });
  });

  it('does not treat a genuine prose parenthetical as notation', () => {
    expect(splitNotation('Most of the enemies are weak to magic (earth or fire spells)')).toEqual({
      text: 'Most of the enemies are weak to magic (earth or fire spells)',
      notation: null,
    });
  });

  it('only strips the trailing parenthetical, leaving an earlier genuine one alone', () => {
    expect(splitNotation('Speak to Grand Vizier Ehsan (Merchant) also in the same building. (1•~)')).toEqual({
      text: 'Speak to Grand Vizier Ehsan (Merchant) also in the same building.',
      notation: '1•~',
    });
  });

  it('returns the text unchanged with a null notation when there is nothing to strip', () => {
    expect(splitNotation('Enter the rift.')).toEqual({ text: 'Enter the rift.', notation: null });
  });
});
