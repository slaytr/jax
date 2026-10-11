import { describe, expect, it } from 'vitest';

import { flash, line } from './spriteKit';

describe('line', () => {
  it('includes both endpoints on a horizontal run', () => {
    expect(line(2, 5, 5, 5, 'x')).toEqual([[2, 5, 'x'], [3, 5, 'x'], [4, 5, 'x'], [5, 5, 'x']]);
  });

  it('walks a diagonal one pixel at a time, in either direction', () => {
    expect(line(0, 0, 2, 2, 'x').map(([x, y]) => [x, y])).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(line(2, 2, 0, 0, 'x').map(([x, y]) => [x, y])).toEqual([[2, 2], [1, 1], [0, 0]]);
  });

  it('returns a single dot when the endpoints match', () => {
    expect(line(3, 3, 3, 3, 'x')).toEqual([[3, 3, 'x']]);
  });
});

describe('flash', () => {
  it('whitens fill pixels but keeps the outline and transparency', () => {
    expect(flash(['.KlK', 'KLlK'])).toEqual(['.KwK', 'KwwK']);
  });
});
