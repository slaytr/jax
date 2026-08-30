import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { renderStatsShell, writeStatsPages } from '../scripts/build-stats-pages.mjs';

const group = { name: 'Jax', tagline: 'Competitive Group Ironman' };
const player = { slug: 'melooms', name: 'Melooms' };

describe('renderStatsShell', () => {
  const html = renderStatsShell(player, group);

  it('bakes the slug into <body data-player> rather than relying on the URL', () => {
    assert.match(html, /<body data-player="melooms">/);
  });

  it('points assets two directories back up, not document-relative', () => {
    assert.match(html, /href="\.\.\/\.\.\/assets\/css\/styles\.css"/);
    assert.match(html, /src="\.\.\/\.\.\/assets\/js\/stats\.js"/);
  });

  it('never emits a root-absolute path (this is a project-page site, not domain root)', () => {
    assert.doesNotMatch(html, /(?:href|src)="\/[^/]/);
  });

  it('titles the page for the player, not just the group', () => {
    assert.match(html, /<title>Melooms · Jax stats<\/title>/);
  });
});

describe('writeStatsPages', () => {
  let rootDir;

  before(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'jax-stats-'));
  });

  after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('writes one index.html per roster player, under their own slug directory', async () => {
    const roster = { group, players: [player, { slug: 'bloyze', name: 'Bloyze' }] };
    const written = await writeStatsPages(rootDir, roster);

    assert.deepEqual(written, ['melooms', 'bloyze']);

    const melooms = await readFile(join(rootDir, 'stats', 'melooms', 'index.html'), 'utf8');
    assert.match(melooms, /data-player="melooms"/);

    const bloyze = await readFile(join(rootDir, 'stats', 'bloyze', 'index.html'), 'utf8');
    assert.match(bloyze, /data-player="bloyze"/);
  });
});
