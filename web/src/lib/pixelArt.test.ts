import { describe, expect, it } from 'vitest';

import { blankFrame, compose, frameToRects, stamp } from './pixelArt';

describe('stamp', () => {
  it('overlays opaque pixels and leaves transparent ones alone', () => {
    const base = ['aaa', 'aaa'];
    expect(stamp(base, 1, 0, ['b.', '.c'])).toEqual(['aba', 'aac']);
  });

  it('does not mutate the base frame', () => {
    const base = ['...'];
    stamp(base, 0, 0, ['x']);
    expect(base).toEqual(['...']);
  });

  it('clips art that falls outside the frame', () => {
    expect(stamp(['..'], 1, 0, ['xyz'])).toEqual(['.x']);
    expect(stamp(['..'], 0, 5, ['x'])).toEqual(['..']);
    expect(stamp(['..'], -1, 0, ['xy'])).toEqual(['y.']);
  });
});

describe('compose', () => {
  it('applies layers in order, later on top', () => {
    expect(compose(blankFrame(2, 1), [[0, 0, ['a']], [0, 0, ['b']]])).toEqual(['b.']);
  });
});

describe('frameToRects', () => {
  it('merges horizontal runs and skips transparent or unknown pixels', () => {
    const rects = frameToRects(['aab.z', '.a...'], { a: '#111', b: '#222' });
    expect(rects).toEqual([
      { x: 0, y: 0, w: 2, fill: '#111' },
      { x: 2, y: 0, w: 1, fill: '#222' },
      { x: 1, y: 1, w: 1, fill: '#111' },
    ]);
  });
});
