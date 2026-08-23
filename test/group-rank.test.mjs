import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGroupRank } from '../scripts/group-rank.mjs';

/**
 * Reproduces the real page structure: the RSC flight payload is delivered as
 * `self.__next_f.push([1,"<json string literal>"])` calls whose decoded contents
 * concatenate into one document. Shape captured from the live page on
 * 2026-08-23 (pageNumber 52, size 20, totalElements 2017 → Jax at rank 1048).
 */
function buildPage(groupPage, { split = 1 } = {}) {
  const payload = `3:["$","div",null,{"props":{"data":{"groups":${JSON.stringify(groupPage)}}}}]`;
  const size = Math.ceil(payload.length / split);

  const pushes = [];
  for (let i = 0; i < payload.length; i += size) {
    pushes.push(`self.__next_f.push([1,${JSON.stringify(payload.slice(i, i + size))}])`);
  }
  return `<!doctype html><html><body><script>${pushes.join(';')}</script></body></html>`;
}

const group = (name, level, xp, extra = {}) => ({
  founder: false,
  groupTotalLevel: level,
  groupTotalXp: xp,
  id: Math.abs(level * 7 + xp) % 100000,
  isCompetitive: true,
  name,
  size: 5,
  toHighlight: false,
  ...extra,
});

const GROUP_PAGE = {
  content: [
    group('v+givaldurid', 5872, 112097070),
    group('rijwielcentrale', 5868, 60998940),
    group('dargon hunters', 5867, 43318588),
    group('Jax', 5862, 38488897, { toHighlight: true, id: 447161 }),
    group('coolkids 2 0', 5859, 30802180, { founder: true }),
    group('arcane citadel', 5846, 41177349),
    group('treefiddy', 5838, 39946869),
  ],
  numberOfElements: 7,
  // Zero-based page index, as the live payload uses.
  pageNumber: 52,
  size: 20,
  totalElements: 2017,
  totalPages: 101,
};

describe('parseGroupRank', () => {
  it('derives the ladder rank from the zero-based page number and position', () => {
    const result = parseGroupRank(buildPage(GROUP_PAGE), 'Jax');

    assert.equal(result.ok, true);
    // 52 * 20 + index 3 + 1
    assert.equal(result.rank, 1044);
    assert.equal(result.name, 'Jax');
    assert.equal(result.totalLevel, 5862);
    assert.equal(result.totalXp, 38488897);
    assert.equal(result.totalGroups, 2017);
    assert.equal(result.id, 447161);
  });

  it('reassembles a payload split across several push chunks', () => {
    const whole = parseGroupRank(buildPage(GROUP_PAGE), 'Jax');
    const split = parseGroupRank(buildPage(GROUP_PAGE, { split: 9 }), 'Jax');

    assert.equal(split.ok, true);
    assert.deepEqual(split, whole, 'chunking must not change the result');
  });

  it('marks exactly one rival as us and ranks neighbours consecutively', () => {
    const { rivals } = parseGroupRank(buildPage(GROUP_PAGE), 'Jax');

    assert.equal(rivals.filter((rival) => rival.isUs).length, 1);
    assert.equal(rivals.find((rival) => rival.isUs).name, 'Jax');
    assert.deepEqual(
      rivals.map((rival) => rival.rank),
      [1041, 1042, 1043, 1044, 1045, 1046, 1047],
    );
    assert.equal(rivals.find((rival) => rival.name === 'coolkids 2 0').founder, true);
  });

  it('falls back to a case-insensitive name match when nothing is highlighted', () => {
    const unhighlighted = {
      ...GROUP_PAGE,
      content: GROUP_PAGE.content.map((entry) => ({ ...entry, toHighlight: false })),
    };

    const result = parseGroupRank(buildPage(unhighlighted), 'jAx');
    assert.equal(result.ok, true);
    assert.equal(result.name, 'Jax');
    assert.equal(result.rank, 1044);
  });

  it('does not fall back to the highlighted group when the name does not match', () => {
    // Guards against silently publishing another group's numbers if the search
    // ever resolves to something other than the configured group.
    const result = parseGroupRank(buildPage(GROUP_PAGE), 'Not A Group');
    assert.equal(result.ok, false);
    assert.match(result.error, /was not on the returned page/);
  });

  it('reports a reason when the page has no flight payload at all', () => {
    const result = parseGroupRank('<!doctype html><html><body>nothing here</body></html>', 'Jax');
    assert.equal(result.ok, false);
    assert.match(result.error, /could not reassemble/);
  });

  it('reports a reason when the payload carries no group list', () => {
    const html = `<html><body><script>self.__next_f.push([1,${JSON.stringify('0:{"unrelated":true}\n')}])</script></body></html>`;

    const result = parseGroupRank(html, 'Jax');
    assert.equal(result.ok, false);
    assert.match(result.error, /no group list found/);
  });

  it('ignores unrelated objects that also start with a content array', () => {
    const payload =
      `self.__next_f.push([1,${JSON.stringify('0:{"content":["a decoy with no totalElements"]}\n')}]);` +
      `self.__next_f.push([1,${JSON.stringify(`1:${JSON.stringify({ groups: GROUP_PAGE })}`)}])`;

    const result = parseGroupRank(`<html><body><script>${payload}</script></body></html>`, 'Jax');
    assert.equal(result.ok, true);
    assert.equal(result.rank, 1044);
  });

  it('survives a chunk that will not decode', () => {
    const good = buildPage(GROUP_PAGE).replace('</script>', '');
    const html = `${good};self.__next_f.push([1,"unterminated\\])</script>`;

    const result = parseGroupRank(html, 'Jax');
    assert.equal(result.ok, true);
  });
});
