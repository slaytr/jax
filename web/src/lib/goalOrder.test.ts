import { describe, expect, it } from 'vitest';

import { applyCustomOrder, moveInOrder } from './goalOrder';

describe('applyCustomOrder', () => {
  it('sorts items by their position in order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(applyCustomOrder(items, ['c', 'a', 'b'], (i) => i.id).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('leaves an unnamed item after every named one, in its own original relative order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(applyCustomOrder(items, ['b'], (i) => i.id).map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op for an empty order', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(applyCustomOrder(items, [], (i) => i.id)).toEqual(items);
  });
});

describe('moveInOrder', () => {
  it('moves an id to sit just before the target', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('moves an id to the end when the target is null', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
  });

  it('moves an id later in the list correctly', () => {
    expect(moveInOrder(['a', 'b', 'c', 'd'], 'a', 'd')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('falls back to the end when the target id is not found', () => {
    expect(moveInOrder(['a', 'b'], 'a', 'not-there')).toEqual(['b', 'a']);
  });

  it('returns every id currentIds names, dragged one included', () => {
    const result = moveInOrder(['a', 'b', 'c'], 'b', 'c');
    expect(result.sort()).toEqual(['a', 'b', 'c']);
  });
});
